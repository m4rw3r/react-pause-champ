import { createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import {
  Provider,
  Snapshot,
  Store,
  fromSnapshot,
} from "@m4rw3r/react-pause-champ";
import { App } from "./App";

// Declare our application globals
declare global {
  interface Window {
    // The store we populate in this module
    store: Store;
    // Snapshot from <Resume/>, should always be accessible, or undefined,
    // which is also fine if no states are resuming
    snapshot?: Snapshot;
  }
}

// Create a store from a possibly empty snapshot we received from the server
window.store = fromSnapshot(window.snapshot);

const root = document.getElementById("app-root");

if (!root) {
  throw new Error("Failed to obtain #app-root element");
}

// Do not hydrate the full HTML-document, just the application-part, this
// is recommended by React
hydrateRoot(
  root,
  <Provider store={window.store}>
    <App />
  </Provider>
);
