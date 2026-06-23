import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../api.js';
import TopBar from '../components/TopBar.jsx';

const STEPS = [
  { key: 'fetch',      label: 'Fetched both filings',          sub: 'Current and previous loaded from storage' },
  { key: 'extract',    label: 'Extracted paragraphs',          sub: 'PDF text split into indexed paragraphs' },
  { key: 'compare',   label: 'Scoring section-level changes', sub: 'Cosine similarity across all paragraph pairs' },
  { key: 'rank',      label: 'Building findings',             sub: 'Saving ranked changes with impact scores' },
  { key: 'summarize', label: 'Attaching citations',           sub: 'LLM summaries + source paragraphs linked' },
  { key: 'complete',  label: 'Marking analysis complete',      sub: 'Results ready' },
];

function stepState(index, status) {
  const doneAt = { pending: -1, comparing: 1, ranking: 2, summarizing: 3, completed: 5, failed: -1 };
  const activeAt = { pending: 0, comparing: 2, ranking: 3, summarizing: 4, completed: -1, failed: -1 };
  const done = doneAt[status] ?? -1;
  const active = activeAt[status] ?? -1;
  if (index <= done) return 'done';
  if (index === active) return 'active';
  return 'pending';
}

function impactChipClass(impact) {
  if (impact === 'high') return 'chip red';
  if (impact === 'medium') return 'chip amber';
  return 'chip';
}

export default function Analysis() {
  const { id } = useParams();
  const [comparison, setComparison] = useState(null);
  const [findings, setFindings] = useState([]);
  const [loadingFindings, setLoadingFindings] = useState(false);
  const [sectionFilter, setSectionFilter] = useState('');
  const [highOnly, setHighOnly] = useState(false);

  const fetchComparison = useCallback(() => {
    return apiFetch(`/comparisons/${id}`).then(setComparison);
  }, [id]);

  // Poll until completed or failed
  useEffect(() => {
    fetchComparison();
    const interval = setInterval(() => {
      fetchComparison().then(() => {
        setComparison(prev => {
          if (prev?.status === 'completed' || prev?.status === 'failed') {
            clearInterval(interval);
          }
          return prev;
        });
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchComparison]);

  // Load findings once completed
  useEffect(() => {
    if (comparison?.status !== 'completed') return;
    setLoadingFindings(true);
    apiFetch(`/comparisons/${id}/findings?limit=100`)
      .then(setFindings)
      .finally(() => setLoadingFindings(false));
  }, [comparison?.status, id]);

  if (!comparison) return null;

  const isCompleted = comparison.status === 'completed';
  const isFailed = comparison.status === 'failed';
  const company = comparison.companyId?.name ?? 'Unknown';
  const currentYear = comparison.currentFilingId?.fiscalYear ?? '—';
  const previousYear = comparison.previousFilingId?.fiscalYear ?? '—';
  const totalChanges = (comparison.counts?.modified ?? 0) + (comparison.counts?.added ?? 0) + (comparison.counts?.removed ?? 0);
  const highImpact = findings.filter(f => f.impact === 'high').length;

  const sections = [...new Set(findings.map(f => f.section).filter(Boolean))];
  const filtered = findings.filter(f => {
    if (highOnly && f.impact !== 'high') return false;
    if (sectionFilter && f.section !== sectionFilter) return false;
    return true;
  });

  if (!isCompleted && !isFailed) {
    const pct = Math.round(comparison.progress ?? 0);
    return (
      <div className="screen">
        <div className="app-grid">
          <TopBar />
          <div>
            <p className="eyebrow">Running</p>
            <h2>Comparing {company} · {currentYear} vs {previousYear}.</h2>
            <p className="lead">This takes around 30–60 seconds. Feel free to keep working.</p>
          </div>
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Analysis progress</h3>
                <p className="panel-sub">{pct > 0 ? `${pct}% complete` : 'Starting…'}</p>
              </div>
              {pct > 0 && <span className="chip soft-accent">{pct}%</span>}
            </div>
            <div className="progress-timeline">
              {STEPS.map((step, i) => {
                const state = stepState(i, comparison.status);
                return (
                  <div key={step.key} className={`progress-step ${state}`}>
                    <span className="progress-bullet">{state === 'done' ? '✓' : i + 1}</span>
                    <div>
                      <div className="row-title">{step.label}</div>
                      <div className="row-sub">{step.sub}</div>
                    </div>
                    <span className="chip">
                      {state === 'done' ? 'done' : state === 'active' ? 'running' : 'queued'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="screen">
        <div className="app-grid">
          <TopBar />
          <div>
            <p className="eyebrow">Failed</p>
            <h2>Analysis failed.</h2>
            <p className="lead">{comparison.error ?? 'An unexpected error occurred.'}</p>
          </div>
          <div className="actions">
            <Link className="button accent" to="/analyses/new">Try again</Link>
            <Link className="button ghost" to="/dashboard">Dashboard</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="app-grid">
        <TopBar />
        <div>
          <p className="eyebrow">Results</p>
          <h2>Impact-ranked findings.</h2>
          <p className="lead">{totalChanges} changes detected. Start with the highest impact.</p>
        </div>

        <div className="metric-strip">
          <div className="metric">
            <div className="metric-value">{totalChanges}</div>
            <div className="metric-label">Detected changes</div>
          </div>
          <div className="metric accent">
            <div className="metric-value">{highImpact}</div>
            <div className="metric-label">High impact</div>
          </div>
          <div className="metric">
            <div className="metric-value">{comparison.counts?.modified ?? 0}</div>
            <div className="metric-label">Modified</div>
          </div>
        </div>

        <div className="two-col">
          <div className="panel">
            <div className="row-list">
              {loadingFindings && <p className="panel-sub" style={{ padding: '0 4px' }}>Loading findings…</p>}
              {!loadingFindings && filtered.length === 0 && (
                <p className="panel-sub" style={{ padding: '0 4px' }}>No findings match the current filter.</p>
              )}
              {filtered.map(f => (
                <div className="data-row" key={f._id}>
                  <div>
                    <div className="row-title">{f.summary || f.excerpt?.slice(0, 120) || '—'}</div>
                    <div className="row-sub">
                      {f.section} · impact {f.materialityScore?.toFixed(2)}
                    </div>
                  </div>
                  <Link className={impactChipClass(f.impact)} to={`/analyses/${id}/findings/${f._id}`}>
                    {f.impact === 'high' ? 'High' : f.impact === 'medium' ? 'Medium' : 'Low'}
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <div className="panel dark">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Filter</h3>
                <p className="panel-sub">Narrow by section or impact.</p>
              </div>
            </div>
            <div className="backend-steps">
              <span
                className={`chip ${highOnly ? 'accent' : 'dark'}`}
                style={{ cursor: 'pointer' }}
                onClick={() => setHighOnly(p => !p)}
              >
                High only
              </span>
              <span
                className={`chip ${!sectionFilter ? 'accent' : 'dark'}`}
                style={{ cursor: 'pointer' }}
                onClick={() => setSectionFilter('')}
              >
                All sections
              </span>
              {sections.slice(0, 6).map(s => (
                <span
                  key={s}
                  className={`chip ${sectionFilter === s ? 'accent' : 'dark'}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSectionFilter(s === sectionFilter ? '' : s)}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
