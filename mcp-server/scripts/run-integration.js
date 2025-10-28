#!/usr/bin/env node
import 'dotenv/config';
import { spawnSync } from 'node:child_process';

const args = ['--run', '-c', 'vitest.config.ts', '--dir', 'tests/integration'];
const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vitest', ...args], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);


