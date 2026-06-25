import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../api.js';
import { useToast } from '../notifications.jsx';
import TopBar from '../components/TopBar.jsx';

export default function ReportsList() {
  const navigate = useNavigate();
  const toast = useToast();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    apiFetch('/reports').then(setReports).finally(() => setLoading(false));
  }, []);

  async function createReport() {
    setCreating(true);
    try {
      const report = await apiFetch('/reports', {
        method: 'POST',
        body: JSON.stringify({ title: 'New report' }),
      });
      navigate(`/reports/${report._id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create report.');
      setCreating(false);
    }
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <div className="screen">
      <div className="app-grid">
        <TopBar />

        <div>
          <p className="eyebrow">Reports</p>
          <h2>Your reports.</h2>
          <p className="lead">Saved findings and cited answers, organised into shareable analyst reports.</p>
        </div>

        <div className="two-col">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">All reports</h3>
                <p className="panel-sub">{reports.length} report{reports.length !== 1 ? 's' : ''} total</p>
              </div>
              <button className="button accent" onClick={createReport} disabled={creating}>
                {creating ? 'Creating…' : 'New report'}
              </button>
            </div>

            <div className="row-list">
              {loading && <p className="panel-sub" style={{ padding: '0 4px' }}>Loading…</p>}
              {!loading && reports.length === 0 && (
                <p className="panel-sub" style={{ padding: '0 4px' }}>
                  No reports yet. Save a finding from the diff view to get started.
                </p>
              )}
              {reports.map(r => (
                <div className="data-row" key={r._id}>
                  <div>
                    <div className="row-title">{r.title}</div>
                    <div className="row-sub">
                      {r.comparisonId
                        ? `${r.comparisonId.companyId?.name ?? 'Analysis'} · `
                        : ''}
                      {formatDate(r.updatedAt)}
                      {r.isShared && ' · Shared with firm'}
                      {r.userId?.name && r.userId.name !== undefined && ` · ${r.userId.name}`}
                    </div>
                  </div>
                  <Link className="chip soft-accent" to={`/reports/${r._id}`}>Open</Link>
                </div>
              ))}
            </div>
          </div>

          <div className="panel dark">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">How reports work</h3>
                <p className="panel-sub">
                  Save findings from the diff view or Q&A answers to a report. Annotate each item, then share with your firm.
                </p>
              </div>
            </div>
            <div className="row-list">
              <span className="chip accent">Save findings</span>
              <span className="chip dark">Add notes</span>
              <span className="chip dark">Share with firm</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
