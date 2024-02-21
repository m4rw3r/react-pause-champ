import { ReactNode, createContext, createElement, useContext } from "react";

import { Store } from "../store";

/**
 * Properties for creating a {@link Provider | `<Provider/>`} component.
 *
 * @public
 * @category Component
 */
export interface ProviderProps {
  /**
   * The {@link Store} instance for the application.
   */
  store: Store;
  /**
   * Nested JSX elements.
   */
  children?: ReactNode;
}

/**
 * A React Component providing application state state from a {@link Store}
 * instance to {@link useChamp} hooks.
 *
 * @public
 * @category Component
 * @param props - Component properties
 * @param props.store - {@link Store} instance to provide
 * @param props.children - Nested JSX elements
 * @see {@link createStore} to create a {@link Store}
 * @see {@link fromSnapshot} to restore a snapshot from {@link Resume}
 * @see {@link react-dom/client!createRoot} to create a React application root
 */
export function Provider({ store, children }: ProviderProps): JSX.Element {
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

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
