import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@runtime": resolve(__dirname, "runtime"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/js/**/*.test.ts"],
  },
});
