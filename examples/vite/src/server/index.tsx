import { createElement } from "react";
import { Provider, Resume, createStore } from "@m4rw3r/react-pause-champ";
import { Html } from "..";

export function createAppRoot(): JSX.Element {
  return (
    <Provider store={createStore()}>
      <Html />
      <Resume identifier={"snapshot"} />
    </Provider>
  );
}
