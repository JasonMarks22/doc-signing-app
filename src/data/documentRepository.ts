import type { SigningDocument } from '../domain/types';
import type { KeyValueStore } from './storage';

/**
 * Data access for signing documents. Knows HOW to load/save, nothing about business rules.
 * Swap this class for an HTTP-backed one and the service + UI don't change.
 */
export interface DocumentRepository {
  list(): SigningDocument[];
  get(id: string): SigningDocument | undefined;
  save(doc: SigningDocument): void;
  /** Notifies after any change. Used by React (useSyncExternalStore) to re-render. */
  subscribe(listener: () => void): () => void;
}

const KEY = 'docsign:documents:v1';

export class KeyValueDocumentRepository implements DocumentRepository {
  private cache: SigningDocument[] | null = null;
  private listeners = new Set<() => void>();
  private store: KeyValueStore;

  constructor(store: KeyValueStore) {
    this.store = store;
    store.onExternalChange((key) => {
      if (key === KEY) {
        this.cache = null;
        this.emit();
      }
    });
  }

  /** Returns the same array instance until something changes (React needs stable snapshots). */
  list(): SigningDocument[] {
    if (this.cache === null) {
      const raw = this.store.get(KEY);
      this.cache = raw ? (JSON.parse(raw) as SigningDocument[]) : [];
    }
    return this.cache;
  }

  get(id: string): SigningDocument | undefined {
    return this.list().find((d) => d.id === id);
  }

  save(doc: SigningDocument): void {
    const others = this.list().filter((d) => d.id !== doc.id);
    // Immutable update: a new array and the saved object replace the old ones.
    this.cache = [doc, ...others];
    this.store.set(KEY, JSON.stringify(this.cache));
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}
