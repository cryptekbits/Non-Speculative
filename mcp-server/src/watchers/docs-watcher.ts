import chokidar from "chokidar";
import { EventEmitter } from "events";
import { invalidateDocIndex } from "../utils/doc-index.js";

export interface WatcherEvents {
  doc_indexed: (file: string) => void;
  doc_updated: (file: string) => void;
  doc_removed: (file: string) => void;
  error: (error: Error) => void;
}

export interface WatcherOptions {
  debounceMs?: number;
  persistent?: boolean;
  ignored?: string[];
}

const DEFAULT_OPTIONS: Required<WatcherOptions> = {
  debounceMs: 1000,
  persistent: true,
  ignored: ["**/node_modules/**", "**/.git/**", "**/build/**"],
};

export class DocsWatcher extends EventEmitter {
  private watcher?: any;
  private docsPath: string;
  private options: Required<WatcherOptions>;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private onReindex?: () => void | Promise<void>;

  constructor(
    docsPath: string,
    onReindex?: () => void | Promise<void>,
    options?: WatcherOptions
  ) {
    super();
    this.docsPath = docsPath;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.onReindex = onReindex;
  }

  /**
   * Start watching for changes
   */
  start(): void {
    if (this.watcher) {
      console.error("⚠️  Watcher already started");
      return;
    }

    this.watcher = chokidar.watch("**/*.md", {
      cwd: this.docsPath,
      persistent: this.options.persistent,
      ignored: this.options.ignored,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    this.watcher
      .on("add", (path: string) => this.handleChange(path, "add"))
      .on("change", (path: string) => this.handleChange(path, "change"))
      .on("unlink", (path: string) => this.handleChange(path, "unlink"))
      .on("error", (error: Error) => this.handleError(error));

    console.error(`👀 Watching for .md changes in: ${this.docsPath}`);
  }

  /**
   * Handle file changes with debouncing
   */
  private handleChange(
    file: string,
    type: "add" | "change" | "unlink"
  ): void {
    // Clear existing debounce timer
    const existing = this.debounceTimers.get(file);
    if (existing) {
      clearTimeout(existing);
    }

    // Set new debounced handler
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(file);

      try {
        // Invalidate cache
        invalidateDocIndex(this.docsPath);

        // Trigger reindex if callback provided
        if (this.onReindex) {
          await this.onReindex();
        }

        // Emit appropriate event
        switch (type) {
          case "add":
            this.emit("doc_indexed", file);
            console.error(`✅ Indexed new doc: ${file}`);
            break;
          case "change":
            this.emit("doc_updated", file);
            console.error(`🔄 Updated doc: ${file}`);
            break;
          case "unlink":
            this.emit("doc_removed", file);
            console.error(`🗑️  Removed doc: ${file}`);
            break;
        }
      } catch (error) {
        this.handleError(error as Error);
      }
    }, this.options.debounceMs);

    this.debounceTimers.set(file, timer);
  }

  /**
   * Handle errors
   */
  private handleError(error: Error): void {
    console.error("❌ Watcher error:", error);
    this.emit("error", error);
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (!this.watcher) return;

    // Clear all pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    await this.watcher.close();
    this.watcher = undefined;
    console.error("🛑 Stopped watching for changes");
  }

  /**
   * Check if watcher is running
   */
  isRunning(): boolean {
    return this.watcher !== undefined;
  }
}

/**
 * Create and start a docs watcher
 */
export function createDocsWatcher(
  docsPath: string,
  onReindex?: () => void | Promise<void>,
  options?: WatcherOptions
): DocsWatcher {
  const watcher = new DocsWatcher(docsPath, onReindex, options);
  watcher.start();
  return watcher;
}

