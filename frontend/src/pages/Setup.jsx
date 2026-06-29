import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, apiUpload, ApiError } from '../api.js';
import { useToast } from '../notifications.jsx';
import TopBar from '../components/TopBar.jsx';

const POLL_MS = 4000;

export default function Setup() {
  const navigate = useNavigate();
  const toast = useToast();

  const [source, setSource] = useState('upload'); // 'upload' | 'url' | 'bundesanzeiger'

  // Shared
  const [companyName, setCompanyName] = useState('');
  const [currentYear, setCurrentYear] = useState(2025);
  const [previousYear, setPreviousYear] = useState(2024);
  const [busy, setBusy] = useState(false);

  // Upload mode
  const [currentFile, setCurrentFile] = useState(null);
  const [previousFile, setPreviousFile] = useState(null);

  // URL mode
  const [currentUrl, setCurrentUrl] = useState('');
  const [previousUrl, setPreviousUrl] = useState('');

  // Bundesanzeiger mode
  const [baQuery, setBaQuery] = useState('');
  const [baResults, setBaResults] = useState([]);
  const [baSearching, setBaSearching] = useState(false);
  const [currentReport, setCurrentReport] = useState(null);
  const [previousReport, setPreviousReport] = useState(null);

  async function waitForFiling(filingId, label) {
    while (true) {
      const f = await apiFetch(`/filings/${filingId}`);
      if (f.ingestStatus === 'ready') return f;
      if (f.ingestStatus === 'failed') {
        throw new ApiError(500, 'INGEST_FAILED', f.ingestError || `Could not process the ${label} filing`);
      }
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

  async function runCompare(currentId, previousId) {
    const comp = await apiFetch('/comparisons', {
      method: 'POST',
      body: JSON.stringify({ currentFilingId: currentId, previousFilingId: previousId }),
    });
    await waitForComparison(comp._id);
    navigate(`/analyses/${comp._id}`);
  }

  async function handleUploadSubmit(e) {
    e.preventDefault();
    if (!currentFile || !previousFile) { toast.error('Pick both PDFs first.'); return; }
    setBusy(true);
    try {
      const uploadOne = async (year, file) => {
        const fd = new FormData();
        fd.append('companyName', companyName.trim());
        fd.append('fiscalYear', String(year));
        fd.append('file', file);
        const res = await apiUpload('/filings/upload', fd);
        return res.filingId;
      };
      const currentId = await uploadOne(currentYear, currentFile);
      await waitForFiling(currentId, currentYear);
      const previousId = await uploadOne(previousYear, previousFile);
      await waitForFiling(previousId, previousYear);
      await runCompare(currentId, previousId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not finish the analysis.');
      setBusy(false);
    }
  }

  async function handleUrlSubmit(e) {
    e.preventDefault();
    if (!currentUrl || !previousUrl) { toast.error('Paste both PDF URLs first.'); return; }
    setBusy(true);
    try {
      const fetchOne = async (year, url) => {
        const res = await apiFetch('/filings/fetch-url', {
          method: 'POST',
          body: JSON.stringify({ url, companyName: companyName.trim(), fiscalYear: year }),
        });
        return res.filingId;
      };
      const currentId = await fetchOne(currentYear, currentUrl);
      await waitForFiling(currentId, currentYear);
      const previousId = await fetchOne(previousYear, previousUrl);
      await waitForFiling(previousId, previousYear);
      await runCompare(currentId, previousId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not finish the analysis.');
      setBusy(false);
    }
  }

  async function handleBaSubmit(e) {
    e.preventDefault();
    if (!currentReport || !previousReport) { toast.error('Select both reports from Bundesanzeiger.'); return; }
    setBusy(true);
    try {
      const fetchOne = async (year, report) => {
        const res = await apiFetch('/filings/bundesanzeiger/fetch', {
          method: 'POST',
          body: JSON.stringify({
            reportUrl: report.reportUrl,
            companyName: companyName.trim() || report.name,
            fiscalYear: year,
          }),
        });
        return res.filingId;
      };
      const currentId = await fetchOne(currentYear, currentReport);
      await waitForFiling(currentId, currentYear);
      const previousId = await fetchOne(previousYear, previousReport);
      await waitForFiling(previousId, previousYear);
      await runCompare(currentId, previousId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not finish the analysis.');
      setBusy(false);
    }
  }

  async function handleBaSearch(e) {
    e?.preventDefault();
    if (!baQuery.trim()) return;
    setBaSearching(true);
    try {
      const results = await apiFetch(`/filings/bundesanzeiger/search?q=${encodeURIComponent(baQuery.trim())}`);
      setBaResults(results);
      if (results.length === 0) toast.error('No filings found. Try a different company name.');
    } catch (err) {
      toast.error('Bundesanzeiger is currently unavailable. Try uploading a PDF instead.');
    } finally {
      setBaSearching(false);
    }
  }

  const canRunUpload = companyName.trim().length >= 2 && currentFile && previousFile;
  const canRunUrl = companyName.trim().length >= 2 && currentUrl && previousUrl;
  const canRunBa = (companyName.trim().length >= 2 || (currentReport && previousReport)) && currentReport && previousReport;

  return (
    <div className="screen">
      <div className="app-grid">
        <TopBar />

        <div>
          <p className="eyebrow">New analysis</p>
          <h2>Add two annual reports.</h2>
          <p className="lead">
            FilingLens parses both filings, ranks the most material changes, and
            attaches a citation to every finding.
          </p>
        </div>

        <div className="two-col">
          <div className="panel setup-card">
            {/* Source tabs */}
            <div className="product-nav" style={{ margin: '0 0 24px', display: 'inline-flex' }}>
              <span className={source === 'upload' ? 'active' : ''} onClick={() => !busy && setSource('upload')} style={{ cursor: busy ? 'default' : 'pointer' }}>Upload PDF</span>
              <span className={source === 'url' ? 'active' : ''} onClick={() => !busy && setSource('url')} style={{ cursor: busy ? 'default' : 'pointer' }}>Paste URL</span>
              <span className={source === 'bundesanzeiger' ? 'active' : ''} onClick={() => !busy && setSource('bundesanzeiger')} style={{ cursor: busy ? 'default' : 'pointer' }}>Bundesanzeiger</span>
            </div>

            {/* Shared company name field */}
            <div className="login-field">
              <div className="field-label">Company name</div>
              <input
                className="field-input"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Siemens AG"
                disabled={busy}
              />
            </div>

            {/* Upload mode */}
            {source === 'upload' && (
              <form onSubmit={handleUploadSubmit}>
                <div className="filing-pair">
                  <FilingInput title="Current filing" year={currentYear} onYear={setCurrentYear} file={currentFile} onFile={setCurrentFile} disabled={busy} />
                  <FilingInput title="Previous filing" year={previousYear} onYear={setPreviousYear} file={previousFile} onFile={setPreviousFile} disabled={busy} />
                </div>
                <BusyNotice busy={busy} />
                <div className="actions">
                  <button className="button" type="submit" disabled={busy || !canRunUpload}>{busy ? 'Working…' : 'Run analysis'}</button>
                  {!busy && <Link className="button ghost" to="/dashboard">Cancel</Link>}
                </div>
              </form>
            )}

            {/* URL mode */}
            {source === 'url' && (
              <form onSubmit={handleUrlSubmit}>
                <div className="filing-pair">
                  <UrlInput title="Current filing" year={currentYear} onYear={setCurrentYear} url={currentUrl} onUrl={setCurrentUrl} disabled={busy} />
                  <UrlInput title="Previous filing" year={previousYear} onYear={setPreviousYear} url={previousUrl} onUrl={setPreviousUrl} disabled={busy} />
                </div>
                <BusyNotice busy={busy} />
                <div className="actions">
                  <button className="button" type="submit" disabled={busy || !canRunUrl}>{busy ? 'Working…' : 'Run analysis'}</button>
                  {!busy && <Link className="button ghost" to="/dashboard">Cancel</Link>}
                </div>
              </form>
            )}

            {/* Bundesanzeiger mode */}
            {source === 'bundesanzeiger' && (
              <form onSubmit={handleBaSubmit}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input
                    className="field-input"
                    value={baQuery}
                    onChange={(e) => setBaQuery(e.target.value)}
                    placeholder="Search company name…"
                    disabled={busy || baSearching}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleBaSearch(e); } }}
                    style={{ flex: 1 }}
                  />
                  <button className="button" type="button" onClick={handleBaSearch} disabled={busy || baSearching || !baQuery.trim()}>
                    {baSearching ? 'Searching…' : 'Search'}
                  </button>
                </div>

                {baResults.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div className="field-label" style={{ marginBottom: 8 }}>Select current filing (year: {currentYear})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {baResults.map((r, i) => (
                        <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                          <input
                            type="radio"
                            name="currentReport"
                            checked={currentReport?.reportUrl === r.reportUrl}
                            onChange={() => setCurrentReport(r)}
                            disabled={busy}
                          />
                          <span>{r.name}{r.year ? ` · ${r.year}` : ''}</span>
                        </label>
                      ))}
                    </div>

                    <div className="field-label" style={{ margin: '14px 0 8px' }}>Select previous filing (year: {previousYear})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {baResults.map((r, i) => (
                        <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                          <input
                            type="radio"
                            name="previousReport"
                            checked={previousReport?.reportUrl === r.reportUrl}
                            onChange={() => setPreviousReport(r)}
                            disabled={busy}
                          />
                          <span>{r.name}{r.year ? ` · ${r.year}` : ''}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="filing-pair" style={{ marginBottom: 8 }}>
                  <div className="filing-card">
                    <div className="row-title">Current filing year</div>
                    <input className="field-input" type="number" min={2000} max={2099} value={currentYear} onChange={(e) => setCurrentYear(Number(e.target.value))} disabled={busy} style={{ marginTop: 8 }} />
                  </div>
                  <div className="filing-card">
                    <div className="row-title">Previous filing year</div>
                    <input className="field-input" type="number" min={2000} max={2099} value={previousYear} onChange={(e) => setPreviousYear(Number(e.target.value))} disabled={busy} style={{ marginTop: 8 }} />
                  </div>
                </div>

                <BusyNotice busy={busy} />
                <div className="actions">
                  <button className="button" type="submit" disabled={busy || !canRunBa}>{busy ? 'Working…' : 'Run analysis'}</button>
                  {!busy && <Link className="button ghost" to="/dashboard">Cancel</Link>}
                </div>
              </form>
            )}
          </div>

          <div className="panel dark">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">What happens next</h3>
                <p className="panel-sub">
                  Each filing is parsed into paragraphs and embedded. A single
                  judge call then reads the most-likely-changed pairs and
                  quotes the exact spans that prove each change.
                </p>
              </div>
            </div>
            <div className="backend-steps">
              <span className="chip dark">1. Ingest filing</span>
              <span className="chip dark">2. Validate document</span>
              <span className="chip dark">3. Embed paragraphs</span>
              <span className="chip dark">4. LLM judge: cite the changes</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BusyNotice({ busy }) {
  if (!busy) return null;
  return (
    <div className="panel" style={{ marginTop: 24, padding: '18px 22px', background: 'var(--surface)' }}>
      <div className="row-title">Processing your filings…</div>
      <div className="row-sub">
        Parsing, embedding paragraphs, comparing, and summarizing. This usually takes 3–4 minutes. Keep this tab open.
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
        />
        {file && <div className="row-sub" style={{ marginTop: 6 }}>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</div>}
      </div>
    </div>
  );
}

function UrlInput({ title, year, onYear, url, onUrl, disabled }) {
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
        <div className="field-label">PDF URL</div>
        <input
          className="field-input"
          type="url"
          value={url}
          onChange={(e) => onUrl(e.target.value)}
          placeholder="https://…/annual-report.pdf"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
