import { defineConfig, loadEnv } from "vite";
import viteReact from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // A production (deployment) build must point at the Railway API. Failing
  // here keeps a deployed frontend from silently calling localhost or its own
  // origin. Development falls back to the local API in src/lib/api.ts.
  if (mode === "production") {
    const apiUrl = loadEnv(mode, process.cwd(), "VITE_").VITE_API_URL?.trim().replace(/\/+$/, "");
    if (!apiUrl) {
      throw new Error("VITE_API_URL is required for a production build (https://api.cotizalupa.com).");
    }
    try {
      const parsed = new URL(apiUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    } catch {
      throw new Error("VITE_API_URL must be an absolute http(s) URL (https://api.cotizalupa.com).");
    }
  }
  return {
    resolve: { tsconfigPaths: true },
    plugins: [viteReact()],
    build: { outDir: "dist" },
    server: {
      // Fixed port with no fallback: silently moving would break CORS
      // (PUBLIC_APP_URL) and checkout return URLs.
      port: 3002,
      strictPort: true,
    },
  };
});
