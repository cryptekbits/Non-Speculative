/**
 * HTTP/WebSocket bridge for MCP tools
 * Allows non-MCP agents to access documentation tools
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { WebSocketServer, WebSocket } from "ws";

// Enforce a maximum request body size to prevent memory exhaustion
const MAX_BODY_SIZE_BYTES = 1 * 1024 * 1024; // 1MB

class PayloadTooLargeError extends Error {
  constructor(message = "Payload too large") {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}

export interface HTTPServerConfig {
  port: number;
  host?: string;
}

export interface ToolHandler {
  name: string;
  handler: (args: any) => Promise<string>;
  description: string;
  inputSchema: any;
}

export class HTTPBridge {
  private config: HTTPServerConfig;
  private server: any;
  private wss: WebSocketServer | null = null;
  private tools: Map<string, ToolHandler> = new Map();
  private metrics = {
    requests: 0,
    errors: 0,
    totalLatency: 0,
    toolCalls: new Map<string, number>(),
  };

  constructor(config: HTTPServerConfig) {
    this.config = {
      host: config.host || "127.0.0.1",
      port: config.port,
    };
  }

  /**
   * Register a tool handler
   */
  registerTool(tool: ToolHandler): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Start HTTP server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res);
      });

      // WebSocket server for streaming
      this.wss = new WebSocketServer({ server: this.server });
      this.wss.on("connection", (ws) => {
        this.handleWebSocket(ws);
      });

      this.server.listen(this.config.port, this.config.host, () => {
        console.error(
          `🌐 HTTP bridge listening on http://${this.config.host}:${this.config.port}`
        );
        resolve();
      });

      this.server.on("error", reject);
    });
  }

  /**
   * Stop HTTP server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close();
      }
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle HTTP requests
   */
  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const startTime = Date.now();
    this.metrics.requests++;

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url || "/";

    try {
      if (url === "/healthz" && req.method === "GET") {
        this.handleHealth(res);
      } else if (url === "/metrics" && req.method === "GET") {
        this.handleMetrics(res);
      } else if (url === "/tools" && req.method === "GET") {
        this.handleListTools(res);
      } else if (url === "/tools/call" && req.method === "POST") {
        await this.handleCallTool(req, res);
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      }
    } catch (error) {
      this.metrics.errors++;
      if (error instanceof PayloadTooLargeError) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error.message }));
      } else {
        const errorMsg = error instanceof Error ? error.message : String(error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: errorMsg }));
      }
    } finally {
      this.metrics.totalLatency += Date.now() - startTime;
    }
  }

  /**
   * Handle health check
   */
  private handleHealth(res: ServerResponse): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        tools: this.tools.size,
        uptime: process.uptime(),
      })
    );
  }

  /**
   * Handle metrics
   */
  private handleMetrics(res: ServerResponse): void {
    const avgLatency =
      this.metrics.requests > 0
        ? this.metrics.totalLatency / this.metrics.requests
        : 0;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        requests: this.metrics.requests,
        errors: this.metrics.errors,
        avgLatency: avgLatency.toFixed(2),
        toolCalls: Object.fromEntries(this.metrics.toolCalls),
      })
    );
  }

  /**
   * Handle list tools
   */
  private handleListTools(res: ServerResponse): void {
    const tools = Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ tools }));
  }

  /**
   * Handle call tool
   */
  private async handleCallTool(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    // Pre-check Content-Length to fail fast on oversized payloads
    const contentLengthHeader = req.headers["content-length"];
    if (contentLengthHeader) {
      const headerValue = Array.isArray(contentLengthHeader)
        ? contentLengthHeader[0]
        : contentLengthHeader;
      const declaredLength = parseInt(headerValue, 10);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_SIZE_BYTES) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Payload too large" }));
        return;
      }
    }

    const body = await this.readBody(req);
    const { name, arguments: args } = JSON.parse(body);

    const tool = this.tools.get(name);
    if (!tool) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Tool not found: ${name}` }));
      return;
    }

    // Track tool usage
    this.metrics.toolCalls.set(
      name,
      (this.metrics.toolCalls.get(name) || 0) + 1
    );

    const result = await tool.handler(args);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        content: [{ type: "text", text: result }],
      })
    );
  }

  /**
   * Handle WebSocket connection
   */
  private handleWebSocket(ws: WebSocket): void {
    ws.on("message", async (data) => {
      try {
        const { name, arguments: args } = JSON.parse(data.toString());
        const tool = this.tools.get(name);

        if (!tool) {
          ws.send(JSON.stringify({ error: `Tool not found: ${name}` }));
          return;
        }

        const result = await tool.handler(args);
        ws.send(
          JSON.stringify({
            content: [{ type: "text", text: result }],
          })
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        ws.send(JSON.stringify({ error: errorMsg }));
      }
    });
  }

  /**
   * Read request body
   */
  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      req.on("data", (chunk) => {
        const bufferChunk: Buffer = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk);
        totalBytes += bufferChunk.length;
        if (totalBytes > MAX_BODY_SIZE_BYTES) {
          req.destroy();
          reject(new PayloadTooLargeError());
          return;
        }
        chunks.push(bufferChunk);
      });

      req.on("end", () => {
        try {
          const bodyStr = Buffer.concat(chunks).toString("utf8");
          resolve(bodyStr);
        } catch (e) {
          reject(e);
        }
      });

      req.on("error", reject);
    });
  }
}

/**
 * Create and start HTTP bridge
 */
export async function createHTTPBridge(
  config: HTTPServerConfig
): Promise<HTTPBridge> {
  const bridge = new HTTPBridge(config);
  await bridge.start();
  return bridge;
}

