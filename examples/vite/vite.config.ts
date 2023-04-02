import react from "@vitejs/plugin-react";
import vavite from "vavite";

export default {
  buildSteps: [
    {
      name: "client",
      config: {
        build: {
          outDir: "dist/client",
          manifest: true,
          rollupOptions: { input: "src/client/index.tsx" },
        },
      },
    },
    {
      name: "server",
      config: {
        build: {
          ssr: true,
          outDir: "dist/server",
        },
      },
    },
  ],
  plugins: [
    react(),
    vavite({
      // Production:
      serverEntry: "src/server/node.ts",
      // Development:
      handlerEntry: "src/server/vite-dev.ts",
      serveClientAssetsInDev: true,
    }),
  ],
};
