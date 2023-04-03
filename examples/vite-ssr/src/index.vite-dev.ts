import type { IncomingMessage, ServerResponse } from "node:http";

import { Transform } from "node:stream";
import viteDevServer from "vavite/vite-dev-server";
import { renderToPipeableStream } from "react-dom/server";
import { createAppRoot } from "./server";

type Callback = (error: Error | null, chunk: string | null) => void;

/**
 * Stream-transform which adds the Vite HMR code to the initial server-rendered
 * chunk. The remaining suspended chunks will be sent as usual.
 */
function createViteDevHtmlTransform(path: string) {
  let transformed = false;

  return new Transform({
    transform(chunk: string, _encoding: string, callback: Callback) {
      if (!transformed) {
        // The first chunk should contain the full <head>
        transformed = true;

        // The path is used for some relative URLs/imports
        viteDevServer!.transformIndexHtml(path, chunk.toString()).then(
          (data) => callback(null, data),
          (error) => callback(error, null)
        );
      } else {
        callback(null, chunk);
      }
    },
  });
}

// All paths are relative to project root
const clientEntryPath = "/src/index.client.tsx";

// Since this is a handler, we cannot use any ExpressJS types
export default function handler(
  req: IncomingMessage,
  res: ServerResponse
): void {
  const stream = renderToPipeableStream(createAppRoot(), {
    // Vite uses module-bundling:
    bootstrapModules: [clientEntryPath],
    onShellReady() {
      res.setHeader("Content-Type", "text/html");

      // Pipe the stream through the development-mode transform
      stream.pipe(createViteDevHtmlTransform(req.url ?? "/")).pipe(res);
    },
    onShellError() {
      res.statusCode = 500;

      res.setHeader("Content-Type", "text/html");
      res.write("Error");
      res.end();
    },
  });
}
