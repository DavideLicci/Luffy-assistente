import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const port = Number(process.env.PORT ?? 3000);
const apiPort = Number(process.env.API_PORT ?? 8080);
const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  plugins: [react()],
  base: basePath,
  server: {
    port,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: "dist/public",
    emptyOutDir: true
  }
});
