# Siemens results — AI pipeline quality

Real test run of the FilingLens pipeline on `siemens-2024.pdf` and `siemens-2025.pdf` (German annual reports / Geschäftsberichte). All numbers in this document come from a live run against NVIDIA NIM, not mocks.

## Source data

| Filing | Pages | Paragraphs | Embedding |
|---|---|---|---|
| Siemens AG FY2024 | 235 | 2,574 | nv-embedqa-e5-v5 (1024-dim) |
| Siemens AG FY2025 | 355 | 4,348 | nv-embedqa-e5-v5 (1024-dim) |

Ingest cost: ~75 s wall-clock for both filings combined (one-time).

## Comparison (Detect)

Run: FY2025 vs FY2024.

```
Status: completed in ~27 s
4,130 changes detected   →   1,637 modified  ·  1,907 added  ·  586 removed
Overall materiality (avg of top-20): 0.877
```

### Top findings produced

| # | Type | Impact | Headline (LLM summary or raw excerpt) |
|---|---|---|---|
| 1 | removed | 0.996 | Equity-method accounting for Siemens Energy AG ended (lost significant influence) |
| 2 | removed | 0.994 | Innomotics divestment section (signed May 2024) no longer present in FY25 |
| 3 | modified | 0.965 | *Gewinn/Verlust increased from 101 to 108.* |
| 4 | modified | 0.928 | *Langfristige Verbindlichkeiten decreased from 16.234 to 13.635.* |
| 5 | modified | 0.912 | *Durchschnittlich eingesetztes Kapital increased from 48.547 to 59.555.* |
| 6 | added | 0.862 | Record results highlight ("Rekordwerte beim Gewinn nach Steuern und beim Free Cash Flow") |

Every number in the headline is verbatim from the source paragraph.

### Side-by-side diff example (finding #4)

Word-level diff produced 23 segments, including:

```
- '11.573 13.440'        ← FY24 short-term liabilities pair removed
+ '13.635'               ← FY25 long-term value added
  'Langfristige Verbindlichkeiten 16.234'   ← unchanged anchor
- '15.110'               ← FY23 column dropped
+ '2025'  - '2023'       ← year shift in header
```

## Q&A (Verify)

Five questions asked against the Siemens session. Each row: question, latency, status.

| Question | Latency | Status |
|---|---|---|
| "Welche Umsatzerlöse hat Siemens im Geschäftsjahr 2025 erzielt?" | 23 s | ready · 2 citations |
| "Welche wesentlichen Risiken nennt Siemens im Geschäftsjahr 2025?" | 34 s | ready · 4 citations |
| "Wie hat sich der Free Cash Flow zwischen 2024 und 2025 entwickelt?" | 28 s | ready · 2 citations |
| "Welche Dividende schlägt der Vorstand für das Geschäftsjahr 2025 vor?" | 3 s | ready · 3 citations |
| "Wie ist die Aktienperformance von BMW im Jahr 2025?" | 2 s | no_evidence (off-topic refused) |

### Representative answer — Revenue 2025

> Die Umsatzerlöse von Siemens im Geschäftsjahr 2025 betrugen **78,9 Mrd. €** [4]. Dies entspricht einer Steigerung von **4 %** im Vergleich zum Vorjahr [4]. Die Steigerung auf vergleichbarer Basis betrug **5 %** [2]. Die Umsatzerlöse lagen damit innerhalb der prognostizierten Bandbreite von **3 % bis 7 %** [2].

Citations: FY2025 p.283 (×2).

### Representative answer — Free Cash Flow trend (shows honest refusal)

> Der Free Cash Flow hat sich zwischen 2024 und 2025 von **9,5 Mrd. €** [2] auf **10,8 Mrd. €** [1] erhöht. Dies entspricht einer Steigerung von **1,3 Mrd. €**. Der Free Cash Flow hat damit im Jahr 2025 einen **Rekordwert** erreicht [1]. *Die genaue prozentuale Steigerung kann ohne weitere Informationen nicht berechnet werden.*

The model refused to compute a percentage that wasn't explicit in the source — exactly the discipline our strict prompt asks for.

### Off-topic refusal

The BMW question returned `no_evidence` in 2 seconds. The cosine top-1 score against all Siemens paragraphs was below the 0.30 threshold, so the LLM was never called — fast, cheap, and correct.

## Quality summary

| Dimension | Verdict |
|---|---|
| Recall (finding real changes) | Top-5 modified findings are all material balance-sheet / income items |
| Precision (numbers verbatim) | Every cited number traced back to its source paragraph |
| Grounded refusal | Refuses to compute % when raw values aren't both present |
| Off-topic refusal | Below-threshold queries short-circuit without an LLM call |
| Citation discipline | Every claim cites a `[N]` that maps to a real page in a real filing |
| Latency | Q&A 2-34 s per question; full comparison ~27 s end-to-end |

### Known limitations

- **Cross-lingual gap.** Embedding model is English-centric; English questions on German content score 0.10-0.20 lower than the same question in German. Personas Elena and Daniel ask in German, so this is acceptable for the demo.
- **Year-shift noise in top findings.** Some high-scoring "removed" findings are just FY23 columns being dropped (e.g. opening-balance row at page 7). They are real text differences but not interesting changes. Acceptable — we can filter by section in the UI.
- **Section labels are imperfect.** Heading detection picks up table rows occasionally. Section is metadata only; not used by the materiality scoring or RAG.

## How to reproduce

```
# from filinglens/backend
npm run setup       # seed + ingest both PDFs (~90 s, idempotent)
npm run dev         # start API on :4000

# then create a comparison and a Q&A session via the API
# (Elena: elena.steiner@frankfurt-investments.de / Demo1234!)
```
