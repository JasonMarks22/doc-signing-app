import type { FieldDefinition, FieldValue, Recipient } from '../domain/types';

/**
 * Domain events: facts about things that already happened. The document service publishes
 * them; it does not know or care who listens (today: the audit trail).
 */
interface EventBase {
  documentId: string;
  actorId: string;
  actorName: string;
  at: string;
}

/** Frozen copy of what was agreed to, so the audit trail can fingerprint it. */
export interface ContentSnapshot {
  fields: FieldDefinition[];
  values: Record<string, FieldValue>;
}

export type DomainEvent =
  | (EventBase & { type: 'document.created'; title: string })
  | (EventBase & { type: 'document.sent'; recipient: Recipient; snapshot: ContentSnapshot })
  | (EventBase & { type: 'document.viewed' })
  | (EventBase & { type: 'document.completed'; snapshot: ContentSnapshot });

export type DomainEventType = DomainEvent['type'];

type Handler = (event: DomainEvent) => void;

export class EventBus {
  private handlers = new Set<Handler>();

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  publish(event: DomainEvent): void {
    for (const handler of this.handlers) {
      // A broken subscriber must never break signing. Isolate each one.
      try {
        handler(event);
      } catch (err) {
        console.error(`[EventBus] handler failed for ${event.type}`, err);
      }
    }
  }
}
