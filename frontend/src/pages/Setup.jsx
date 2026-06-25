import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, apiUpload, ApiError } from '../api.js';
import { useToast } from '../notifications.jsx';
import TopBar from '../components/TopBar.jsx';

// Single-page upload + compare. The user sees one consistent "processing"
// state from the moment they click Run until everything is done — no view
// switch in the middle. Internal flow:
//   1. upload PDF A, wait for ingest='ready'
//   2. upload PDF B, wait for ingest='ready'
//   3. POST /comparisons, poll until status='completed' (or 'failed')
//   4. navigate to /analyses/:id (which immediately shows results)
const POLL_MS = 4000;

export default function Setup() {
  const navigate = useNavigate();
  const toast = useToast();

  const [companyName, setCompanyName] = useState('');
  const [currentYear, setCurrentYear] = useState(2025);
  const [currentFile, setCurrentFile] = useState(null);
  const [previousYear, setPreviousYear] = useState(2024);
  const [previousFile, setPreviousFile] = useState(null);

  const [busy, setBusy] = useState(false);

  async function uploadOne(year, file) {
    const fd = new FormData();
    fd.append('companyName', companyName.trim());
    fd.append('fiscalYear', String(year));
    fd.append('file', file);
    const res = await apiUpload('/filings/upload', fd);
    return res.filingId;
  }

  async function waitForFiling(filingId, year) {
    while (true) {
      const f = await apiFetch(`/filings/${filingId}`);
      if (f.ingestStatus === 'ready') return f;
      if (f.ingestStatus === 'failed') throw new ApiError(500, 'INGEST_FAILED', `Could not process the ${year} PDF`);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  async function waitForComparison(comparisonId) {
    while (true) {
      const c = await apiFetch(`/comparisons/${comparisonId}`);
      if (c.status === 'completed') return c;
      if (c.status === 'failed') throw new ApiError(500, 'COMPARE_FAILED', c.error ?? 'Comparison failed');
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!currentFile || !previousFile) {
      toast.error('Pick both PDFs first.');
      return;
    }
    setBusy(true);
    try {
      const currentId = await uploadOne(currentYear, currentFile);
      await waitForFiling(currentId, currentYear);

      const previousId = await uploadOne(previousYear, previousFile);
      await waitForFiling(previousId, previousYear);

      const comp = await apiFetch('/comparisons', {
        method: 'POST',
        body: JSON.stringify({ currentFilingId: currentId, previousFilingId: previousId }),
      });
      await waitForComparison(comp._id);
      navigate(`/analyses/${comp._id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not finish the analysis.');
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <div className="app-grid">
        <TopBar />

        <div>
          <p className="eyebrow">New analysis</p>
          <h2>Upload two annual reports.</h2>
          <p className="lead">
            FilingLens parses both PDFs, ranks the most material changes, and
            attaches a citation to every finding.
          </p>
        </div>

        <div className="two-col">
          <div className="panel setup-card">
            <form onSubmit={handleSubmit}>
              <div className="login-field">
                <div className="field-label">Company name</div>
                <input
                  className="field-input"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Siemens AG"
                  required
                  disabled={busy}
                />
              </div>

              <div className="filing-pair">
                <FilingInput title="Current filing"  year={currentYear}  onYear={setCurrentYear}  file={currentFile}  onFile={setCurrentFile}  disabled={busy} />
                <FilingInput title="Previous filing" year={previousYear} onYear={setPreviousYear} file={previousFile} onFile={setPreviousFile} disabled={busy} />
              </div>

              {busy && (
                <div className="panel" style={{ marginTop: 24, padding: '18px 22px', background: 'var(--surface)' }}>
                  <div className="row-title">Processing your filings…</div>
                  <div className="row-sub">
                    Parsing each PDF, embedding paragraphs, comparing, and
                    summarizing. This usually takes 3–4 minutes. Keep this tab open.
                  </div>
                </div>
              )}

              <div className="actions">
                <button className="button" type="submit" disabled={busy || !companyName || !currentFile || !previousFile}>
                  {busy ? 'Working…' : 'Run analysis'}
                </button>
                {!busy && <Link className="button ghost" to="/dashboard">Cancel</Link>}
              </div>
            </form>
          </div>

          <div className="panel dark">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">What happens next</h3>
                <p className="panel-sub">
                  Each PDF is parsed page by page, paragraphs are embedded,
                  then we compare current vs previous and surface the most
                  material findings.
                </p>
              </div>
            </div>
            <div className="backend-steps">
              <span className="chip dark">1. Parse PDFs</span>
              <span className="chip dark">2. Embed paragraphs</span>
              <span className="chip dark">3. Compare current vs previous</span>
              <span className="chip dark">4. Rank by materiality</span>
              <span className="chip dark">5. Summarize top findings</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilingInput({ title, year, onYear, file, onFile, disabled }) {
  return (
    <div className="filing-card">
      <div className="row-title">{title}</div>
      <div style={{ marginTop: 12 }}>
        <div className="field-label">Fiscal year</div>
        <input
          className="field-input"
          type="number"
          min={2000}
          max={2099}
          value={year}
          onChange={(e) => onYear(Number(e.target.value))}
          disabled={disabled}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <div className="field-label">PDF</div>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          disabled={disabled}
          required
        />
        {file && <div className="row-sub" style={{ marginTop: 6 }}>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</div>}
      </div>
    </div>
  );
}
