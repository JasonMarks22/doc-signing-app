/**
 * The lowest layer: a tiny key/value store. Repositories depend on this interface, not on
 * `localStorage` directly, so tests use the in-memory version and a real API could replace
 * it later without touching anything above.
 */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  /** Called when the data changed somewhere else (e.g. another browser tab). */
  onExternalChange(listener: (key: string) => void): () => void;
}

export class MemoryStore implements KeyValueStore {
  private data = new Map<string, string>();
  get(key: string) {
    return this.data.get(key) ?? null;
  }
  set(key: string, value: string) {
    this.data.set(key, value);
  }
  onExternalChange() {
    return () => {};
  }
}

export class LocalStorageStore implements KeyValueStore {
  get(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  set(key: string, value: string) {
    window.localStorage.setItem(key, value);
  }
  /** The browser fires `storage` in OTHER tabs when one tab writes – free cross-tab sync. */
  onExternalChange(listener: (key: string) => void) {
    const handler = (e: StorageEvent) => {
      if (e.key) listener(e.key);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }
}
