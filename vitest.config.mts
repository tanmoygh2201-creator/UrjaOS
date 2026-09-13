import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Pure-function tests don't need module isolation; this avoids flaky
    // worker spawn crashes on slow Windows filesystems and speeds up runs.
    isolate: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
