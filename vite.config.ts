import vinext from "vinext";
import rsc from "@vitejs/plugin-rsc";
import { defineConfig } from "vite";

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      watch: {
        // Catalogue PDFs, generated exports and local persistence are data,
        // not source files. Watching them can delay startup by several minutes.
        ignored: [
          "**/材料型录/**",
          "**/outputs/**",
          "**/work/**",
          "**/.wrangler/**",
          "**/dist/**",
          "**/build/**",
        ],
      },
    },
    // Keep one React dispatcher across Vinext, RSC and Cloudflare SSR.
    resolve: {
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
    plugins: [
      vinext({ rsc: false }),
      rsc({
        entries: {
          rsc: "virtual:vinext-rsc-entry",
          ssr: "virtual:vinext-app-ssr-entry",
          client: "virtual:vinext-app-browser-entry",
        },
      }),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      }),
    ],
  };
});
