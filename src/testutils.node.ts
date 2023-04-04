import type { ReactNode } from "react";

import { Writable } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";

export type Callback = () => void;

export interface StreamParts extends Promise<string> {
  chunk: () => Promise<string>;
  buffer: Array<string>;
}

/**
 * Renders a react component to a promise which resolves when the promise
 * completes. Partial chunks can be obtained using the added `chunk` method,
 * and current chunks sent can be found in `buffer`.
 */
export function renderToStream(component: ReactNode): StreamParts {
  let nextChunk: Promise<string> | undefined;
  let resolveNext: ((chunk: string) => void) | undefined;
  const buffer: Array<string> = [];
  const promise: any = new Promise<string>((resolve, reject) => {
    const stream = new Writable();

    stream._write = function (
      chunk: string,
      _encoding: string,
      callback: Callback
    ) {
      const chunkStr = chunk.toString();
      buffer.push(chunkStr);

      if (resolveNext) {
        resolveNext(chunkStr);

        nextChunk = undefined;
        resolveNext = undefined;
      }

      callback();
    };

    stream._final = function (callback: Callback) {
      resolve(buffer.join(""));

      callback();
    };

    const { pipe } = renderToPipeableStream(component, {
      onShellReady() {
        pipe(stream);
      },
      onShellError(error) {
        reject(error);
      },
      onError(error) {
        reject(error);
      },
    });
  });

  promise.buffer = buffer;

  promise.chunk = function (): Promise<string> {
    if (!nextChunk) {
      nextChunk = new Promise((resolve) => {
        // Chunks cannot be rejected, React instead propagates the error to the
        // client if the shell is already rendered
        resolveNext = resolve;
      });
    }

    return nextChunk;
  };

  return promise;
}
