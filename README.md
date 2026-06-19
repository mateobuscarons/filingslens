# FilingLens

AI-assisted research platform for analysts at small German investment firms. Compares two annual reports paragraph-by-paragraph, ranks findings by materiality, and answers cited follow-up questions over indexed filings.

## Status

- ✅ Backend complete (auth, CRUD, PDF ingest, comparison engine, RAG Q&A, reports/team/billing)
- ✅ Siemens 2024 + 2025 PDFs included and tested end-to-end (see `backend/data/siemens-results.md`)
- 🚧 Frontend is just a Vite skeleton pinging `/health` — UI build pending
- 🚧 Docker compose written but not yet verified end-to-end

## Setup

You need: Node 20+, Mongo (local), and an NVIDIA NIM API key (free, get one at https://build.nvidia.com).

### 1. Mongo (one-time)
```
brew tap mongodb/brew && brew install mongodb-community
brew services start mongodb-community
```

### 2. Backend
```
cd backend
cp .env.example .env       # paste your NIM_API_KEY into this file
npm install
npm run setup              # seeds demo data + ingests Siemens PDFs (~90s, one-time)
npm run dev                # API on http://localhost:4000
```

### 3. Frontend (skeleton for now)
```
cd frontend
npm install
npm run dev                # http://localhost:5173 — just pings /health
```

## Demo credentials (seeded)

- **Elena Steiner** (firm admin) — `elena.steiner@frankfurt-investments.de` / `Demo1234!`
- **Daniel Chen** (solo) — `daniel.chen@chen-research.de` / `Demo1234!`

## Scripts (in `backend/`)

| Command | Purpose |
|---|---|
| `npm run dev` | start API with `--watch` |
| `npm run seed` | idempotent: plans, companies, filings, demo users |
| `npm run ingest` | parse + embed both Siemens PDFs into Mongo |
| `npm run setup` | seed + ingest (one-shot demo prep) |

## Layout

```
filinglens/
├── backend/                Express + Mongoose + NIM
│   ├── data/               Siemens PDFs + results writeup
│   ├── src/middleware/     JWT auth + Zod validation
│   ├── src/models/         13 Mongoose schemas (one per UML entity)
│   ├── src/ai/             NIM client, PDF parse, embed, compare, RAG
│   ├── src/routes/         10 HTTP surfaces (auth, comparisons, qa, reports…)
│   ├── src/scripts/        seed + ingestSiemens
│   ├── src/index.js        Express boot + central error handler
│   └── src/worker.js       async comparison job runner
├── frontend/               React + Vite (skeleton only)
└── docker-compose.yml      Mongo + backend + frontend
```

## Architecture in one paragraph

Backend is plain Express ESM with Mongoose. JWT auth (`Authorization: Bearer`). Zod validates every write. Central error middleware turns thrown errors into `{ error, message, fields }`. PDF ingest uses `pdfjs-dist` → paragraph chunks → NIM embedding (`nv-embedqa-e5-v5`, 1024-dim) stored on each paragraph. Comparison runs in-process: cosine match between filings → classify modified/added/removed → diff via the `diff` lib → materiality score from numeric delta + keywords + section + length → top-10 modified findings get a one-sentence LLM summary (NIM `llama-3.3-70b-instruct`). Q&A is RAG: embed the question → cosine over all paragraphs → top-4 → strict-prompt 70B with `[N]` citation parsing.
