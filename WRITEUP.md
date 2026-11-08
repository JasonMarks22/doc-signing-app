# MiniSign – Write-up

A simplified DocuSign: a sender places fields on the Master Agreement, fills and signs their
side, issues it to a recipient, and the recipient fills, signs and completes it. Every step
is recorded in a tamper-evident audit trail.

## 1. How to run it

Live demo: https://jasonmarks22.github.io/doc-signing-app/ (auto-deployed by GitHub Actions on every push to `main`).

Requires Node 20.19+ or 22.12+.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # service-layer tests (Vitest)
npm run build    # type-check + production build
```

**Quick demo:** as *Alex Rivera* → **Start new agreement** → **Use standard layout** →
**Next: sign & send** → click the sender signature, type a title → **Sign & send to Dana
Whitfield** → **Switch to Dana Whitfield to sign** → fill the highlighted fields → sign →
**Finish & sign**. Switch to *Sam* to confirm the document isn't visible. Tip: open two tabs as
two different users; they stay in sync through the browser's `storage` event.

Sending is simulated, as the brief allows: the document appears in the recipient's list and no
email leaves the browser. The README has a requirement-by-requirement test checklist.

## 2. Architecture overview

```
 UI (React components)          src/components, src/App.tsx
   │  reads via hooks, writes by calling service methods
 App glue                       src/app  (context, hooks, tiny hash router)
   │
 DocumentService  ── publishes ──►  EventBus  ──►  AuditTrail (Part 2 feature)
   │  enforces every rule                          (subscriber, hash chain)
 DocumentRepository                                    │
   │                                                    │
 KeyValueStore (localStorage | in-memory) ◄─────────────┘
```

**Data model** (`src/domain/types.ts`) keeps three things separate:

| Concept | Type | Owned by | Changes? |
|---|---|---|---|
| The original pages | `SourceDocument` | the catalog | never |
| Where fields are and what they are | `FieldDefinition[]` | the sender | only while `draft` |
| What people entered | `values: Record<fieldId, FieldValue>` | each party, for their own fields | sender in `draft`, recipient in `sent` |

A `SigningDocument` links one source document + one layout + one set of values + a status
(`draft → sent → completed`) + timestamps (`sentAt`, `viewedAt`, `completedAt`).

**State:** the repository is the single source of truth. React subscribes to it with
`useSyncExternalStore`; components never copy documents into `useState`. Only short-lived UI
state (selected field, drag preview, open modal, which fields were touched) lives in components.
Services are created once in `main.tsx` and passed through one context, so there is no prop drilling.

**Code layout**

```
src/domain/    pure types + rules + validation + the standard layout preset (no React, no storage)
src/data/      KeyValueStore (localStorage / memory) and DocumentRepository
src/services/  DocumentService (all writes), EventBus, AuditTrail, container (wiring)
src/app/       React context + hooks, hash router
src/components/ screens: list, layout editor, fill view, signature modal, audit panel
```

## 3. Key decisions and trade-offs

1. **Field positions are page index + fractions of the page (0–1).** `{ page: 1, x: 0.14, y: 0.50, width: 0.36, height: 0.04 }`.
   The page box keeps the PDF's aspect ratio and fields are positioned with CSS percentages,
   so they stay put at any width. Field text uses `cqw` container units so it scales too.
   Trade-off: fractions are less readable than points, so the preset is written in PDF points
   (measured from the PDF) and converted with a helper.
2. **All rules live in the service, not the UI.** `DocumentService` takes the acting user on
   every call and checks status + assignee itself (e.g. `setValue` rejects a recipient editing a
   sender field, or anyone editing a completed document). The UI uses the same pure functions in
   `domain/rules.ts` only to decide what to render. Trade-off: a little duplication of "can I?"
   checks at render time, but the guarantees can't be bypassed by a UI bug, and they're unit-tested.
3. **localStorage behind a repository + key/value interface.** It persists across refreshes
   and works across tabs (useful to demo two users). Tests use the in-memory store; a real API
   would replace `KeyValueDocumentRepository` without touching services or UI.
   Trade-off: it's synchronous, single-browser and fully writable by the user – fine for a demo,
   not for real security.
4. **Page images instead of rendering the PDF in the browser.** Pages are pre-rendered PNGs
   (`pdftoppm -r 150`). No PDF.js worker setup or font issues, and the README allows it.
   Trade-off: a new document needs a render step; you can't upload an arbitrary PDF yet.
5. **Auto-filled fields are filled by the service at the moment of signing.** `signerName` and
   "auto date" fields are never editable; the sender's are filled on `send`, the recipient's on
   `complete`, using the logged-in user's name and today's local date.
   Trade-off: the date uses the signer's device clock/time zone.

Smaller choices: drafts are invisible to the recipient; the UI picks recipients from the demo
accounts, so a sent document always reaches someone who can open it (the service matches them by
email, so a real address book could replace the list); changing a field's type or assignee clears its value;
dragging updates local preview state and saves once on mouse-up.

**Libraries:** React + TypeScript + Vite (fast default), Vitest (tests share Vite's config).
Nothing else: a hash router, signature canvas and pub/sub were each a few dozen lines, which
was cheaper than learning and justifying a dependency.

## 4. My feature: tamper-evident audit trail (on an event bus)

**What it does:** every lifecycle event (created, sent, viewed, completed) becomes an audit entry
with who, what and when. Each entry stores the SHA-256 hash of the previous entry and its own hash,
forming a chain per document. "Sent" and "completed" entries also store a fingerprint of the
fields and values at that moment. The document screen verifies the chain and shows
"✓ hash chain verified" or which entry was tampered with, and whether the completed document
still matches what was signed.

**Why:** for a signing product the history *is* the product. "Who signed what, and when" is the
first question in any dispute, and an editable log is worthless as evidence. It also forced a
clean seam in the design.

**How it plugs in:** `DocumentService` publishes domain events to an `EventBus` and doesn't
know the audit trail exists. `AuditTrail` subscribes in the composition root (`container.ts`).
Notifications, reminders or analytics could subscribe the same way without changing the
service. Subscriber errors are caught so a broken listener can never block a signature. Hashing is
async (Web Crypto), so appends go through a promise queue to keep the chain in order. The log
API is append-only (no update or delete).

**Honest limit:** tamper-*evident*, not tamper-*proof*. Someone with access to localStorage could
rewrite the whole chain consistently. In production the chain head would be stored server-side
or signed with a server key.

## 5. How I used AI

I used Claude to scaffold the project, generate first drafts of the service, components and
tests, and measure field coordinates from the PDF. I reviewed and changed its output, for example:

- **Rejected** constructor "parameter properties" (`constructor(private store: …)`): the project's
  `erasableSyntaxOnly` TypeScript setting forbids them, so I switched to explicit fields.
- **Rejected** a hook that filtered documents with a `void all` trick to force re-computation. I
  replaced it with one pure `visibleTo(docs, user)` rule shared by the service and the hook, so
  "who can see what" is defined in exactly one place.
- **Chose** page images over the suggested `react-pdf` setup to cut setup risk in a 90-minute box.
- Measured the preset coordinates from the actual PDF text positions instead of eyeballing them.

<!-- TODO (Jason): add one example of your own from reviewing the code, in your own words. -->

## 6. What's unfinished

- No upload of new PDFs; only the catalog's Master Agreement (plus the render step).
- No decline/void/expire statuses, reminders or due dates.
- No downloadable signed PDF (flattening values into the PDF).
- Placement is click-to-place only (no drag from the palette, no snapping, no undo, no keyboard).
- Every keystroke writes to localStorage; fine here, would be debounced against a real API.
- Audit trail is tamper-evident only (see above). Layout edits in draft are not logged.
- Tests cover the service and audit chain; no component/E2E tests are committed.
- Documents take their source document's name, and drafts can't be deleted.
