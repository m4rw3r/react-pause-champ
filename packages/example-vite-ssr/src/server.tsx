import type { JSX } from "react";

import { Provider, Resume, createStore } from "@m4rw3r/react-pause-champ";
import { App } from "./App";

// Full HTML skeleton
export function Html(): JSX.Element {
  return (
    <html>
      <head>
        <title>My test app</title>
      </head>
      <body>
        {/* React recommends to not mount the application directly in body */}
        <div id="app-root">
          <App />
        </div>
      </body>
    </html>
  );
}

export function createAppRoot(): JSX.Element {
  return (
    <Provider store={createStore()}>
      <Html />
      <Resume identifier={"snapshot"} />
    </Provider>
  );
}
