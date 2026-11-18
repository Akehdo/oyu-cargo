import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Mounted under /admin on the OYU Cargo platform (the cabinet owns "/").
  base: "/admin/",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: process.env.VITE_USE_POLLING === "true",
    },
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API_TARGET || "http://localhost:8080",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
