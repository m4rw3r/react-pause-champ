/**
 * @jest-environment node
 */

import { createElement } from "react";
import { Provider, Resume, createStore } from "..";
import { newEntry } from "../entry";
import { renderToStream } from "../testutils.node";

describe("<Resume/>", () => {
  it("throws without a <Provider/>", async () => {
    await expect(renderToStream(<Resume />)).rejects.toEqual(
      new Error(`<Resume/> must be inside a <Provider/>.`)
    );
  });

  it("renders empty Map constructor without data", async () => {
    const store = createStore();

    await expect(
      renderToStream(
        <Provider store={store}>
          <Resume />
        </Provider>
      )
    ).resolves.toEqual(
      `<script defer="">window.snapshot=new Map()</script><!--$--><!--/$-->`
    );
  });

  it("renders Map with data entry", async () => {
    const store = createStore();

    store.data.set("test", { kind: "value", value: "the value" });

    await expect(
      renderToStream(
        <Provider store={store}>
          <Resume />
        </Provider>
      )
    ).resolves.toEqual(
      `<script defer="">window.snapshot=new Map();window.snapshot.set("test",{"kind":"value","value":"the value"})</script><!--$--><!--/$-->`
    );
  });

  it("renders Map with multiple data entries", async () => {
    const store = createStore();

    store.data.set("test", { kind: "value", value: "the value" });
    store.data.set("another", {
      kind: "value",
      value: { complex: ["data", 235, true] },
    });

    await expect(
      renderToStream(
        <Provider store={store}>
          <Resume />
        </Provider>
      )
    ).resolves.toEqual(
      `<script defer="">window.snapshot=new Map();window.snapshot.set("test",{"kind":"value","value":"the value"});window.snapshot.set("another",{"kind":"value","value":{"complex":["data",235,true]}})</script><!--$--><!--/$-->`
    );
  });

  it("renders suspended values as undefined and then fills them in", async () => {
    let resolveWaiting;
    const store = createStore();
    const waiting = new Promise((resolve) => (resolveWaiting = resolve));

    store.data.set("test", { kind: "value", value: "the value" });
    // We have to create an entry so the data is properly updated
    store.data.set("another", newEntry(waiting));
    const stream = renderToStream(
      <Provider store={store}>
        <Resume />
      </Provider>
    );

    await expect(stream.chunk()).resolves.toEqual(
      `<script defer="">window.snapshot=new Map();window.snapshot.set("test",{"kind":"value","value":"the value"});window.snapshot.set("another",undefined)</script><!--$?--><template id="B:0"></template><!--/$-->`
    );

    resolveWaiting("foobar");

    await expect(stream).resolves.toEqual(
      `<script defer="">window.snapshot=new Map();window.snapshot.set("test",{"kind":"value","value":"the value"});window.snapshot.set("another",undefined)</script><!--$?--><template id="B:0"></template><!--/$--><div hidden id="S:0"><script defer="">window.snapshot.set("another",{"kind":"value","value":"foobar"})</script><!--$--><!--/$--></div><script>function $RC(a,b){a=document.getElementById(a);b=document.getElementById(b);b.parentNode.removeChild(b);if(a){a=a.previousSibling;var f=a.parentNode,c=a.nextSibling,e=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d)if(0===e)break;else e--;else"$"!==d&&"$?"!==d&&"$!"!==d||e++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;b.firstChild;)f.insertBefore(b.firstChild,c);a.data="$";a._reactRetry&&a._reactRetry()}};$RC("B:0","S:0")</script>`
    );
  });

  it("renders multiple suspended values as undefined and then fills them in", async () => {
    let resolveWaiting1;
    let resolveWaiting2;
    let resolveWaiting3;
    const store = createStore();
    const waiting1 = new Promise((resolve) => (resolveWaiting1 = resolve));
    const waiting2 = new Promise((resolve) => (resolveWaiting2 = resolve));
    const waiting3 = new Promise((resolve) => (resolveWaiting3 = resolve));

    // start with 2
    store.data.set("wait1", newEntry(waiting1));
    store.data.set("wait2", newEntry(waiting2));

    const stream = renderToStream(
      <Provider store={store}>
        <Resume />
      </Provider>
    );

    await expect(stream.chunk()).resolves.toEqual(
      `<script defer="">window.snapshot=new Map();window.snapshot.set("wait1",undefined);window.snapshot.set("wait2",undefined)</script><!--$?--><template id="B:0"></template><!--/$-->`
    );

    resolveWaiting1("waiting 1 data");

    // This render also added more data
    store.data.set("baz", newEntry("the value"));
    store.data.set("wait3", newEntry(waiting3));

    // Grab a chunk, we have more
    await expect(stream.chunk()).resolves.toEqual(
      `<div hidden id="S:0"><script defer="">window.snapshot.set("wait1",{"kind":"value","value":"waiting 1 data"});window.snapshot.set("baz",{"kind":"value","value":"the value"});window.snapshot.set("wait3",undefined)</script><!--$?--><template id="B:1"></template><!--/$--></div><script>function $RC(a,b){a=document.getElementById(a);b=document.getElementById(b);b.parentNode.removeChild(b);if(a){a=a.previousSibling;var f=a.parentNode,c=a.nextSibling,e=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d)if(0===e)break;else e--;else"$"!==d&&"$?"!==d&&"$!"!==d||e++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;b.firstChild;)f.insertBefore(b.firstChild,c);a.data="$";a._reactRetry&&a._reactRetry()}};$RC("B:0","S:0")</script>`
    );

    resolveWaiting2("should");
    resolveWaiting3("be simultaneous");

    await expect(stream.chunk()).resolves.toEqual(
      `<div hidden id="S:1"><script defer="">window.snapshot.set("wait2",{"kind":"value","value":"should"});window.snapshot.set("wait3",{"kind":"value","value":"be simultaneous"})</script><!--$--><!--/$--></div><script>$RC("B:1","S:1")</script>`
    );
    await expect(stream).resolves.toEqual(
      `<script defer="">window.snapshot=new Map();window.snapshot.set("wait1",undefined);window.snapshot.set("wait2",undefined)</script><!--$?--><template id="B:0"></template><!--/$--><div hidden id="S:0"><script defer="">window.snapshot.set("wait1",{"kind":"value","value":"waiting 1 data"});window.snapshot.set("baz",{"kind":"value","value":"the value"});window.snapshot.set("wait3",undefined)</script><!--$?--><template id="B:1"></template><!--/$--></div><script>function $RC(a,b){a=document.getElementById(a);b=document.getElementById(b);b.parentNode.removeChild(b);if(a){a=a.previousSibling;var f=a.parentNode,c=a.nextSibling,e=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d)if(0===e)break;else e--;else"$"!==d&&"$?"!==d&&"$!"!==d||e++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;b.firstChild;)f.insertBefore(b.firstChild,c);a.data="$";a._reactRetry&&a._reactRetry()}};$RC("B:0","S:0")</script><div hidden id="S:1"><script defer="">window.snapshot.set("wait2",{"kind":"value","value":"should"});window.snapshot.set("wait3",{"kind":"value","value":"be simultaneous"})</script><!--$--><!--/$--></div><script>$RC("B:1","S:1")</script>`
    );
  });
});
