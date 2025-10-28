#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function getVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf8")
    );
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function main(argv: string[]): void {
  const arg = argv[2];
  if (arg === "--version" || arg === "-v") {
    console.log(getVersion());
    return;
  }
  if (arg === "--help" || arg === "-h") {
    console.log("Usage: non-speculative [--help] [--version]");
    return;
  }
  console.log("non-speculative CLI is installed.");
}

main(process.argv);


