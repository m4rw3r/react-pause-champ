import react from "@vitejs/plugin-react";
import vavite from "vavite";
import tsconfigPaths from "vite-tsconfig-paths";

export default {
  buildSteps: [
    {
      name: "client",
      config: {
        build: {
          outDir: "dist/client",
          manifest: true,
          rollupOptions: { input: "src/index.client.tsx" },
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
    // To be able to load the manifest path
    tsconfigPaths(),
    react(),
    vavite({
      // Production:
      serverEntry: "src/index.node.ts",
      // Development:
      handlerEntry: "src/index.vite-dev.ts",
      serveClientAssetsInDev: true,
      // If we want to use a server-entry for both, remove the `handlerEntry`
      // and use something like the following:
      // serverEntry: mode === "development" ? "src/index.vite-dev.ts" : "src/index.node.ts",
    }),
  ],
};
