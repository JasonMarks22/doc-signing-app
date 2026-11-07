import { KeyValueDocumentRepository } from '../data/documentRepository';
import { LocalStorageStore, type KeyValueStore } from '../data/storage';
import { AuditTrail } from './auditTrail';
import { DocumentService } from './documentService';
import { EventBus } from './eventBus';

/**
 * Composition root: the one place where concrete classes are created and wired together.
 * Everything else receives its dependencies, which is what makes the service testable
 * with an in-memory store and a fake clock.
 */
export function createServices(store: KeyValueStore = new LocalStorageStore()) {
  const bus = new EventBus();
  const repo = new KeyValueDocumentRepository(store);
  const documents = new DocumentService({ repo, bus });
  const audit = new AuditTrail(store, bus);
  return { store, bus, repo, documents, audit };
}

export type Services = ReturnType<typeof createServices>;
