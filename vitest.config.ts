import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Parity tests for the shared agent layer (2026-11-22, the owner's approval
 * conditions): the app's routes and the agent/MCP tools must call the same
 * shared services and enforce the same limits. Runs with `npm test`.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
