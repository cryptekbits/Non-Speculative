import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.{test,spec}.ts'],
    environment: 'node',
    env: process.env,
  }
});

