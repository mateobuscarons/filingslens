import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api.js';
import { useAuth } from '../auth.jsx';
import TopBar from '../components/TopBar.jsx';

function statusLabel(status, findingsCount) {
  if (status === 'completed') return `Completed · ${findingsCount ?? 0} changes`;
  if (status === 'failed') return 'Failed';
  return 'Running…';
}

function impactChip(status) {
  if (status === 'completed') return <span className="chip soft-accent">Open</span>;
  if (status === 'failed') return <span className="chip red">Failed</span>;
  return <span className="chip">Running</span>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [comparisons, setComparisons] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([apiFetch('/comparisons'), apiFetch('/reports')])
      .then(([c, r]) => { setComparisons(c); setReports(r); })
      .finally(() => setLoading(false));
  }, []);

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const completed = comparisons.filter(c => c.status === 'completed').length;
  const drafts = reports.filter(r => !r.isShared).length;

  return (
    <div className="screen">
      <div className="app-grid">
        <TopBar />

        <div>
          <p className="eyebrow">Today</p>
          <h2>Good morning, {firstName}. What changed today?</h2>
          <p className="lead">
            Recent comparisons, high-impact findings, and draft reports, organised around your next decision.
          </p>
        </div>

        <div className="metric-strip">
          <div className="metric">
            <div className="metric-value">{comparisons.length}</div>
            <div className="metric-label">Recent analyses</div>
          </div>
          <div className="metric accent">
            <div className="metric-value">{completed}</div>
            <div className="metric-label">Completed</div>
          </div>
          <div className="metric">
            <div className="metric-value">{reports.length}</div>
            <div className="metric-label">Draft reports</div>
          </div>
        </div>

        <div className="two-col">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Recent analyses</h3>
                <p className="panel-sub">Pick up where you left off.</p>
              </div>
              <Link className="button accent" to="/analyses/new">New analysis</Link>
            </div>
            <div className="row-list">
              {loading && <p className="panel-sub" style={{ padding: '0 4px' }}>Loading…</p>}
              {!loading && comparisons.length === 0 && (
                <p className="panel-sub" style={{ padding: '0 4px' }}>No analyses yet. Start one above.</p>
              )}
              {comparisons.slice(0, 5).map(c => (
                <div className="data-row" key={c._id}>
                  <div>
                    <div className="row-title">
                      {c.companyId?.name ?? 'Unknown'} · {c.currentFilingId?.fiscalYear} vs {c.previousFilingId?.fiscalYear}
                    </div>
                    <div className="row-sub">{statusLabel(c.status, c.findingsCount)}</div>
                  </div>
                  <Link className="chip soft-accent" to={`/analyses/${c._id}`}>Open</Link>
                </div>
              ))}
            </div>
          </div>

          <div className="panel dark">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Citation-first</h3>
                <p className="panel-sub">Every change FilingLens shows comes with the source paragraph. Verify before you trust.</p>
              </div>
            </div>
            <div className="row-list">
              <span className="chip accent">Source citations</span>
              <span className="chip dark">Paragraph-level evidence</span>
              <span className="chip dark">Analyst notes</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
