/**
 * @jest-environment node
 */

import { Provider, Resume, createStore } from "..";
import { createEntry } from "../internal/entry";
import {
  REACT_STREAMING_SCRIPT,
  renderToStream,
} from "../internal/testutils.node";

describe("<Resume/>", () => {
  it("throws without a <Provider/>", async () => {
    const stream = renderToStream(<Resume />);

    await expect(stream).rejects.toEqual(
      new Error(`<Resume/> must be inside a <Provider/>.`),
    );

    expect(stream.errors).toEqual([
      new Error(`<Resume/> must be inside a <Provider/>.`),
    ]);
  });

  it("renders empty Map constructor without data", async () => {
    const store = createStore();
    const stream = renderToStream(
      <Provider store={store}>
        <Resume />
      </Provider>,
    );

    await expect(stream).resolves.toEqual(
      `<script async="">window.snapshot=new Map()</script><!--$--><!--/$-->`,
    );

    expect(stream.errors).toEqual([]);
  });

  it("renders Map with data entry", async () => {
    const store = createStore();

    store.data.set("test", { kind: "value", value: "the value" });

    const stream = renderToStream(
      <Provider store={store}>
        <Resume />
      </Provider>,
    );

    await expect(stream).resolves.toEqual(
      `<script async="">window.snapshot=new Map();window.snapshot.set("test",{"kind":"value","value":"the value"})</script><!--$--><!--/$-->`,
    );

    expect(stream.errors).toEqual([]);
  });

  it("renders Map with multiple data entries", async () => {
    const store = createStore();

    store.data.set("test", { kind: "value", value: "the value" });
    store.data.set("another", {
      kind: "value",
      value: { complex: ["data", 235, true] },
    });

    const stream = renderToStream(
      <Provider store={store}>
        <Resume />
      </Provider>,
    );

    await expect(stream).resolves.toEqual(
      `<script async="">window.snapshot=new Map();window.snapshot.set("test",{"kind":"value","value":"the value"});window.snapshot.set("another",{"kind":"value","value":{"complex":["data",235,true]}})</script><!--$--><!--/$-->`,
    );

    expect(stream.errors).toEqual([]);
  });

  it("renders suspended values as placeholders and then fills them in", async () => {
    let resolveWaiting: (str: string) => void;
    const store = createStore();
    const waiting = new Promise((resolve) => (resolveWaiting = resolve));

    store.data.set("test", { kind: "value", value: "the value" });
    // We have to create an entry so the data is properly updated
    store.data.set("another", createEntry(waiting));
    const stream = renderToStream(
      <Provider store={store}>
        <Resume />
      </Provider>,
    );

    await expect(stream.chunk()).resolves.toEqual(
      `<script async="">window.snapshot=new Map();window.snapshot.set("test",{"kind":"value","value":"the value"});window.snapshot.set("another",{"kind":"server-suspended","value":undefined})</script><!--$?--><template id="B:0"></template><!--/$-->`,
    );

    expect(stream.errors).toEqual([]);

    resolveWaiting!("foobar");

    await expect(stream).resolves.toEqual(
      `<script async="">window.snapshot=new Map();window.snapshot.set("test",{"kind":"value","value":"the value"});window.snapshot.set("another",{"kind":"server-suspended","value":undefined})</script><!--$?--><template id="B:0"></template><!--/$--><div hidden id="S:0"><script async="">window.snapshot.set("another",{"kind":"value","value":"foobar"})</script><!--$--><!--/$--></div>${REACT_STREAMING_SCRIPT}`,
    );

    expect(stream.errors).toEqual([]);
  });

  it("renders suspended values as undefined and then fills them in, even if they error", async () => {
    let rejectWaiting: (err: Error) => void;
    const store = createStore();
    const waiting = new Promise((_, reject) => (rejectWaiting = reject));

    store.data.set("test", { kind: "value", value: "the value" });
    // We have to create an entry so the data is properly updated
    store.data.set("another", createEntry(waiting));
    const stream = renderToStream(
      <Provider store={store}>
        <Resume />
      </Provider>,
    );

    await expect(stream.chunk()).resolves.toEqual(
      `<script async="">window.snapshot=new Map();window.snapshot.set("test",{"kind":"value","value":"the value"});window.snapshot.set("another",{"kind":"server-suspended","value":undefined})</script><!--$?--><template id="B:0"></template><!--/$-->`,
    );

    expect(stream.errors).toEqual([]);

    rejectWaiting!(new Error("asdf"));

    await expect(stream).resolves.toEqual(
      `<script async="">window.snapshot=new Map();window.snapshot.set("test",{"kind":"value","value":"the value"});window.snapshot.set("another",{"kind":"server-suspended","value":undefined})</script><!--$?--><template id="B:0"></template><!--/$--><div hidden id="S:0"><script async="">window.snapshot.set("another",{"kind":"error","value":{}})</script><!--$--><!--/$--></div>${REACT_STREAMING_SCRIPT}`,
    );

    // The error is not thrown in a component since we are actually not rendering the component with the error
    expect(stream.errors).toEqual([]);
  });

  it("renders multiple suspended values as undefined and then fills them in", async () => {
    let resolveWaiting1: (str: string) => void;
    let resolveWaiting2: (str: string) => void;
    let resolveWaiting3: (str: string) => void;
    const store = createStore();
    const waiting1 = new Promise((resolve) => (resolveWaiting1 = resolve));
    const waiting2 = new Promise((resolve) => (resolveWaiting2 = resolve));
    const waiting3 = new Promise((resolve) => (resolveWaiting3 = resolve));

    // start with 2
    store.data.set("wait1", createEntry(waiting1));
    store.data.set("wait2", createEntry(waiting2));

    const stream = renderToStream(
      <Provider store={store}>
        <Resume />
      </Provider>,
    );

    await expect(stream.chunk()).resolves.toEqual(
      `<script async="">window.snapshot=new Map();window.snapshot.set("wait1",{"kind":"server-suspended","value":undefined});window.snapshot.set("wait2",{"kind":"server-suspended","value":undefined})</script><!--$?--><template id="B:0"></template><!--/$-->`,
    );

    expect(stream.errors).toEqual([]);

    resolveWaiting1!("waiting 1 data");

    // This render also added more data
    store.data.set("baz", createEntry("the value"));
    store.data.set("wait3", createEntry(waiting3));

    // Grab a chunk, we have more
    await expect(stream.chunk()).resolves.toEqual(
      `<div hidden id="S:0"><script async="">window.snapshot.set("wait1",{"kind":"value","value":"waiting 1 data"});window.snapshot.set("baz",{"kind":"value","value":"the value"});window.snapshot.set("wait3",{"kind":"server-suspended","value":undefined})</script><!--$?--><template id="B:1"></template><!--/$--></div>${REACT_STREAMING_SCRIPT}`,
    );

    expect(stream.errors).toEqual([]);

    resolveWaiting2!("should");
    resolveWaiting3!("be simultaneous");

    expect(stream.errors).toEqual([]);

    await expect(stream.chunk()).resolves.toEqual(
      `<div hidden id="S:1"><script async="">window.snapshot.set("wait2",{"kind":"value","value":"should"});window.snapshot.set("wait3",{"kind":"value","value":"be simultaneous"})</script><!--$--><!--/$--></div><script>$RC("B:1","S:1")</script>`,
    );
    await expect(stream).resolves.toEqual(
      `<script async="">window.snapshot=new Map();window.snapshot.set("wait1",{"kind":"server-suspended","value":undefined});window.snapshot.set("wait2",{"kind":"server-suspended","value":undefined})</script><!--$?--><template id="B:0"></template><!--/$--><div hidden id="S:0"><script async="">window.snapshot.set("wait1",{"kind":"value","value":"waiting 1 data"});window.snapshot.set("baz",{"kind":"value","value":"the value"});window.snapshot.set("wait3",{"kind":"server-suspended","value":undefined})</script><!--$?--><template id="B:1"></template><!--/$--></div>${REACT_STREAMING_SCRIPT}<div hidden id="S:1"><script async="">window.snapshot.set("wait2",{"kind":"value","value":"should"});window.snapshot.set("wait3",{"kind":"value","value":"be simultaneous"})</script><!--$--><!--/$--></div><script>$RC("B:1","S:1")</script>`,
    );

    expect(stream.errors).toEqual([]);
  });
});
