import { defineConfig } from "vite";

export default defineConfig({
  root: "browser",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    port: 4000,
    strictPort: true,
  },
});
