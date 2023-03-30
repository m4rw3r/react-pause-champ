import { ReactNode, createContext, createElement } from "react";

import { Store } from "../store";

/**
 * Properties for creating a <Provider/> component.
 */
export interface ProviderProps {
  /**
   * The Store instance for the application.
   */
  store: Store;
  /**
   * Nested JSX-elements.
   */
  children?: ReactNode;
}

/**
 * A provider for the application-wide state-store.
 */
export function Provider({ store, children }: ProviderProps): JSX.Element {
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

/**
 * @internal
 */
export const Context = createContext<Store | null>(null);
