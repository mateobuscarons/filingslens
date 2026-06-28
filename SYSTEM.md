# FilingLens — System Reference

A walkthrough of what every piece of the backend does and how the data flows.
Read top-to-bottom; cross-reference the file paths against the code.

---

## 1. What it is

FilingLens is an AI-assisted research platform for German equity analysts.
The product compresses three steps of a research workflow:

1. **Detect** — upload two PDF annual reports for the same company; the
   system surfaces the material changes, each with verbatim citations on
   both sides.
2. **Verify** — ask company-level questions in natural language; answers
   are grounded in the indexed paragraphs and cite their sources, with
   clickable `[N]` markers that scroll to the matching evidence card.
3. **Capture** — save findings and answers into a shareable research
   report; export as PDF.

Two personas: **Elena Steiner** (firm admin) and **Daniel Chen** (solo
analyst). Solo and Team workspaces share the same UX; Team adds
invites + seat-based billing.

---

## 2. Stack & runtime

| Layer | Choice |
|---|---|
| Server | Node 20+, Express 4, ESM modules |
| Database | MongoDB (local), Mongoose 8 |
| Auth | JSON Web Tokens (HS256), 7-day TTL |
| Validation | Zod (per-route schemas, wrapped by `validate()` middleware) |
| AI — chat | Groq via OpenAI SDK pointed at `https://api.groq.com/openai/v1` |
| LLM — judge (compare) | `openai/gpt-oss-120b` — strict JSON Schema with constrained decoding |
| LLM — Q&A answerer | `qwen/qwen3-32b` — JSON object mode, strong German |
| LLM — utility | `llama-3.1-8b-instant` — fast/cheap, used for any incidental call |
| AI — embeddings | NVIDIA NIM `nvidia/nv-embedqa-e5-v5` (1024-dim, asymmetric passage/query) |
| PDF parsing | `pdfjs-dist/legacy/build/pdf.mjs` |
| Frontend | React 18 + Vite + React Router, plain `fetch` |
| PDF export | `jspdf` (client-side only) |

Groq has no embeddings endpoint, so NIM stays for embeddings only. The
OpenAI SDK is the single chat client for all three Groq models — the only
difference per task is the model id and response format.

Three processes during dev:
- Mongo (`brew services start mongodb-community`) on `:27017`
- Backend `npm run dev` (`--watch` reload) on `:4000`
- Frontend `npm run dev` (Vite) on `:5173`

Environment variables (in `backend/.env`):
- `MONGO_URI`, `PORT`, `JWT_SECRET`, `CORS_ORIGIN`
- `NIM_API_KEY`, `NIM_EMBED_MODEL`
- `GROQ_API_KEY`, `GROQ_JUDGE_MODEL`, `GROQ_QA_MODEL`, `GROQ_UTILITY_MODEL`

If `GROQ_API_KEY` is missing, compare and Q&A return `503 GROQ_UNAVAILABLE`.
If `NIM_API_KEY` is missing, uploads return `503 NIM_UNAVAILABLE`.

---

## 3. Boot sequence

`backend/src/index.js` is the entry point:

1. Load `.env` via `dotenv/config`.
2. Build the Express app, install CORS, JSON body parser (`2mb` limit).
3. Wire route modules under their prefixes.
4. Install one central error middleware that turns any thrown error into
   `{ error, message, fields }` with the right HTTP status.
5. Call `connectDb()` → mongoose connects to `MONGO_URI`.
6. `app.listen(port)` once Mongo is up.

The comparison worker is **not** a separate process. It lives in the same
Node runtime as the HTTP server, invoked via `setImmediate` from
`POST /comparisons`.

---

## 4. Filesystem layout

```
backend/
├── data/
│   ├── siemens-2024.pdf          # sample inputs (gitignored beyond this)
│   ├── siemens-2025.pdf
│   └── uploads/                  # multer drops here, then renamed
├── src/
│   ├── index.js                  # express bootstrap
│   ├── db.js                     # mongoose.connect
│   ├── worker.js                 # runs a single comparison end to end
│   ├── middleware/
│   │   ├── auth.js               # JWT sign/verify, role guards (query-token fallback)
│   │   └── validate.js           # zod → 400 with field errors
│   ├── models/                   # one file per Mongoose schema
│   ├── routes/                   # one file per REST area
│   ├── ai/
│   │   ├── nim.js                # OpenAI SDK client → NIM (embeddings only)
│   │   ├── groq.js               # OpenAI SDK client → Groq (chat only)
│   │   ├── llm.js                # task router: judge / qa / utility
│   │   ├── embed.js              # passage/query embedding batches
│   │   ├── pdf.js                # pdfjs → lines → paragraphs
│   │   ├── ingest.js             # parse → embed → persist paragraphs
│   │   ├── compare.js            # cosine pair-match + one judge call
│   │   ├── qa.js                 # retrieve + balance + one judge call
│   │   ├── quoteResolver.js      # LLM quote → paragraph char span
│   │   └── vec.js                # normalize + dot product
│   └── scripts/
│       └── seed.js               # plans + demo accounts
```

---

## 5. Data model

Every collection, what it stores, and how it links to the rest.

### 5.1 `User` — `models/user.js`
Single user account. `email` unique + lowercased. `role`:
`solo | firm_admin | firm_analyst`. `firmId` is `null` for solo users.

### 5.2 `InvestmentFirm` — `models/firm.js`
Team workspace. `seatLimit` set at team registration (5–25).

### 5.3 `TeamInvite` — `models/teamInvite.js`
One row per invite. `code` is a unique uppercase hex string (8 chars).
`status` lifecycle: `pending → accepted | revoked`.

### 5.4 `PricingPlan` — `models/pricingPlan.js`
Two rows seeded: `solo` (€29 / 1 seat) and `team` (€149 / 5 seats + €25
per extra seat). The billing route computes:
```
amount = basePrice + max(0, seats - baseSeats) * extraSeatPrice
```

### 5.5 `Subscription` — `models/subscription.js`
Created once at signup. `subscriberType` is `User` or `InvestmentFirm`.
**Immutable** after creation by design.

### 5.6 `Payment` — `models/payment.js`
Mock-only. `method='mock'`, `status='succeeded'`. Created with the
Subscription in one shot.

### 5.7 `Company` — `models/company.js`
Created on the first upload. `nameLower` (unique + indexed) for
case-insensitive dedup.

### 5.8 `Filing` — `models/filing.js`
A specific year's PDF for a Company. Schema:
- `companyId`, `fiscalYear` (unique together — re-upload overwrites)
- `fileName` (the renamed PDF in `data/uploads/`)
- `pageCount`
- `ingestStatus`: `pending → parsing → embedding → ready | failed`

The frontend polls `GET /filings/:id` to watch ingest progress.

### 5.9 `Paragraph` — `models/paragraph.js`
The output of ingest. `{ filingId, page, index, section, text, embedding }`.
`embedding` is a 1024-dim Float[]. Indexed by `(filingId, page, index)`.
The single biggest collection by row count.

### 5.10 `FilingComparison` — `models/comparison.js`
One row per analysis. `status` lifecycle:
`pending → comparing → summarizing → completed | failed`. `progress`
(0–1), `counts.{modified, added, removed}`, `overallScore`, `error`.
**Sharing**: `isShared: Boolean` + `firmId` (denormalized at create time).
When `isShared` is true, every member of `firmId` can read the comparison +
its findings/citations.

### 5.11 `Finding` — `models/finding.js`
The judge's output. One row per surfaced change. Fields:
- `type`: `modified | added | removed`
- `section`: the LLM-emitted topic label ("Board compensation",
  "Pension provisions") — NOT the raw PDF heading
- `currentParagraphId`, `previousParagraphId`
- `materialityScore`: derived from `impact` bucket (0.9 / 0.6 / 0.3),
  used only as a sort key
- `impact`: `high | medium | low`
- `summary`: the one-sentence LLM judge output
- `excerpt`: the current paragraph text (fallback for display)

### 5.12 `Citation` — `models/citation.js`
Polymorphic — used by both Findings and Questions. `sourceType:
'Finding' | 'Question'` + `sourceId`. Points at a Paragraph and carries
denormalized `filingId`, `filingYear`, `page` plus the **citation span**:
- `excerpt`: the full surrounding paragraph text
- `claimText`: the exact substring the LLM grounded its claim in
- `charStart`, `charEnd`: offsets into `excerpt` for highlighting
- `marker`: the `[N]` number — for Findings, 1=prev, 2=curr; for
  Questions, equals the passage number the LLM cited

The UI uses `claimText` + offsets to render an inline highlight (`<mark>`)
inside the excerpt.

### 5.13 `QASession` — `models/qa.js`
One per `(userId, companyId)` — enforced by a unique compound index.
Sessions are upserted.

### 5.14 `Question` — `models/qa.js`
One per Q&A turn. `text`, `answer`, `status`:
`pending | ready | failed | no_evidence`. Citations live in the
`Citation` collection with `sourceType: 'Question'`.

### 5.15 `ResearchReport` — `models/report.js`
Owner = `userId`, scope = `firmId`. `isShared` toggles firm-wide
visibility. Optionally linked to the `comparisonId` it was generated from.

### 5.16 `ReportItem` — `models/report.js`
One saved finding or Q&A answer inside a report. `kind: 'finding' |
'answer'` + `refId`. Attribution: `addedBy`, `addedByName`. **Notes** are a
sub-document array — `notes: [{ authorId, authorName, text, createdAt }]`.
On a shared report, any firm member can append a note; only the note's
author can delete their own. Together with `addedBy`, this is the team
collaboration primitive: who put it in the report, who annotated it.

---

## 6. Auth & authorization

### 6.1 JWT
`middleware/auth.js`:
- `signToken(user)` — HS256, `{ sub: user._id, role }`, 7-day TTL.
- `requireAuth` — reads `Authorization: Bearer <token>` OR `?token=<jwt>`
  query param. The query-param path exists so that a browser opening a
  PDF URL in a new tab can authenticate without our `Authorization`
  header. 401 on any failure mode.
- `requireFirmAdmin` — post-auth guard; 403 if `role !== 'firm_admin'`.

### 6.2 Three register modes
`POST /auth/register` uses a Zod discriminated union on `mode`:
- `solo` → User created, no Firm.
- `team-new` → Firm + User as `firm_admin`.
- `team-join` → look up invite code, accept it, User joins as
  `firm_analyst`.

### 6.3 Frontend route guards
`frontend/src/auth.jsx` mirrors auth state with three guards:
- `ProtectedRoute` — user + active subscription. Else bounce.
- `AuthOnlyRoute` — user, no sub required (only `/billing/setup`).
- `AdminRoute` — adds `role === 'firm_admin'` (only `/settings/team`).

---

## 7. REST surface

🔓 public, 🔐 any user, 🔑 admin only.

### Auth & profile
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | 🔓 | solo / team-new / team-join |
| POST | `/auth/login` | 🔓 | Email + password → JWT |
| GET | `/me` | 🔐 | Current user + nested firm |
| PATCH | `/me` | 🔐 | Update name / password |

### Billing
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/billing/plans` | 🔐 | Both plans |
| GET | `/billing/subscription` | 🔐 | Current sub + plan + payments. 404 if not subscribed |
| POST | `/billing/subscribe` | 🔐 | One-shot: computes amount server-side, creates Subscription + Payment |

### Firm
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/firms/:id` | 🔐 | Firm + member count |
| GET | `/firms/:id/members` | 🔐 | All members |
| DELETE | `/firms/:id/members/:userId` | 🔑 | Remove a member |
| GET | `/firms/:id/invites` | 🔐 | All invites |
| POST | `/firms/:id/invites` | 🔑 | Create invite (seat check) |
| DELETE | `/firms/:id/invites/:inviteId` | 🔑 | Revoke pending invite |

### Companies & filings
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/companies` | 🔐 | All companies |
| GET | `/companies/:id` | 🔐 | One company |
| GET | `/filings?companyId=…` | 🔐 | Filings for a company |
| GET | `/filings/:id` | 🔐 | One filing — polled for `ingestStatus` |
| GET | `/filings/:id/file` | 🔐 (query-token OK) | Stream the original PDF inline, with `Content-Type: application/pdf` |
| POST | `/filings/upload` | 🔐 | Multipart: `companyName, fiscalYear, file`. Upserts Company, kicks ingest |

### Comparisons & findings
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/comparisons` | 🔐 | Mine, sorted newest first |
| POST | `/comparisons` | 🔐 | Validates ready state; kicks worker; returns 202 |
| GET | `/comparisons/:id` | 🔐 | Polled for `status` + `counts` + `progress` |
| DELETE | `/comparisons/:id` | 🔐 | Cascade: findings + citations |
| GET | `/comparisons/:id/findings?limit=N` | 🔐 | Sorted by materiality desc |
| GET | `/findings/:id` | 🔐 | One finding + both Paragraphs + Citations |
| POST/DELETE | `/comparisons/:id/share` | 🔐 (owner) | Toggle firm sharing (mirrors reports) |

### Q&A
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/qa/sessions` | 🔐 | All sessions |
| POST | `/qa/sessions` | 🔐 | Upsert one per `(userId, companyId)` |
| GET | `/qa/sessions/:id` | 🔐 | Session + questions + their citations |
| POST | `/qa/sessions/:id/questions` | 🔐 | Triggers RAG + LLM, persists Question + Citations |
| DELETE | `/qa/sessions/:id/questions/:qid` | 🔐 | Cascade delete |

### Reports
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/reports` | 🔐 | Mine + firm-shared |
| POST | `/reports` | 🔐 | Create empty report |
| GET | `/reports/:id` | 🔐 | Report + items + citations |
| PATCH | `/reports/:id` | 🔐 (owner) | Title / share toggle |
| DELETE | `/reports/:id` | 🔐 (owner) | Cascade |
| POST/DELETE | `/reports/:id/share` | 🔐 (owner) | Share with firm |
| POST | `/reports/:id/items` | 🔐 (owner or firm-mate on shared) | Save a finding or answer |
| PATCH | `/reports/:id/items/:itemId` | 🔐 (owner or firm-mate on shared) | Soft-archive |
| DELETE | `/reports/:id/items/:itemId` | 🔐 (owner or firm-mate on shared) | Hard-delete |
| POST | `/reports/:id/items/:itemId/notes` | 🔐 (owner or firm-mate on shared) | Append a note to the thread |
| DELETE | `/reports/:id/items/:itemId/notes/:noteId` | 🔐 (note author) | Delete your own note |

---

## 8. The AI pipeline

Everything that touches a model lives in `backend/src/ai/`. Three calls
per analysis: many embeddings during ingest (NIM), one judge call during
compare (Groq), one judge call per Q&A turn (Groq).

### 8.1 Provider clients — `ai/nim.js`, `ai/groq.js`
Two lazy singletons. Each wraps the OpenAI SDK with a different
`baseURL` and key. `requireNim()` / `requireGroq()` are the throwing
variants used by routes that depend on the provider.

### 8.2 LLM router — `ai/llm.js`
`chat(task, messages, opts)` picks the model from `TASKS[task]`:
- `judge` → `gpt-oss-120b`, supports strict JSON Schema.
- `qa` → `qwen3-32b`, JSON object mode (no strict schema support).
- `utility` → `llama-3.1-8b-instant`, plain text.

If `opts.schema` is passed and the task supports strict schema, the call
sets `response_format: { type: 'json_schema', strict: true }`. Otherwise
it falls back to `json_object` mode. Either way, `chat()` returns a
parsed object. The strict mode replaces all parse-tolerance hacks — when
the API accepts the request, the output is guaranteed valid JSON.

One automatic retry on transient errors. Note: Groq strict schema does
**not** accept `minItems`, `maxItems`, `minimum`, etc. Only the OpenAI
strict subset (type, properties, required, additionalProperties, items,
$ref, $defs, anyOf, enum, const, format).

### 8.3 Embedding wrapper — `ai/embed.js`
`embedPassages(texts)` and `embedQuery(text)` differ only in NIM's
`input_type` parameter (`passage` vs `query` — NIM's encoder tunes
asymmetrically). Batches of 16 per request. Returns 1024-dim vectors.

### 8.4 PDF parsing — `ai/pdf.js`
Two passes:
1. `extractPages` — pdfjs reads each page, items are bucketed by
   Y-coordinate to reconstruct lines, then sorted by X.
2. `paginateToParagraphs` — iterate lines; detect headings (numbered,
   ALL-CAPS, or `Note N`) → set `currentSection`; otherwise accumulate
   into a buffer that flushes at ~400 chars. Drop anything < 150 chars.

The section detection is intentionally lossy — the new compare pipeline
no longer relies on it (the LLM provides clean topic labels for findings).

### 8.5 Ingest orchestrator — `ai/ingest.js`
`ingestFiling(filingId, filePath)`:
1. Set `ingestStatus = 'parsing'`.
2. Extract pages + paginate paragraphs. Save `pageCount`.
3. Set `ingestStatus = 'embedding'`. Wipe any pre-existing Paragraphs.
4. Iterate in batches of 32: embed → bulk `insertMany`.
5. Set `ingestStatus = 'ready'`.

Any throw writes `ingestStatus = 'failed'`.

### 8.6 Comparison engine — `ai/compare.js` + `worker.js`

**One LLM call per analysis.** The pipeline:

1. **Load.** Fetch both filings and all their paragraphs.
2. **Cosine-pair.** For each *current* paragraph, find its closest
   *previous* paragraph by embedding cosine. Keep pairs whose similarity
   sits in `[0.65, 0.95]` — close enough to share topic, not close enough
   to be identical. Sort descending by similarity (so
   boilerplate-with-one-number-changed pairs lead) and take the top 12.
3. **Judge in one shot.** Send all 12 pairs to `gpt-oss-120b` with strict
   JSON Schema:
   ```
   { changes: [
       { pair_id, topic, summary, prev_quote, curr_quote, impact }
     ] }
   ```
   The LLM emits up to ~8 changes. Each `prev_quote` / `curr_quote` is a
   verbatim substring of the indicated paragraph. The model is instructed
   to keep quotes **short and focused** — just the changed phrase, not
   the surrounding fluff. Each change carries a 2–5 word English `topic`
   label that becomes the displayed section.
4. **Resolve quotes.** For each change, run `resolveQuote` against the
   pair's paragraphs. If a side's quote can't be resolved, that side's
   citation is dropped; if both fail, the whole change is dropped. We
   never persist a citation we can't anchor.
5. **Persist.** One `Finding` per surviving change (with `topic` as the
   `section` field). For each finding, up to two `Citation` rows — one
   per side — carrying the full excerpt plus `claimText, charStart,
   charEnd, marker`.

Worker status timeline: `comparing` (0.05) → `summarizing` (0.4) →
`completed` (1).

Tunables in `ai/compare.js`:
- `SIM_MIN = 0.65`, `SIM_MAX = 0.95` — cosine band
- `TOP_PAIRS = 12` — max pairs sent to the judge
- `MAX_CHANGES = 8` — max findings per call (capped via prompt)

### 8.7 Q&A RAG — `ai/qa.js`

`answerQuestion(companyId, questionText)`:
1. Find all `Filing`s for the company with `ingestStatus = 'ready'`.
2. Load all their Paragraphs. Embed the question.
3. Score every paragraph by cosine. Sort, take top 20.
4. **Rebalance per filing year.** Ensure each filing year contributes at
   least min(2, available) passages to the LLM input — avoids the
   "all from one year" failure on comparative questions. Slice to top 8.
5. Build a numbered passage list. Send to `qwen3-32b` with JSON object
   mode:
   ```
   { answer, citations: [{ passage_number, quote }] }
   ```
   Or, if the model decides there isn't enough evidence,
   `{ answer: "INSUFFICIENT_EVIDENCE", citations: [] }`.
6. **Resolve quotes.** For each citation, run `resolveQuote` against the
   cited passage. Unresolved citations are dropped.
7. **Strip dead markers.** Any `[N]` in the answer that doesn't have a
   resolved citation gets removed from the text, so the UI never renders
   a dead link.
8. Set `citation.marker = passage_number` directly — the inline `[N]`
   markers in the answer always match the citation cards.

### 8.8 Quote resolver — `ai/quoteResolver.js`
The smart part of the system, but kept simple. Given a quote string and a
list of candidate paragraphs:
1. **Substring pass.** Normalize whitespace + case + curly-quote variants
   on both sides. Walk for the needle. Map normalized offsets back to
   original-text offsets.
2. **LCS fallback.** If exact substring fails, find the longest common
   substring of length ≥ 40 chars and resolve to that.
3. Return `{ paragraph, charStart, charEnd, claimText }` or `null`. The
   caller drops the citation on `null`.

This is the load-bearing primitive for source attribution: every UI
highlight comes from this function's offsets.

### 8.9 Vector helper — `ai/vec.js`
`normalize(vec)` returns a Float32Array unit vector; `dot(a, b)` returns
the inner product. Cosine = `dot(normalize(a), normalize(b))`. We
pre-normalize once at load time so the hot loop is just a dot product.

---

## 9. The async worker

There is **no separate worker process**. `runComparison()` lives in
`backend/src/worker.js` and is invoked from inside `POST /comparisons`
via `setImmediate`. The HTTP response returns `202 Accepted` immediately
while the worker runs in the same Node runtime.

The frontend polls `GET /comparisons/:id` every 3 seconds. The worker
writes `status` and `progress` mid-flight so polling sees the timeline
move. Progress updates use `updateOne` (not `comparison.save()`) so
they're race-free across the workflow.

Failure handling: every `await` inside the worker sits in one big
`try/catch`. On any throw, status flips to `'failed'` and the error
message is persisted. The frontend's Analysis page renders the failure
state when it sees that.

Wall-clock: ~20–40 s per comparison (one Groq call). Q&A: 1.5–20 s
depending on question complexity.

---

## 10. Customer journey under the hood

| User action | Backend ops | Collections touched |
|---|---|---|
| Lands on `/` | AuthGate renders | — |
| Submits team-new register | `POST /auth/register` validates, hashes pw, creates Firm + User | `InvestmentFirm`, `User` |
| Lands on `/billing/setup` | `GET /billing/plans`, `GET /billing/subscription` → 404 | `PricingPlan` |
| Clicks "Confirm & charge" | `POST /billing/subscribe` computes amount, persists | `Subscription`, `Payment` |
| Lands on `/dashboard` | `GET /comparisons` + `GET /reports` | `FilingComparison`, `ResearchReport` |
| Uploads PDF #1 + #2 | `POST /filings/upload` ×2, upserts Company, returns 202, kicks ingest | `Company`, `Filing`, `Paragraph` |
| Frontend polls | `GET /filings/:id` repeatedly | `Filing` |
| Both ready, submits | `POST /comparisons` validates, `setImmediate(runComparison)` | `FilingComparison` |
| Frontend polls comparison | `GET /comparisons/:id` | `FilingComparison` |
| Worker: cosine-pair → one judge call → quote-resolve → persist | Inserts ~6–10 Findings + ~12–18 Citations | `Finding`, `Citation` |
| Completed, FE navigates to `/analyses/:id` | `GET /comparisons/:id/findings` | `Finding` |
| User opens a finding | `GET /findings/:id` populates Paragraphs + Citations | `Finding`, `Paragraph`, `Citation` |
| User clicks **View page in PDF ↗** | `GET /filings/:id/file?token=…#page=N` streams the PDF inline | `Filing` (read), disk |
| User clicks "Save to report" | `POST /reports/:id/items` | `ResearchReport`, `ReportItem` |
| User goes to Q&A | `POST /qa/sessions`, `GET /qa/sessions/:id` | `QASession`, `Question`, `Citation` |
| User asks a question | `POST /qa/sessions/:id/questions` → embed → cosine top-20 → balance → judge → quote-resolve | `Question`, `Citation`, `Paragraph` (read), `Filing` (read) |
| Clicks `[N]` in answer | Smooth-scrolls to the matching citation card, pulses it | — (client only) |
| Downloads report PDF | `jspdf` builds the doc in the browser; no backend hit | — (client only) |

---

## 11. Frontend at a glance

Source: `frontend/src/`.

| Route | Page | Key API calls |
|---|---|---|
| `/` | `AuthGate` | `POST /auth/login`, `POST /auth/register` |
| `/billing/setup` | `PlanAndPay` | `GET /billing/plans`, `POST /billing/subscribe` |
| `/dashboard` | `Dashboard` | `GET /comparisons`, `GET /reports` |
| `/analyses/new` | `Setup` | `POST /filings/upload` ×2, `GET /filings/:id` (poll), `POST /comparisons`, `GET /comparisons/:id` (poll) |
| `/analyses/:id` | `Analysis` | `GET /comparisons/:id` (poll), `GET /comparisons/:id/findings` |
| `/analyses/:id/findings/:fid` | `Diff` | `GET /findings/:id` — summary on top, PREV + CURR citation cards below |
| `/analyses/:id/qa` | `QA` | `POST/GET /qa/sessions`, `POST /qa/sessions/:id/questions` |
| `/reports` | `ReportsList` | `GET /reports`, `POST /reports` |
| `/reports/:id` | `Report` | `GET /reports/:id`, item PATCH/DELETE, share toggle, **client-side `jspdf` export** |
| `/settings/team` | `TeamSettings` | members + invites |
| `/settings/billing` | `Billing` | `GET /billing/subscription` (read-only) |

### Shared citation components — `frontend/src/components/`
- **`CitationCard.jsx`** — renders one citation. Shows
  `FY{year} · p. {page}` + the full excerpt with `claimText` highlighted
  in-place via `<mark>` and `charStart` / `charEnd`. Footer link
  **"View page in PDF ↗"** opens the original PDF in a new tab at the
  cited page (`/filings/:id/file?token=…#page=N`).
- **`CitationInline.jsx`** — renders an inline `[N]` chip. Click →
  smooth-scrolls to `#citation-N` and pulses it. Also exports
  `renderAnswerWithCitations(text)` which splits an answer string on
  `[N]` markers and yields a flat array of strings + inline chips.

Both are used by `Diff.jsx` and `QA.jsx`. The data shape they consume is
identical: `Citation` with `excerpt + claimText + charStart + charEnd +
marker + filingId + page + filingYear`.

### Styling
Single monolithic `frontend/src/styles.css`. CSS custom properties at the
top (`--accent`, `--ink`, etc.), BEM-ish naming below. No Tailwind, no
CSS modules.

---

## 12. Things to study

If a reviewer asks "what was the most interesting / challenging," pick
one or two:

### Backend
1. **One-call comparison pipeline** (`worker.js` + `ai/compare.js`).
   Cosine = candidate generator; LLM = judge. The whole comparison is a
   single Groq call with strict JSON Schema. The LLM picks short
   verbatim quotes from each side; `quoteResolver` finds those quotes in
   the source text and reports byte-accurate char offsets. The
   "generator + verifier" pattern with rock-solid source attribution.
2. **Strict JSON Schema** (`ai/llm.js`). Groq's `gpt-oss-120b` supports
   constrained decoding against a JSON Schema. We define the change
   shape once and the model is forced to comply — no parse-tolerance
   hacks, no failure modes around malformed output.
3. **Quote resolver** (`ai/quoteResolver.js`). Substring with
   whitespace/case/quote normalization, plus an LCS fallback. Returns
   real char offsets into the source paragraph. Citations always anchor
   at a real span — or we drop them.
4. **The discriminated-union register** (`routes/auth.js`). One
   endpoint, three modes, Zod validates each shape separately.
5. **Server-computed pricing** (`routes/billing.js`). Client never sets
   the price; server reads `firm.seatLimit` and the plan row.

### Frontend
1. **Two-way citation wiring** (`CitationCard` + `CitationInline`).
   Inline `[N]` markers scroll + pulse the matching card; cards
   highlight the cited span via `charStart`/`charEnd`. Same data shape
   used by both Diff (finding citations) and QA (answer citations).
2. **PDF deep-link** — `CitationCard` builds a URL with the JWT as a
   query param so the browser PDF viewer opens the cited page directly.
   No PDF.js, no overlays, just the real file at `#page=N`.
3. **Team workspace primitives** — comparisons + reports both share a
   single firm-visibility pattern: `isShared` flag + denormalized `firmId`.
   The `canRead`/`canEdit`/`ownedReport` helpers in `routes/reports.js`
   express the three permission gradients (read / co-edit / owner-only).
4. **Notes thread on report items** (`pages/Report.jsx::NotesPanel`).
   Post-it tinted panel under each item, append-only, author + relative
   timestamp. On shared reports, any firm member contributes; only the
   note's author can delete their own.
5. **Client-side PDF export** (`pages/Report.jsx::downloadPdf`):
   walks report items, page-breaks automatically, never hits the backend.
