import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../api.js';
import { useToast } from '../notifications.jsx';
import TopBar from '../components/TopBar.jsx';

export default function Setup() {
  const navigate = useNavigate();
  const toast = useToast();

  const [companies, setCompanies] = useState([]);
  const [filings, setFilings] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [currentFilingId, setCurrentFilingId] = useState('');
  const [previousFilingId, setPreviousFilingId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch('/companies').then(setCompanies);
  }, []);

  useEffect(() => {
    if (!companyId) { setFilings([]); setCurrentFilingId(''); setPreviousFilingId(''); return; }
    apiFetch(`/filings?companyId=${companyId}`).then(data => {
      setFilings(data);
      setCurrentFilingId(data[0]?._id ?? '');
      setPreviousFilingId(data[1]?._id ?? '');
    });
  }, [companyId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const comparison = await apiFetch('/comparisons', {
        method: 'POST',
        body: JSON.stringify({ currentFilingId, previousFilingId }),
      });
      navigate(`/analyses/${comparison._id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        toast.error(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  const selectedCompany = companies.find(c => c._id === companyId);
  const currentFiling = filings.find(f => f._id === currentFilingId);
  const previousFiling = filings.find(f => f._id === previousFilingId);

  return (
    <div className="screen">
      <div className="app-grid">
        <TopBar />

        <div>
          <p className="eyebrow">New analysis</p>
          <h2>Pick the current and previous filing.</h2>
          <p className="lead">
            FilingLens compares two annual reports paragraph by paragraph and ranks the highest-impact findings.
          </p>
        </div>

        <div className="two-col">
          <div className="panel setup-card">
            <form onSubmit={handleSubmit}>
              {/* Company selector */}
              <div style={{ marginBottom: 28 }}>
                <div className="field-label" style={{ marginBottom: 8 }}>Company</div>
                <select
                  value={companyId}
                  onChange={e => setCompanyId(e.target.value)}
                  required
                  style={{
                    width: '100%', padding: '14px 18px', borderRadius: 16,
                    border: '1px solid var(--line)', background: 'var(--bg)',
                    fontSize: 15, fontWeight: 700, color: 'var(--ink)',
                    fontFamily: 'inherit', cursor: 'pointer',
                  }}
                >
                  <option value="">Select a company…</option>
                  {companies.map(c => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {selectedCompany && (
                <>
                  <h3 className="panel-title">{selectedCompany.name}</h3>
                  {selectedCompany.isin && (
                    <p className="panel-sub">ISIN {selectedCompany.isin} · {selectedCompany.sector}</p>
                  )}
                  <div className="filing-pair">
                    <div className="filing-card">
                      <div className="row-title">Current filing</div>
                      <div style={{ marginTop: 12 }}>
                        <select
                          value={currentFilingId}
                          onChange={e => setCurrentFilingId(e.target.value)}
                          required
                          style={{
                            width: '100%', padding: '10px 14px', borderRadius: 12,
                            border: '1px solid var(--line)', background: 'var(--surface)',
                            fontSize: 13, fontWeight: 700, color: 'var(--ink)', fontFamily: 'inherit',
                          }}
                        >
                          {filings.map(f => (
                            <option key={f._id} value={f._id}>{selectedCompany.name} {f.fiscalYear}</option>
                          ))}
                        </select>
                      </div>
                      {currentFiling?.sourceUrl && (
                        <div className="row-sub" style={{ marginTop: 10 }}>
                          <a href={currentFiling.sourceUrl} target="_blank" rel="noopener">Open official PDF</a>
                        </div>
                      )}
                    </div>

                    <div className="filing-card">
                      <div className="row-title">Previous filing</div>
                      <div style={{ marginTop: 12 }}>
                        <select
                          value={previousFilingId}
                          onChange={e => setPreviousFilingId(e.target.value)}
                          required
                          style={{
                            width: '100%', padding: '10px 14px', borderRadius: 12,
                            border: '1px solid var(--line)', background: 'var(--surface)',
                            fontSize: 13, fontWeight: 700, color: 'var(--ink)', fontFamily: 'inherit',
                          }}
                        >
                          {filings.map(f => (
                            <option key={f._id} value={f._id}>{selectedCompany.name} {f.fiscalYear}</option>
                          ))}
                        </select>
                      </div>
                      {previousFiling?.sourceUrl && (
                        <div className="row-sub" style={{ marginTop: 10 }}>
                          <a href={previousFiling.sourceUrl} target="_blank" rel="noopener">Open official PDF</a>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {error && (
                <p style={{ marginTop: 16, color: 'var(--red)', fontSize: 13, fontWeight: 700 }}>{error}</p>
              )}

              <div className="actions">
                <button
                  className="button"
                  type="submit"
                  disabled={loading || !currentFilingId || !previousFilingId}
                >
                  {loading ? 'Starting…' : 'Run analysis'}
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
                  FilingLens parses both reports, scores section-level changes, and attaches a source citation to each ranked finding.
                </p>
              </div>
            </div>
            <div className="backend-steps">
              <span className="chip accent">1. Fetch both filings</span>
              <span className="chip dark">2. Extract paragraphs</span>
              <span className="chip dark">3. Score changes</span>
              <span className="chip dark">4. Rank by impact</span>
              <span className="chip dark">5. Attach citations</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
