/**
 * @jest-environment node
 */

import type { ReactNode } from "react";

import { Writable } from "node:stream";
import { createElement } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { canUseDOM, useChamp } from "./useChamp";

type Callback = () => void;

interface StreamParts extends Promise<string> {
  buffer: Array<string>;
}

function renderToStream(component: ReactNode): StreamParts {
  const buffer: Array<string> = [];
  const promise: any = new Promise<string>((resolve, reject) => {
    const stream = new Writable();

    stream._write = function (
      chunk: string,
      _encoding: string,
      callback: Callback
    ) {
      buffer.push(chunk.toString());

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

  return promise;
}

describe("canUseDOM()", () => {
  it("should return false in node", () => {
    expect(canUseDOM()).toBe(false);
  });
});

describe("useChamp()", () => {
  it("throws when no <Provider/> is used", async () => {
    const MyComponent = () => {
      const [data] = useChamp("test", 123);

      return <p>{data}</p>;
    };

    await expect(renderToStream(<MyComponent />)).rejects.toEqual(
      new Error("useChamp() must be inside a <Provider/>.")
    );
  });
});

// TODO: More tests
