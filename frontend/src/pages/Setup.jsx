import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, apiUpload, ApiError } from '../api.js';
import { useToast } from '../notifications.jsx';
import TopBar from '../components/TopBar.jsx';

// One-page "upload + compare" flow. The page walks a small state machine:
//   idle              user fills the form
//   uploading-current uploading first PDF
//   parsing-current   polling GET /filings/:id until ready
//   uploading-prev    uploading second PDF
//   parsing-prev      polling GET /filings/:id until ready
//   creating          POST /comparisons, then navigate to /analyses/:id
// On any error we drop back to idle and show a toast.
const POLL_MS = 4000;

export default function Setup() {
  const navigate = useNavigate();
  const toast = useToast();

  const [companyName, setCompanyName] = useState('');
  const [currentYear, setCurrentYear] = useState(2025);
  const [currentFile, setCurrentFile] = useState(null);
  const [previousYear, setPreviousYear] = useState(2024);
  const [previousFile, setPreviousFile] = useState(null);

  const [phase, setPhase] = useState('idle');
  const [status, setStatus] = useState('');

  async function uploadOne(label, year, file) {
    const fd = new FormData();
    fd.append('companyName', companyName.trim());
    fd.append('fiscalYear', String(year));
    fd.append('file', file);
    setStatus(`Uploading ${label} (${year})…`);
    const res = await apiUpload('/filings/upload', fd);
    return res.filingId;
  }

  async function waitUntilReady(label, filingId) {
    setStatus(`Parsing & embedding ${label}…`);
    while (true) {
      const f = await apiFetch(`/filings/${filingId}`);
      if (f.ingestStatus === 'ready') return f;
      if (f.ingestStatus === 'failed') throw new ApiError(500, 'INGEST_FAILED', `Could not process ${label} PDF`);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!currentFile || !previousFile) {
      toast.error('Pick both PDFs first.');
      return;
    }
    try {
      setPhase('uploading-current');
      const currentId = await uploadOne('current filing', currentYear, currentFile);
      setPhase('parsing-current');
      await waitUntilReady(`current filing (${currentYear})`, currentId);

      setPhase('uploading-prev');
      const previousId = await uploadOne('previous filing', previousYear, previousFile);
      setPhase('parsing-prev');
      await waitUntilReady(`previous filing (${previousYear})`, previousId);

      setPhase('creating');
      setStatus('Starting comparison…');
      const comp = await apiFetch('/comparisons', {
        method: 'POST',
        body: JSON.stringify({ currentFilingId: currentId, previousFilingId: previousId }),
      });
      navigate(`/analyses/${comp._id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Upload failed.');
      setPhase('idle'); setStatus('');
    }
  }

  const busy = phase !== 'idle';

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
                <FilingInput
                  title="Current filing"
                  year={currentYear}
                  onYear={setCurrentYear}
                  file={currentFile}
                  onFile={setCurrentFile}
                  disabled={busy}
                />
                <FilingInput
                  title="Previous filing"
                  year={previousYear}
                  onYear={setPreviousYear}
                  file={previousFile}
                  onFile={setPreviousFile}
                  disabled={busy}
                />
              </div>

              {busy && <ProgressStrip phase={phase} status={status} />}

              <div className="actions">
                <button className="button" type="submit" disabled={busy || !companyName || !currentFile || !previousFile}>
                  {busy ? 'Working…' : 'Run analysis'}
                </button>
                <Link className="button ghost" to="/dashboard">Cancel</Link>
              </div>
            </form>
          </div>

          <div className="panel dark">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">What happens next</h3>
                <p className="panel-sub">
                  Each PDF is parsed page by page, paragraphs are embedded,
                  then we compare current vs previous and surface the 15
                  most material findings.
                </p>
              </div>
            </div>
            <div className="backend-steps">
              <span className="chip accent">1. Upload & parse current</span>
              <span className="chip dark">2. Upload & parse previous</span>
              <span className="chip dark">3. Compare paragraphs</span>
              <span className="chip dark">4. Rank by materiality</span>
              <span className="chip dark">5. Summarize top 15</span>
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

function ProgressStrip({ phase, status }) {
  return (
    <div className="panel" style={{ marginTop: 24, padding: '16px 20px', background: 'var(--surface)' }}>
      <div className="row-title">{phase.replace(/-/g, ' ')}</div>
      <div className="row-sub">{status}</div>
    </div>
  );
}
