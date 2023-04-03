import type { Request, Response } from "express";

import express from "express";
import { fileURLToPath } from "node:url";
import { renderToPipeableStream } from "react-dom/server";
import { createAppRoot } from "./server";

// @ts-ignore We build server after client, so this is accessible
import { default as manifest } from "../dist/client/manifest.json";

// All paths are relative to project root
const { "src/index.client.tsx": clientEntryPath } = manifest;

function handler(_req: Request, res: Response): void {
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
}

const app = express();

// Serve static assets, production should preferably serve these through a
// reverse proxy or similar
app.use(express.static(fileURLToPath(new URL("../client", import.meta.url))));
// Our application handler
app.use(handler);

app.listen(3000);
