import type { Request, Response } from "express";

import { Transform } from "node:stream";
import viteDevServer from "vavite/vite-dev-server";
import { renderToPipeableStream } from "react-dom/server";
import { createAppRoot } from ".";

type Callback = (error: Error | null, chunk: string | null) => void;

function createViteDevHtmlTransform() {
  let transformed = false;

  return new Transform({
    transform(chunk: string, _encoding: string, callback: Callback) {
      if (!transformed) {
        transformed = true;

        viteDevServer!.transformIndexHtml("ASDF", chunk.toString()).then(
          (data) => callback(null, data),
          (error) => callback(error, null)
        );
      } else {
        callback(null, chunk);
      }
    },
  });
}

export default function handler(_req: Request, res: Response): void {
  const clientEntryPath = "src/client/index.tsx";

  const stream = renderToPipeableStream(createAppRoot(), {
    // Vite uses module-bundling:
    bootstrapModules: [clientEntryPath],
    onShellReady() {
      res.setHeader("Content-Type", "text/html");

      stream.pipe(createViteDevHtmlTransform()).pipe(res);
    },
    onShellError() {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/html");
      res.send("Error");
    },
  });
}
