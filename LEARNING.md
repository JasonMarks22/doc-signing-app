# Study guide: how MiniSign works

Read this before the walkthrough call. It goes file by file in the order data flows, then
covers likely interview questions. (WRITEUP.md is the formal submission; this is for you.)

## The 30-second version

- **Domain** (`src/domain`) = plain TypeScript describing the business: types, rules, validation.
- **Data** (`src/data`) = how documents get saved (localStorage today).
- **Services** (`src/services`) = the only code allowed to change a document. It checks the rules,
  saves through the repository, and announces what happened on the event bus.
- **Audit trail** = listens to the event bus and writes a hash-chained log.
- **React** (`src/app`, `src/components`) = reads data through hooks and calls service methods.

If the interviewer asks "where would X go?", the answer is almost always one of those layers.

## Follow one action end to end: recipient clicks "Finish & sign"

1. `FillView.tsx` button → `run(() => services.documents.complete(doc.id, currentUser))`.
   `run` (from `useAction` in `AppContext.tsx`) catches `DomainError` and shows its message.
2. `DocumentService.complete()` (`services/documentService.ts`):
   - loads the doc *as this user* (`require` → `getFor` → `canView`). Not yours → "not found".
   - checks you are the recipient and status is `sent`.
   - `problemsFor(doc, 'recipient')` runs `validateValue` on each of your fields (`domain/validation.ts`).
   - `withAutoFills` writes your name into `signerName` fields and today into auto-date fields.
   - saves the new object with `status: 'completed'` via the repository.
   - publishes a `document.completed` event with a snapshot of fields + values.
3. `KeyValueDocumentRepository.save()` replaces the array, writes JSON to localStorage, notifies listeners.
4. React: `useAllDocuments` uses `useSyncExternalStore(repo.subscribe, repo.list)`, so every
   component reading documents re-renders with the new status.
5. `AuditTrail` (subscribed to the bus) hashes the snapshot, links to the previous entry's hash,
   appends the entry and notifies; `AuditPanel` re-renders and re-verifies the chain.

Every other action (send, setValue, addField…) follows the same shape.

## File map

| File | What it does | Why it's built this way |
|---|---|---|
| `domain/types.ts` | All data shapes | Source pages, layout and values are separate types, which is the #1 grading criterion |
| `domain/rules.ts` | `partyFor`, `canView`, `canEditField`, `problemsFor`, `nextActionFor` | Pure functions: easy to test, shared by service (enforce) and UI (render) |
| `domain/validation.ts` | Email/phone/date checks, `isAutoFilled` | One place for "is this value OK?" |
| `domain/presets.ts` | The 17-field standard layout | Written in PDF points (measured with pdfplumber), converted to fractions |
| `domain/catalog.ts` | Available source documents | Page images + page size in points |
| `data/storage.ts` | `KeyValueStore` with localStorage + memory versions | Lets tests run without a browser; listens to `storage` for cross-tab sync |
| `data/documentRepository.ts` | list/get/save/subscribe | Caches the list so React gets the same array until something changes |
| `services/documentService.ts` | Every write + every permission check | Takes `actor` on each call; injects `now` and `newId` for testability |
| `services/eventBus.ts` | Typed pub/sub + event types | Service doesn't know who listens; errors in listeners are isolated |
| `services/auditTrail.ts` | Hash-chained, append-only log + `verify` | The Part 2 feature |
| `services/container.ts` | Creates and wires everything | "Composition root": the only place that picks concrete classes |
| `app/AppContext.tsx` | Context, current user, data hooks, `useAction` | Single source of truth; no prop drilling |
| `app/useHashRoute.ts` | `#/` and `#/doc/:id` | Two routes didn't justify react-router |
| `components/DocumentScreen.tsx` | Picks editor vs. fill view; marks "viewed" | Mode = f(user's party, status) |
| `components/LayoutEditor.tsx` | Place / drag / resize / edit field properties | Drag preview in local state, one save on mouse-up |
| `components/FillView.tsx` | Fill own fields, send / finish, read-only view | Errors shown only after a field is touched or after submit |
| `components/PageView.tsx` | Page box with the right aspect ratio | Percent positioning + `container-type` for text scaling |
| `services/documentService.test.ts` | 8 tests: visibility, send rules, locking, audit tampering | Tests the rules where they're enforced |

## The status machine

```
draft ──send()──► sent ──complete()──► completed
 sender edits      recipient edits      nobody edits
 layout + own      own fields only
 fields
```
`viewedAt` is a timestamp, not a status, so "viewed" doesn't add a state you have to
handle everywhere. The list shows it as "sent · viewed".

## Field positions, explained simply

A field is stored as "page 2, 14% from the left, 50% down, 36% wide, 4% tall". The page `<div>`
always has the paper's shape (`aspect-ratio: 612 / 792`), and the field uses
`left: 14%; top: 50%; width: 36%; height: 4%`. Shrink the window and the page shrinks, so the
field shrinks with it in the same place. The text inside uses `font-size: 1.45cqw` (1.45% of the
page width) so it shrinks too. Pixels would break on resize; PDF points would need a conversion
on every render; fractions need none.

When you drag, `LayoutEditor` converts mouse movement in pixels to fractions by dividing by the
page's on-screen width/height (`getBoundingClientRect`).

## How "locked really is locked"

- Layout: `addField/updateField/removeField/applyPreset` all call `requireLayoutEditable`
  (sender + draft only).
- Values: `setValue` calls `canEditField` (right party, right status, not auto-filled).
- Visibility: every read and write goes through `getFor`, which uses `canView`. A recipient
  can't even load a draft.
- Tests prove each one (`npm test`).

Honest caveat for the call: it's a browser-only app, so a user could edit localStorage directly.
In production these exact checks move to a server. That's why they're in a service and not
in components: the move is mechanical.

## The audit trail, explained simply

Each entry is like a receipt that includes the fingerprint (hash) of the previous receipt.
Change any old receipt and its fingerprint changes, so the next receipt's "previous fingerprint"
no longer matches. `verify()` walks the chain and recomputes every hash. The last test in
`documentService.test.ts` edits an entry directly in storage and checks that verification fails at
entry #2. "Sent" and "completed" entries also fingerprint the fields and values, so you can tell
whether the signed content changed after completion.

Why an event bus instead of calling `audit.log()` from the service? The service stays focused
on signing, and new features (notifications, reminders, metrics) can subscribe without changing it.

## Questions to be ready for

- *Why localStorage and not a mock API?* Persistence across refresh and tabs with zero setup.
  The repository interface is the seam; an API version would implement the same four methods
  (async in reality, which is the main change).
- *What happens if two tabs edit at once?* The last write wins for documents. The audit trail
  re-reads storage right before appending so it doesn't drop the other tab's entries.
- *Why not Redux/Zustand?* One external store (the repository) + `useSyncExternalStore` covers
  it. A library would add a second place state could live.
- *How would you add templates?* A `Template { id, sourceDocumentId, fields }` saved by its own
  repository; `createDraft` would copy its fields with new ids. `applyPreset` is already a
  hard-coded version of this.
- *How would you add notifications?* A `NotificationService` subscribing to the bus,
  storing `{ userEmail, eventType, documentId, readAt }`; the header shows the unread count.
- *Why does changing a field's type clear its value?* An old value may be invalid for the new
  type (a phone number in an email field).
- *What would you test next?* Component tests for the editor drag math and the fill view.

## Try these yourself before the call

1. Add a field in the editor and watch `localStorage['docsign:documents:v1']` in DevTools.
2. Resize the window on a completed document: positions hold.
3. In DevTools, edit an audit entry's `summary` in `localStorage['docsign:audit:v1']`, refresh:
   the panel shows tampering.
4. Try typing in a sender field as Dana; it's not an input. Then try it in the console:
   the service throws.
