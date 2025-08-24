import type { ReactNode } from "react";

import { Writable } from "node:stream";
import { version as reactVersion } from "react";
import { renderToPipeableStream } from "react-dom/server";

let reactStreamingScript;
/* c8 ignore start */
if (reactVersion.startsWith("19.")) {
  reactStreamingScript = `<script>$RC=function(b,c,e){c=document.getElementById(c);c.parentNode.removeChild(c);var a=document.getElementById(b);if(a){b=a.previousSibling;if(e)b.data="$!",a.setAttribute("data-dgst",e);else{e=b.parentNode;a=b.nextSibling;var f=0;do{if(a&&8===a.nodeType){var d=a.data;if("/$"===d)if(0===f)break;else f--;else"$"!==d&&"$?"!==d&&"$!"!==d||f++}d=a.nextSibling;e.removeChild(a);a=d}while(a);for(;c.firstChild;)e.insertBefore(c.firstChild,a);b.data="$"}b._reactRetry&&b._reactRetry()}};$RC("B:0","S:0")</script>`;
} else if (reactVersion.startsWith("18.")) {
  reactStreamingScript = `<script>function $RC(a,b){a=document.getElementById(a);b=document.getElementById(b);b.parentNode.removeChild(b);if(a){a=a.previousSibling;var f=a.parentNode,c=a.nextSibling,e=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d)if(0===e)break;else e--;else"$"!==d&&"$?"!==d&&"$!"!==d||e++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;b.firstChild;)f.insertBefore(b.firstChild,c);a.data="$";a._reactRetry&&a._reactRetry()}};$RC("B:0","S:0")</script>`;
} else {
  throw new Error(`Unknown react version ${reactVersion}`);
}
/* c8 ignore stop */

export type Callback = () => void;

export interface StreamParts extends Promise<string> {
  chunk: () => Promise<string>;
  buffer: string[];
  errors: unknown[];
}

export const REACT_STREAMING_SCRIPT = reactStreamingScript;

/**
 * Renders a react component to a promise which resolves when the promise
 * completes. Partial chunks can be obtained using the added `chunk` method,
 * and current chunks sent can be found in `buffer`.
 */
export function renderToStream(component: ReactNode): StreamParts {
  let nextChunk: Promise<string> | undefined;
  let resolveNext: ((chunk: string) => void) | undefined;
  const buffer: string[] = [];
  const errors: unknown[] = [];
  const promise = new Promise<string>((resolve, reject) => {
    const stream = new Writable();

    stream._write = function (
      chunk: string | Buffer,
      _encoding: string,
      callback: Callback,
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

    const result = renderToPipeableStream(component, {
      onShellReady() {
        result.pipe(stream);
      },
      onShellError(error) {
        reject(error);
      },
      onError(error) {
        errors.push(error);

        reject(error);
      },
    });
  }) as StreamParts;

  promise.buffer = buffer;
  promise.errors = errors;

  promise.chunk = function (): Promise<string> {
    nextChunk ??= new Promise((resolve) => {
      // Chunks cannot be rejected, React instead propagates the error to the
      // client if the shell is already rendered
      resolveNext = resolve;
    });

    return nextChunk;
  };

  return promise;
}
