import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // The platform root; the admin panel (crm-frontend) lives under /admin/.
  base: "/",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5174,
    strictPort: true,
    watch: {
      usePolling: process.env.VITE_USE_POLLING === "true",
    },
    proxy: {
      // In development the admin panel runs on its own Vite server (5173);
      // proxying it keeps one origin, so both apps share the session.
      "/admin": {
        target: process.env.VITE_DEV_ADMIN_TARGET || "http://localhost:5173",
        changeOrigin: false,
        ws: true,
        // Vite serves its base only with a trailing slash; nginx accepts both.
        rewrite: (path) => path.replace(/^\/admin(?=$|\?)/, "/admin/"),
      },
      "/api": {
        target: process.env.VITE_DEV_API_TARGET || "http://localhost:8080",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  preview: {
    port: 4174,
  },
});
