import { createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { Provider, fromSnapshot } from "@m4rw3r/react-pause-champ";
import { App } from "./App";

// @ts-ignore Snapshot should always be accessible, or undefined, which is
// also fine if no states are resuming
const store = fromSnapshot(snapshot);
const root = document.getElementById("app-root");

if (!root) {
  throw new Error("Failed to obtain #app-root element");
}

hydrateRoot(
  root,
  <Provider store={store}>
    <App />
  </Provider>
);
