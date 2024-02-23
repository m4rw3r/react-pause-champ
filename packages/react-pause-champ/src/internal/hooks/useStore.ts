import type { Store } from "../store";

import { createContext, useContext } from "react";

/**
 * @internal
 */
export const Context = createContext<Store | null>(null);

/**
 * @internal
 */
export function useStore(componentName: string): Store {
  const store = useContext(Context);

  if (!store) {
    throw new Error(`${componentName} must be inside a <Provider/>.`);
  }

  return store;
}
