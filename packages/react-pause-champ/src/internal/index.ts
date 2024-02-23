// Internal API exports

export type { Entry } from "./entry";
export type {
  EntryCallback,
  EntryMeta,
  Snapshot,
  Store,
  Unregister,
} from "./store";
export type { Guard, SubscribeStrategy } from "./hooks/useEntryValue";

export { createEntry, unwrapEntry } from "./entry";
export { useEntryUpdate, updateState } from "./hooks/useEntryUpdate";
export { getOrInitState, useEntryValue } from "./hooks/useEntryValue";
export { Context, useStore } from "./hooks/useStore";
export {
  dropEntry,
  getEntry,
  getSnapshot,
  listen,
  listenerCount,
  restoreEntryFromSnapshot,
  setEntry,
} from "./store";
export { subscribeShared } from "../hooks/createSharedState";
export { subscribePersistent } from "../hooks/createPersistentState";
export { subscribePrivate } from "../hooks/useChamp";
