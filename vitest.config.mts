import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Pure-function tests don't need module isolation; this avoids flaky
    // worker spawn crashes on slow Windows filesystems and speeds up runs.
    isolate: false,
    // This machine's worker forks crash intermittently (exit 0xC0000409);
    // sequential files are reliable and barely slower for this suite size.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
