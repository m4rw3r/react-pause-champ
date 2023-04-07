import type { Request, Response } from "express";

import * as express from "express";
import { fileURLToPath } from "node:url";
import { renderToPipeableStream } from "react-dom/server";
import { createAppRoot } from "./server";

// We build server after client, so the manifest is accessible
// See tsconfig.json compilerOptions.paths for actual path and typings.d.ts:
import { default as manifest } from "@manifest";

// Find the entrypoint
const clientEntryPath = Object.values(manifest).find((file) => file.isEntry);

if (!clientEntryPath) {
  throw new Error("Client entrypoint was not found in client/manifest.json");
}

const handler = (_req: Request, res: Response): void => {
  const stream = renderToPipeableStream(createAppRoot(), {
    // Production has normal JavaScript bundles:
    bootstrapScripts: [clientEntryPath.file],
    onShellReady() {
      res.setHeader("Content-Type", "text/html");

      stream.pipe(res);
    },
    onShellError() {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/html");
      res.send("Error");
    },
  });
};

const app = express();

// Serve static assets, production should preferably serve these through a
// reverse proxy or similar
app.use(express.static(fileURLToPath(new URL("../client", import.meta.url))));
// Our application handler
app.use(handler);

app.listen(3000);
