import type { Request, Response } from "express";

import express from "express";
import { renderToPipeableStream } from "react-dom/server";
import { createAppRoot } from "./server";

// @ts-ignore We build server after client, so this is accessible
import { default as manifest } from "../dist/client/manifest.json";

function handler(_req: Request, res: Response): void {
  const { "src/client/index.tsx": clientEntryPath } = manifest;

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

app.use(handler);

app.listen(3000);
