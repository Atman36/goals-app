import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors the "@/*" path from tsconfig.json minimally — only alias tests need.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
