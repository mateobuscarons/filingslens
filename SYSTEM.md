# FilingLens — System Reference

A walkthrough of what every piece of the backend does and how the data flows.
Read top-to-bottom; cross-reference the file paths against the code.

---

## 1. What it is

FilingLens is an AI-assisted research platform for German equity analysts.
The product compresses three steps of a research workflow:

1. **Detect** — upload two PDF annual reports for the same company; the
   system extracts the most material changes, ranked, with citations.
2. **Verify** — ask company-level questions in natural language; answers
   are grounded in the indexed paragraphs and cite their sources.
3. **Capture** — save findings and answers into a shareable research
   report; export as PDF.

Two personas: **Elena Steiner** (firm admin, lingers on the diff view) and
**Daniel Chen** (solo analyst, lingers on Q&A). Solo and Team workspaces
share the same UX; Team adds invites + seat-based billing.

---

## 2. Stack & runtime

| Layer | Choice |
|---|---|
| Server | Node 20+, Express 4, ESM modules |
| Database | MongoDB (local), Mongoose 8 |
| Auth | JSON Web Tokens, signed with `JWT_SECRET` |
| Validation | Zod (per route schema, wrapped by `validate()` middleware) |
| AI provider | NVIDIA NIM, accessed via the OpenAI SDK pointed at `https://integrate.api.nvidia.com/v1` |
| Embeddings | `nvidia/nv-embedqa-e5-v5` (1024-dim) |
| LLM (summaries + QA) | `meta/llama-3.3-70b-instruct` (override via `LLM_SUMMARY_MODEL` / `LLM_QA_MODEL`) |
| PDF parsing | `pdfjs-dist/legacy/build/pdf.mjs` |
| Word-level diff | `diff` npm package (`diffWordsWithSpace`) |
| Frontend | React 18 + Vite + React Router, plain `fetch` |
| PDF export | `jspdf` (client-side only) |

Three processes during dev:
- Mongo (`brew services start mongodb-community`) on `:27017`
- Backend `npm run dev` (with `--watch` reload) on `:4000`
- Frontend `npm run dev` (Vite) on `:5173`

Environment variables (in `backend/.env`):
- `MONGO_URI`, `PORT`, `JWT_SECRET`, `CORS_ORIGIN`
- `NIM_API_KEY`, `NIM_EMBED_MODEL`, `LLM_SUMMARY_MODEL`, `LLM_QA_MODEL`

If `NIM_API_KEY` is missing, the AI endpoints return `503 NIM_UNAVAILABLE`
but auth + CRUD still work — see `backend/src/ai/nim.js`.

---

## 3. Boot sequence

`backend/src/index.js` is the entry point:

1. Load `.env` via `dotenv/config`.
2. Build the Express app, install CORS (open by default), JSON body parser
   (`2mb` limit).
3. Wire route modules under their prefixes (`/auth`, `/me`, `/billing`, ...).
4. Install one central error middleware that turns any thrown error into
   `{ error, message, fields }` with the right HTTP status.
5. Call `connectDb()` (`src/db.js`) → mongoose connects to `MONGO_URI`.
6. `app.listen(port)` once Mongo is up.

The worker is **not** a separate process. It lives in the same Node
runtime as the HTTP server, invoked via `setImmediate` from
`POST /comparisons` (see §9).

---

## 4. Filesystem layout

```
backend/
├── data/                        # uploaded PDFs (gitignored)
│   └── uploads/                 # multer drops here, then renamed
├── src/
│   ├── index.js                 # express bootstrap
│   ├── db.js                    # mongoose.connect
│   ├── worker.js                # async comparison runner
│   ├── middleware/
│   │   ├── auth.js              # JWT sign/verify, role guards
│   │   └── validate.js          # zod → 400 with field errors
│   ├── models/                  # one file per Mongoose schema
│   ├── routes/                  # one file per REST area
│   ├── ai/                      # everything that talks to NIM
│   │   ├── nim.js               # OpenAI SDK client (lazy)
│   │   ├── llm.js               # chat completion wrapper + retry
│   │   ├── embed.js             # passage/query embedding batches
│   │   ├── pdf.js               # pdfjs → lines → paragraphs
│   │   ├── ingest.js            # orchestrates parse → embed → persist
│   │   ├── compare.js           # diff + materiality + dedup + prompts
│   │   ├── qa.js                # RAG retrieval + answer composition
│   │   └── vec.js               # normalize + dot product
│   └── scripts/
│       └── seed.js              # plans + Elena recovery account
```

---

## 5. Data model

Every collection, what it stores, and how it links to the rest. **All
14 collections are listed**; the order roughly mirrors the customer
journey.

### 5.1 `User` — `models/user.js`
Single user account. `email` is unique + lowercased. `role` is one of
`solo | firm_admin | firm_analyst`. `firmId` is `null` for solo users.

### 5.2 `InvestmentFirm` — `models/firm.js`
A team workspace. `seatLimit` is set at team registration (5–25). Has a
`planStatus` legacy field (`active | past_due | canceled`) that we no
longer write to — Subscription is the source of truth post-rebuild.

### 5.3 `TeamInvite` — `models/teamInvite.js`
One row per invite. `code` is a unique uppercase hex string (8 chars).
`status` lifecycle: `pending → accepted | revoked`. Email + name are
recorded for the admin's reference; the invitee's actual credentials are
entered fresh at register-time.

### 5.4 `PricingPlan` — `models/pricingPlan.js`
Two rows seeded: `solo` (`basePrice=29, baseSeats=1, extraSeatPrice=0`)
and `team` (`basePrice=149, baseSeats=5, extraSeatPrice=25`). The
billing route computes the per-month amount from these fields and the
firm's `seatLimit`:
```
amount = basePrice + max(0, seats - baseSeats) * extraSeatPrice
```

### 5.5 `Subscription` — `models/subscription.js`
Created once at signup (`POST /billing/subscribe`). `subscriberType` is
`User` or `InvestmentFirm`; `subscriberId` points at one. **Immutable**
after creation — there is no upgrade or cancel endpoint by design.

### 5.6 `Payment` — `models/payment.js`
Mock-only. Created in the same call as the Subscription. `method`
defaults to `'mock'`, `status` to `'succeeded'`. `amount` is in euros.

### 5.7 `Company` — `models/company.js`
**Created dynamically** on the first upload. Schema: `name` (display),
`nameLower` (unique + indexed) for case-insensitive dedup. No ISIN, no
sector — both removed in the lean rebuild.

### 5.8 `Filing` — `models/filing.js`
A specific year's PDF for a Company. Unique index on
`(companyId, fiscalYear)` — re-uploading the same year overwrites. Has
`ingestStatus` lifecycle: `pending → parsing → embedding → ready | failed`.
The frontend polls `GET /filings/:id` to watch this transition.

### 5.9 `Paragraph` — `models/paragraph.js`
The output of ingest. `{ filingId, page, index, section, text, embedding }`.
`embedding` is a 1024-dim Float[]. Indexed by `(filingId, page, index)`.
**The single biggest collection by document count** — Siemens 2025 alone
produces ~4 300 paragraphs.

### 5.10 `FilingComparison` — `models/comparison.js`
One row per analysis. `userId`, `currentFilingId`, `previousFilingId`,
`status` (`pending → comparing → ranking → summarizing → completed | failed`),
`progress` (0–1), `counts` (modified/added/removed of the surfaced 15),
`overallScore` (mean materiality), `error` (string if failed).

### 5.11 `Finding` — `models/finding.js`
The engine output. One row per surfaced change. Hard-capped at 15 per
comparison (10 modified + 3 added + 2 removed). Carries:
- `type` (`modified | added | removed`)
- `section` (the surrounding heading from the PDF)
- `currentParagraphId`, `previousParagraphId` (one or both, depending on type)
- `similarity` (cosine between the matched paragraphs)
- `materialityScore`, `impact` (`high | medium | low`)
- `summary` — the one-sentence LLM rewrite
- `excerpt` — raw paragraph text
- `diff` — array of `{op, text}` word-level segments (used by the Diff page)

### 5.12 `Citation` — `models/citation.js`
Polymorphic citation row, used by both Findings and Questions.
`sourceType: 'Finding' | 'Question'` + `sourceId`. Points at a Paragraph
and **denormalizes** `filingId`, `filingYear`, `page`, and a `excerpt`
substring so the UI can render *"FY2025 p.283: …"* with one query.

### 5.13 `QASession` — `models/qa.js`
One per `(userId, companyId)` — enforced by a unique compound index.
Sessions are upserted, so asking a question about Siemens always lands
in the same conversation history.

### 5.14 `Question` — `models/qa.js`
One per Q&A turn. `text` is the question, `answer` is the 70B response,
`status` is `pending | ready | failed | no_evidence`. Citations are
stored in the `Citation` collection with `sourceType: 'Question'`.

### 5.15 `ResearchReport` — `models/report.js`
A user's report. `userId` is the owner, `firmId` is the user's firm (so
sharing can be scoped). `isShared` is the toggle. Optionally linked to
the `comparisonId` it was generated from.

### 5.16 `ReportItem` — `models/report.js`
One saved finding or Q&A answer inside a report. Polymorphic via
`kind: 'finding' | 'answer'` + `refId`. `note` is the analyst's
annotation, `order` for display order, `isActive` for soft-archive.

---

## 6. Auth & authorization

### 6.1 JWT
`middleware/auth.js`:
- `signToken(user)` issues an HS256 token with `{ sub: user._id, role }`,
  7-day TTL.
- `requireAuth(req, res, next)` reads `Authorization: Bearer <token>`,
  verifies, loads the User document into `req.user`. Returns 401 on
  any failure mode.
- `requireFirmAdmin(req, res, next)` is a post-auth guard that 403s if
  `req.user.role !== 'firm_admin'`.

### 6.2 Three register modes
`POST /auth/register` uses a Zod **discriminated union** on `mode`:
- `solo` → User created, no Firm.
- `team-new` → Firm created with `seatLimit`, User becomes `firm_admin`.
- `team-join` → Code looked up in `TeamInvite`; if pending and seat
  available, User becomes `firm_analyst` of `invite.firmId` and the
  invite flips to `accepted`.

No subscription is created here. The next step (`/billing/subscribe`)
creates Subscription + Payment in one shot. **The frontend forces this
step before any protected route is accessible.**

### 6.3 Frontend route guards
`frontend/src/auth.jsx` mirrors the backend states with three guards:
- `ProtectedRoute` — requires user + subscription. Bounces to `/` or
  `/billing/setup`.
- `AuthOnlyRoute` — requires user, tolerates missing sub. Used by
  `/billing/setup`.
- `AdminRoute` — adds `role === 'firm_admin'`. Used by `/settings/team`.

### 6.4 Cross-cutting
- Central error middleware in `index.js` shapes thrown errors uniformly.
- Zod field errors flatten into `fields: { fieldName: 'message' }` so the
  frontend can render inline per-input errors.
- `requireNim()` throws `NimUnavailableError` (503) when `NIM_API_KEY`
  is missing — handled gracefully by the same middleware.

---

## 7. REST surface

Every route the system ships, grouped by area. Auth column: 🔓 public,
🔐 any user, 🔑 admin only.

### Auth & profile
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | 🔓 | Solo / team-new / team-join (one schema, discriminated by `mode`) |
| POST | `/auth/login` | 🔓 | Email + password → JWT + public user |
| GET | `/me` | 🔐 | Current user + nested firm |
| PATCH | `/me` | 🔐 | Update name / password |

### Billing
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/billing/plans` | 🔐 | Both plans (solo + team) |
| GET | `/billing/subscription` | 🔐 | Current sub + plan + payment history. 404 if not subscribed yet |
| POST | `/billing/subscribe` | 🔐 | One-shot. Computes amount server-side, creates Subscription + Payment. 409 if already subscribed |

### Firm
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/firms/:id` | 🔐 | Firm details + member count |
| GET | `/firms/:id/members` | 🔐 | All members of the firm |
| DELETE | `/firms/:id/members/:userId` | 🔑 | Remove a member |
| GET | `/firms/:id/invites` | 🔐 | All invites (any status) |
| POST | `/firms/:id/invites` | 🔑 | Create invite. Seat check: `members + pending invites < seatLimit` |
| DELETE | `/firms/:id/invites/:inviteId` | 🔑 | Revoke (only `pending` invites can be revoked) |

### Companies & filings
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/companies` | 🔐 | All companies (created dynamically by uploads) |
| GET | `/companies/:id` | 🔐 | One company |
| GET | `/filings?companyId=…` | 🔐 | Filings for a company |
| GET | `/filings/:id` | 🔐 | One filing — polled for `ingestStatus` |
| POST | `/filings/upload` | 🔐 | Multipart: `companyName, fiscalYear, file`. Upserts Company by `nameLower`, returns 202 with `filingId` |

### Comparisons & findings
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/comparisons` | 🔐 | Mine, sorted newest first, with populated company + filings |
| POST | `/comparisons` | 🔐 | Validates same company + both ready; creates row; kicks worker via `setImmediate`; returns 202 |
| GET | `/comparisons/:id` | 🔐 | Polled for `status` + `counts` + `progress` |
| DELETE | `/comparisons/:id` | 🔐 | Cascade: removes Findings + Citations |
| GET | `/comparisons/:id/findings?limit=N` | 🔐 | Sorted by materiality desc |
| GET | `/findings/:id` | 🔐 | One finding + both Paragraphs (populated) + Citations |

### Q&A
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/qa/sessions` | 🔐 | All sessions for the user |
| POST | `/qa/sessions` | 🔐 | Upsert one per `(userId, companyId)` |
| GET | `/qa/sessions/:id` | 🔐 | Session + questions + their citations |
| POST | `/qa/sessions/:id/questions` | 🔐 | Triggers RAG + LLM, persists Question + Citations |
| DELETE | `/qa/sessions/:id/questions/:qid` | 🔐 | Cascade delete the question and its citations |

### Reports
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/reports` | 🔐 | Mine + firm-shared (where `firmId == user.firmId && isShared`) |
| POST | `/reports` | 🔐 | Create empty report (optionally linked to a comparison) |
| GET | `/reports/:id` | 🔐 | Report + items, items populated with full `target` + citations |
| PATCH | `/reports/:id` | 🔐 (owner) | Edit title / share toggle. Solo accounts blocked from sharing |
| DELETE | `/reports/:id` | 🔐 (owner) | Cascade delete items |
| POST | `/reports/:id/share` | 🔐 (owner) | Share with firm |
| DELETE | `/reports/:id/share` | 🔐 (owner) | Unshare |
| POST | `/reports/:id/items` | 🔐 (owner) | Save a finding or answer; auto-orders |
| PATCH | `/reports/:id/items/:itemId` | 🔐 (owner) | Edit note or soft-archive |
| DELETE | `/reports/:id/items/:itemId` | 🔐 (owner) | Hard-delete an item |

---

## 8. The AI pipeline

Everything that touches NIM lives in `backend/src/ai/`. The pipeline is
linear; here's the lifecycle of an analysis.

### 8.1 NIM client — `ai/nim.js`
A lazy singleton. `getNimClient()` returns the OpenAI SDK pointed at
NIM's base URL, or `null` if `NIM_API_KEY` is missing. `requireNim()` is
the throwing variant — routes that depend on AI use it.

### 8.2 LLM wrapper — `ai/llm.js`
`chat(task, messages, opts)` picks the model from env (`task` is
`'summary'` or `'qa'`), forwards to NIM's chat completions endpoint
with `temperature, max_tokens, timeout`. One automatic retry on
transient errors (`ETIMEDOUT`, `ECONNRESET`, timeout messages). Returns
the trimmed text content.

### 8.3 Embedding wrapper — `ai/embed.js`
`embedPassages(texts)` and `embedQuery(text)` differ only in NIM's
`input_type` parameter (`passage` vs `query` — important: NIM's encoder
tunes asymmetrically). Batches of 16 texts per request. `truncate: 'END'`
silently truncates anything > 512 tokens at NIM. Returns 1024-dim
vectors.

### 8.4 PDF parsing — `ai/pdf.js`
Two passes:
1. `extractPages(filePath)` — `pdfjs-dist` reads each page, then bucket
   text items by Y-coordinate to reconstruct lines, then sort each
   line by X. Output: `pages[].lines[]`.
2. `paginateToParagraphs(pages)` — iterate lines; detect headings
   (numbered, ALL-CAPS, or `Note N`) → set `currentSection`; otherwise
   accumulate into a buffer that flushes when it crosses 400 chars.
   Drop anything < 150 chars. Output: array of
   `{ page, index, section, text }`.

### 8.5 Ingest orchestrator — `ai/ingest.js`
Top-level function `ingestFiling(filingId, filePath)`:
1. Set `ingestStatus = 'parsing'`, save.
2. Extract + paginate. Save `pageCount`.
3. Set `ingestStatus = 'embedding'`. Wipe any pre-existing Paragraphs
   for this filing.
4. Iterate in batches of 32: embed → assemble Paragraph docs → bulk
   `insertMany`.
5. Set `ingestStatus = 'ready'`. Done.

Failure paths write `ingestStatus = 'failed'`.

### 8.6 Comparison engine — `ai/compare.js` + `worker.js`

This is the heart of the system. **Read this together with §10a of
`Plan.md`** which documents what's good and what still needs work.

`worker.js::runComparison(id)` is the orchestrator. The pipeline:

1. **Load.** Fetch both filings and all their paragraphs. Drop short or
   text-less paragraphs via `isUsefulParagraph()` (length ≥ 60, must
   contain a 4+ letter word). Set `comparison.status = 'comparing'`.
2. **Index.** `buildIndex(prev)` normalizes every previous-filing
   embedding to unit length so cosine = dot product.
3. **Match.** For each current paragraph, `findBestMatch` returns the
   prev paragraph with highest cosine. Classify by similarity:
   - `> 0.95` → unchanged, skip.
   - `[0.70, 0.95]` → **modified** (both paragraphs kept).
   - `< 0.70` → **added** (no good prev match).
   Any prev paragraph never matched → **removed**.
4. **Score.** Each finding gets a `materialityScore` (0–1) from a
   weighted sum:
   ```
   modified:  0.45 numericDelta + 0.30 keyword + 0.15 section + 0.10 length
   added/rem: 0.55 keyword + 0.25 section + 0.20 length
   ```
   `numericDelta` extracts the top-5 numeric values from each side and
   reports the max % change. Keywords are German+English red-flag
   words (`risiko`, `material`, `rückgang`, `verlust`, …). Section
   weight is high if the section name contains an "important" marker
   (`konzernabschluss`, `risikobericht`, …).
5. **Dedup.** Within each type bucket, sort by materiality descending.
   Then greedily drop anything with ≥ 0.80 Jaccard token overlap to
   something already kept. Keep the higher-scored one.
6. **Cap.** Take the top **10 modified + 3 added + 2 removed = 15
   findings**. Set `comparison.status = 'summarizing'`.
7. **Summarize.** Run all 15 through `summarizeFinding()` in parallel
   with concurrency 6. Three prompts (one per type) all ending with:
   *"Reply with EXACTLY one declarative sentence in the language of
   the excerpt. Numbers verbatim. No self-correction, no commentary."*
8. **Persist.** Insert 15 Finding docs (with `diff` arrays from
   `diff.diffWordsWithSpace` for modified findings; trivial single-op
   arrays for added/removed). Build Citations — each modified finding
   gets two (one for prev page, one for current page), added/removed
   gets one. Citations carry `filingId + filingYear + page + excerpt`.
9. **Done.** Set `comparison.status = 'completed', progress = 1`.

On any throw, the catch-all sets `status = 'failed', error = err.message`.

### 8.7 Q&A RAG — `ai/qa.js`

`answerQuestion(companyId, questionText)`:
1. Find all `Filing`s for the company with `ingestStatus = 'ready'`.
   If none → return `no_evidence`.
2. Load all their Paragraphs (one DB query). Embed the question with
   `input_type: 'query'`. Normalize the vector.
3. Score every paragraph by cosine (dot of normalized vectors). Sort
   desc, take top 4.
4. **Threshold short-circuit**: if the top score < 0.30, return
   `no_evidence`. Saves an LLM call on obviously off-topic questions.
5. Build a context block with passages labeled `[1] FY{year}, page X:`.
   Feed to 70B with the strict-RAG prompt — answer only from passages,
   cite every claim with `[N]`, answer in the question's language,
   reply `INSUFFICIENT_EVIDENCE` if not enough info.
6. Parse `[N]` tokens from the answer → keep only the cited passages
   → return them with `paragraphId, filingId, fiscalYear, page,
   excerpt, score, passageNumber`.
7. `routes/qa.js` writes the Question doc + insertMany the Citation
   docs (with `sourceType: 'Question'`).

### 8.8 Vector helper — `ai/vec.js`
Two pure functions: `normalize(vec)` returns a Float32Array unit
vector (divide by L2 norm), `dot(a, b)` returns the inner product.
Cosine = `dot(normalize(a), normalize(b))`. We pre-normalize once at
load time so the hot loop is just a dot product.

---

## 9. The async worker

There is **no separate worker process**. `runComparison()` lives in
`backend/src/worker.js` and is invoked from inside `POST /comparisons`
via `setImmediate(() => runComparison(id).catch(...))`. This makes the
HTTP response return immediately (`202 Accepted` with the new
comparison row) while the heavy lifting happens in the same Node
runtime.

The frontend watches progress by **polling** `GET /comparisons/:id`
every 3 seconds. The worker writes `status` and `progress` mid-flight
so polling sees the timeline move. We considered SSE (Server-Sent
Events) and decided against it during the lean rebuild — polling is
simpler to reason about and adds no new dependencies.

Failure handling: every `await` inside the worker is inside one big
`try/catch`. On any throw, status flips to `'failed'` and the error
message is persisted. The frontend's Analysis page renders the failure
state when it sees that.

**Concurrency model**: only one comparison runs at a time *per
process* unless multiple POSTs land near each other (Node's event
loop handles them independently, but they share the NIM rate-limit
budget). For the demo this is fine — one user at a time. For
production we'd queue with explicit concurrency limits.

---

## 10. Customer journey under the hood

The full path of a new analyst signing up and doing one analysis,
mapped to backend operations.

| User action | Backend ops | Collections touched |
|---|---|---|
| Lands on `/` | None — AuthGate renders | — |
| Submits team-new register | `POST /auth/register` validates, hashes pw, creates Firm + User | `InvestmentFirm`, `User` |
| Lands on `/billing/setup` | `GET /billing/plans` for prices, `GET /billing/subscription` returns 404 | `PricingPlan` |
| Clicks "Confirm & charge" | `POST /billing/subscribe` computes amount from `firm.seatLimit`, creates rows | `Subscription`, `Payment` |
| Lands on `/dashboard` | `GET /comparisons` + `GET /reports` for the metric strip | `FilingComparison`, `ResearchReport` |
| Goes to `/analyses/new`, uploads PDF #1 | `POST /filings/upload` (multipart), upserts Company by name, returns 202, kicks `ingestFiling` in background | `Company`, `Filing`, `Paragraph` |
| Frontend polls | `GET /filings/:id` repeatedly | `Filing` |
| Uploads PDF #2 | Same as #1 — same Company is reused | `Filing`, `Paragraph` |
| Both ready, frontend submits | `POST /comparisons` validates ready state, creates row, `setImmediate(runComparison)` | `FilingComparison` |
| Frontend polls comparison | `GET /comparisons/:id` returns `status`/`counts`/`progress` | `FilingComparison` |
| Worker filters, classifies, scores, dedups, caps, summarizes | Inserts 15 Findings + ~30 Citations | `Finding`, `Citation` |
| Comparison completes, FE navigates to `/analyses/:id` | `GET /comparisons/:id` (`status: completed`), then `GET /comparisons/:id/findings` | `Finding` |
| User opens a finding | `GET /findings/:id` populates both Paragraphs + Citations | `Finding`, `Paragraph`, `Citation` |
| User clicks "Save to report" on Diff | `GET /reports` to find/create report, `POST /reports/:id/items` (`kind: finding, refId`) | `ResearchReport`, `ReportItem` |
| User goes to Q&A | `POST /qa/sessions` upserts session for `(user, company)`, `GET /qa/sessions/:id` for history | `QASession`, `Question`, `Citation` |
| User asks a question | `POST /qa/sessions/:id/questions` → embed question, cosine over all company paragraphs, top-4 → 70B → parse citations | `Question`, `Citation`, `Paragraph` (read), `Filing` (read) |
| User saves answer to report | `POST /reports/:id/items` (`kind: answer, refId: question._id`) | `ReportItem` |
| User shares + downloads PDF | `POST /reports/:id/share`. PDF generation is **client-side only** via `jspdf` — no backend round-trip | `ResearchReport` |
| Admin invites a team member | `POST /firms/:id/invites` returns the code. Admin shares it manually. | `TeamInvite` |
| Invitee registers with code | `POST /auth/register` mode `team-join` looks up code, flips `accepted`, joins firm | `TeamInvite`, `User` |

---

## 11. Frontend at a glance

Just enough to know which page maps to which API. Source:
`frontend/src/pages/`.

| Route | Page | Key API calls |
|---|---|---|
| `/` | `AuthGate` | `POST /auth/login` / `POST /auth/register` |
| `/billing/setup` | `PlanAndPay` | `GET /billing/plans`, `POST /billing/subscribe` |
| `/dashboard` | `Dashboard` | `GET /comparisons`, `GET /reports` |
| `/analyses/new` | `Setup` | `POST /filings/upload` ×2, `GET /filings/:id` (poll), `POST /comparisons`, `GET /comparisons/:id` (poll) |
| `/analyses/:id` | `Analysis` | `GET /comparisons/:id` (poll until completed), `GET /comparisons/:id/findings` |
| `/analyses/:id/findings/:fid` | `Diff` | `GET /findings/:id`, `POST /reports/:id/items` |
| `/analyses/:id/qa` | `QA` | `POST/GET /qa/sessions`, `POST /qa/sessions/:id/questions` |
| `/reports` | `ReportsList` | `GET /reports`, `POST /reports` |
| `/reports/:id` | `Report` | `GET /reports/:id`, item PATCH/DELETE, share toggle, **client-side `jspdf` export** |
| `/settings/team` | `TeamSettings` | `GET /firms/:id/{members,invites}`, `POST/DELETE` invites, `DELETE` members |
| `/settings/billing` | `Billing` | `GET /billing/subscription` (read-only) |

`auth.jsx` is the shared context — loads `/me` and `/billing/subscription` on mount, gates all protected routes.

---

## 12. Things to study for tomorrow's code review

If the tutor asks "what was the most interesting/challenging code,"
these are the strongest answers — pick one or two per teammate.

### Backend
1. **The comparison pipeline** (`worker.js` + `ai/compare.js`).
   Cosine matching → classify → materiality (4-factor weighted sum)
   → greedy Jaccard dedup → cap → parallel LLM summarization (pool of
   6). All in ~250 lines. Knowable end-to-end. Be ready to defend the
   materiality weights and the choice to use cosine over a cross-encoder.
2. **The discriminated-union register** (`routes/auth.js`).
   One endpoint, three modes, Zod validates each shape separately.
   Teaches a clean way to model OR-branches in input validation.
3. **The async worker pattern** (`worker.js` + `setImmediate` in
   `routes/comparisons.js`). Single Node process, no queue, no SSE.
   Explain why polling > SSE here.
4. **Server-computed pricing** (`routes/billing.js`).
   The client never sets the price; the server reads `firm.seatLimit`
   and the plan row to compute `amount`. Prevents tampering.
5. **The Q&A RAG with refusal** (`ai/qa.js`).
   Strict prompt + threshold short-circuit + `INSUFFICIENT_EVIDENCE`
   sentinel → answers either ground in citations or refuse cleanly.
   No mid-ground hallucination.

### Frontend (less likely to be asked, but worth knowing)
1. **The three-state route guard** (`auth.jsx`): unauthenticated /
   authenticated-no-sub / authenticated. The `Root` component picks
   the destination based on those three states.
2. **The upload state machine** (`pages/Setup.jsx`): one page handles
   uploading, ingesting, comparing, and only navigates away once the
   whole pipeline is `completed`.
3. **The PDF export** (`pages/Report.jsx::downloadPdf`): 100% client-side
   via `jspdf`. Walks the items, page-breaks automatically. No backend
   route needed.
