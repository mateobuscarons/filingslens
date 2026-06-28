import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api.js';
import { useAuth } from '../auth.jsx';
import TopBar from '../components/TopBar.jsx';

function statusLabel(c) {
  if (c.status === 'completed') {
    const t = (c.counts?.modified ?? 0) + (c.counts?.added ?? 0) + (c.counts?.removed ?? 0);
    return `Completed · ${t} findings`;
  }
  if (c.status === 'failed') return 'Failed';
  return 'Running…';
}

function ownerOf(item) {
  // populated as { _id, name } in the GET routes
  return typeof item?.userId === 'object' ? item.userId : null;
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

  return (
    <div className="screen">
      <div className="app-grid">
        <TopBar />

        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>Hello, {firstName}.</h2>
          <p className="lead">Your recent comparisons and reports.</p>
        </div>

        <div className="metric-strip">
          <Metric value={comparisons.length} label="Analyses" />
          <Metric value={comparisons.filter((c) => c.status === 'completed').length} label="Completed" accent />
          <Metric value={reports.length} label="Reports" />
        </div>

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
            {comparisons.slice(0, 8).map((c) => {
              const owner = ownerOf(c);
              const isMine = owner?._id === user?.id;
              return (
                <div className="data-row" key={c._id}>
                  <div>
                    <div className="row-title">
                      {c.companyId?.name ?? 'Unknown'} · {c.currentFilingId?.fiscalYear} vs {c.previousFilingId?.fiscalYear}
                      {c.isShared && !isMine && owner?.name && (
                        <span className="chip soft-accent" style={{ marginLeft: 10, fontSize: 11 }}>
                          Shared by {owner.name}
                        </span>
                      )}
                      {c.isShared && isMine && (
                        <span className="chip soft-accent" style={{ marginLeft: 10, fontSize: 11 }}>
                          Shared
                        </span>
                      )}
                    </div>
                    <div className="row-sub">{statusLabel(c)}</div>
                  </div>
                  <Link className="chip soft-accent" to={`/analyses/${c._id}`}>Open</Link>
                </div>
              );
            })}
          </div>
        </div>

        {reports.length > 0 && (
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Reports</h3>
                <p className="panel-sub">Saved findings and Q&A answers.</p>
              </div>
              <Link className="button ghost" to="/reports">All reports</Link>
            </div>
            <div className="row-list">
              {reports.slice(0, 4).map((r) => {
                const owner = ownerOf(r);
                const isMine = owner?._id === user?.id;
                return (
                  <div className="data-row" key={r._id}>
                    <div>
                      <div className="row-title">{r.title}</div>
                      <div className="row-sub">
                        {r.isShared
                          ? (isMine ? 'Shared with firm' : `Shared by ${owner?.name ?? 'firm-mate'}`)
                          : 'Personal draft'}
                      </div>
                    </div>
                    <Link className="chip" to={`/reports/${r._id}`}>Open</Link>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ value, label, accent }) {
  return (
    <div className={`metric${accent ? ' accent' : ''}`}>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}
