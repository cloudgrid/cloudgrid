import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const bffTarget = env.CLOUDGRID_DEV_BFF_URL || "http://localhost:3000";
  const brandModule = env.CLOUDGRID_FRONTEND_BRAND_MODULE
    ? new URL(env.CLOUDGRID_FRONTEND_BRAND_MODULE, import.meta.url).pathname
    : new URL("./src/brand/brand.ts", import.meta.url).pathname;

  return {
    build: {
      outDir: "../backend/public",
      emptyOutDir: true,
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@cloudgrid/brand": brandModule,
        "@": new URL("./src", import.meta.url).pathname,
      },
    },
    server: {
      port: Number(env.CLOUDGRID_FRONTEND_DEV_PORT || "5173"),
      strictPort: true,
      proxy: {
        "/auth": {
          target: bffTarget,
          changeOrigin: true,
        },
        "/graphql": {
          target: bffTarget,
          changeOrigin: true,
        },
        "/api": {
          target: bffTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
