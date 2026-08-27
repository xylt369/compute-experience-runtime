import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(rootDir, "playground"),
  resolve: {
    alias: {
      "@compute-experience/core": resolve(rootDir, "packages/core/src"),
      "@compute-experience/renderers": resolve(rootDir, "packages/renderers/src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["../tests/js/**/*.test.ts"],
    alias: {
      "@compute-experience/core": resolve(rootDir, "packages/core/src"),
      "@compute-experience/renderers": resolve(rootDir, "packages/renderers/src"),
    },
  },
});
