# D.Coder MCP Documentation Server

Context-aware documentation search for the D.Coder project.

## Installation

1. **Install dependencies:**
   ```bash
   cd mcp-server
   npm install
   ```

2. **Build the server:**
   ```bash
   npm run build
   ```

3. **Configure Claude Code:**
   
   Edit your Claude Code configuration file:
   ```bash
   # macOS/Linux
   code ~/.config/claude-code/mcp_config.json
   
   # Windows
   code %APPDATA%\claude-code\mcp_config.json
   ```

   Add the server configuration using **command-line arguments** (recommended):
   
   **macOS/Linux:**
   ```json
   {
     "mcpServers": {
       "dcoder-docs": {
         "command": "node",
         "args": [
           "/full/path/to/mcp-server/build/index.js",
           "--docs-path",
           "/full/path/to/your/dcoder/project"
         ]
       }
     }
   }
   ```
   
   **Windows:**
   ```json
   {
     "mcpServers": {
       "dcoder-docs": {
         "command": "node",
         "args": [
           "C:\\Code\\Non-Speculative\\mcp-server\\build\\index.js",
           "--docs-path",
           "C:\\Code\\Non-Speculative"
         ]
       }
     }
   }
   ```
   
   **Alternative formats:**
   ```json
   // Short flag format
   "args": ["/path/to/build/index.js", "-d", "/path/to/project"]
   
   // Equals format
   "args": ["/path/to/build/index.js", "--docs-path=/path/to/project"]
   
   // Positional argument
   "args": ["/path/to/build/index.js", "/path/to/project"]
   ```
   
   **Legacy environment variable approach** (still supported):
   ```json
   {
     "mcpServers": {
       "dcoder-docs": {
         "command": "node",
         "args": ["/path/to/mcp-server/build/index.js"],
         "env": {
           "PROJECT_ROOT": "/path/to/your/dcoder/project"
         }
       }
     }
   }
   ```

   **Important:** 
   - Replace with absolute paths! Use double backslashes on Windows in JSON.
   - CLI arguments take precedence over environment variables.
   - The server will log the resolved documentation path when starting.

4. **Restart Claude Code**

## Available Tools

### 1. `get_architecture_context`
Search documentation for relevant context.

**Example:**
```
Use get_architecture_context with query="semantic cache implementation" and release="R2"
```

### 2. `compare_releases`
Compare how features evolved across releases.

**Example:**
```
Use compare_releases with feature="authentication" and releases=["R1", "R2", "R3"]
```

### 3. `verify_implementation_readiness`
Pre-flight check before implementing.

**Example:**
```
Use verify_implementation_readiness with feature="prompt-encryption" and release="R2"
```

### 4. `get_service_dependencies`
Map service relationships.

**Example:**
```
Use get_service_dependencies with service="prompt-gateway" and release="R2"
```

## Troubleshooting

**Server not showing up in Claude Code:**
- Check paths are absolute (no `~` or relative paths)
- Verify `build/index.js` exists after running `npm run build`
- Check Claude Code logs: `~/.config/claude-code/logs/` (macOS/Linux) or `%APPDATA%\claude-code\logs\` (Windows)

**No documentation found:**
- Check the logs for "Documentation path: ..." to see which path is being used
- Verify the documentation path points to the correct location
- Ensure docs are in `<docs-path>/mnt/project/*.md` format
- Expected filename pattern: `R1-ARCHITECTURE.md`, `R2-PRD.md`, etc.
- Try running: `dir "<path>\mnt\project\R*.md"` (Windows) or `ls <path>/mnt/project/R*.md` (macOS/Linux)

**Documentation path precedence:**
The server resolves the documentation path in the following order (first match wins):
1. `--docs-path=<path>` or `--docs-path <path>` command-line argument
2. `-d <path>` command-line argument
3. Positional argument (first non-flag argument)
4. `PROJECT_ROOT` environment variable
5. Current working directory (`process.cwd()`)

**Development mode (auto-rebuild):**
```bash
npm run watch
```

## File Structure

```
mcp-server/
├── package.json          # Node.js configuration
├── tsconfig.json         # TypeScript configuration
├── build/                # Compiled JavaScript (auto-generated)
│   └── index.js         # Main server entry point
├── src/
│   ├── index.ts         # MCP server implementation
│   ├── tools/           # Tool implementations
│   │   ├── architecture-context.ts
│   │   ├── release-comparison.ts
│   │   ├── implementation-readiness.ts
│   │   └── service-dependencies.ts
│   └── utils/           # Utility functions
│       ├── doc-parser.ts        # Document parsing
│       └── semantic-search.ts   # Search and ranking
└── README.md            # This file
```

## How It Works

1. **Documentation Parsing**: The server scans `$PROJECT_ROOT/mnt/project/` for markdown files matching pattern `R#-DOCTYPE.md`
2. **Semantic Search**: Queries are scored based on heading matches, content matches, and term frequency
3. **Context-Aware Results**: Returns only the most relevant sections to avoid overwhelming the AI context
4. **MCP Protocol**: Integrates seamlessly with Claude Code through the Model Context Protocol

## Usage in Claude Code

Once configured, you can use these commands in your Claude Code conversations:

```
"Before implementing semantic cache, use get_architecture_context to find R2 documentation"

"Use verify_implementation_readiness for prompt-encryption in R2"

"Compare how authentication evolved from R1 to R3"

"Show me dependencies for the prompt-gateway service in R2"
```

The server will automatically search your docs and return only relevant sections, keeping context manageable.

