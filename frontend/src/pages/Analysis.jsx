import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch, ApiError } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../notifications.jsx';
import TopBar from '../components/TopBar.jsx';

const STEPS = [
  { label: 'Matching paragraphs',  sub: 'Embedding cosine finds the closest prior paragraph for each current one.' },
  { label: 'Identifying changes',  sub: 'One LLM judge call: read the top candidate pairs and quote what materially changed.' },
  { label: 'Complete',             sub: 'Findings persisted with byte-accurate citation spans.' },
];

// status → which step index is active (0..STEPS.length-1)
const ACTIVE = { pending: 0, comparing: 0, summarizing: 1, completed: 2, failed: -1 };

function impactChipClass(impact) {
  if (impact === 'high') return 'chip red';
  if (impact === 'medium') return 'chip amber';
  return 'chip';
}

export default function Analysis() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [comparison, setComparison] = useState(null);
  const [findings, setFindings] = useState([]);
  const [sharing, setSharing] = useState(false);

  async function toggleShare() {
    if (!comparison) return;
    setSharing(true);
    try {
      const method = comparison.isShared ? 'DELETE' : 'POST';
      const updated = await apiFetch(`/comparisons/${id}/share`, { method });
      setComparison((prev) => ({ ...prev, isShared: updated.isShared }));
      toast.success(updated.isShared ? 'Shared with firm.' : 'Unshared.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update sharing.');
    } finally {
      setSharing(false);
    }
  }

  // Poll comparison every 3s until completed/failed.
  useEffect(() => {
    let cancelled = false;
    let timer;
    const tick = async () => {
      try {
        const data = await apiFetch(`/comparisons/${id}`);
        if (cancelled) return;
        setComparison(data);
        if (data.status === 'completed' || data.status === 'failed') return;
        timer = setTimeout(tick, 3000);
      } catch { /* ignore — try again */ timer = setTimeout(tick, 3000); }
    };
    tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id]);

  // Once completed, load the 15 surfaced findings.
  useEffect(() => {
    if (comparison?.status !== 'completed') return;
    apiFetch(`/comparisons/${id}/findings?limit=20`).then(setFindings);
  }, [comparison?.status, id]);

  if (!comparison) return null;

  const company = comparison.companyId?.name ?? 'Unknown';
  const currYear = comparison.currentFilingId?.fiscalYear ?? '—';
  const prevYear = comparison.previousFilingId?.fiscalYear ?? '—';
  const owner = typeof comparison.userId === 'object' ? comparison.userId : null;
  const isOwner = owner?._id === user?.id;
  const canShare = isOwner && Boolean(user?.firmId);

  if (comparison.status === 'failed') {
    return (
      <PageShell eyebrow="Failed" heading="Analysis failed." lead={comparison.error ?? 'An unexpected error occurred.'}>
        <div className="actions">
          <Link className="button accent" to="/analyses/new">Try again</Link>
          <Link className="button ghost" to="/dashboard">Dashboard</Link>
        </div>
      </PageShell>
    );
  }

  if (comparison.status !== 'completed') {
    const activeIdx = ACTIVE[comparison.status] ?? 0;
    return (
      <PageShell
        eyebrow="Running"
        heading={`Comparing ${company} · ${currYear} vs ${prevYear}.`}
        lead="Usually 20–40 seconds. One judge call across the top candidate pairs."
      >
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3 className="panel-title">Analysis progress</h3>
              <p className="panel-sub">{comparison.status}</p>
            </div>
          </div>
          <div className="progress-timeline">
            {STEPS.map((step, i) => {
              const state = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending';
              return (
                <div key={step.label} className={`progress-step ${state}`}>
                  <span className="progress-bullet">{state === 'done' ? '✓' : i + 1}</span>
                  <div>
                    <div className="row-title">{step.label}</div>
                    <div className="row-sub">{step.sub}</div>
                  </div>
                  <span className="chip">{state === 'done' ? 'done' : state === 'active' ? 'running' : 'queued'}</span>
                </div>
              );
            })}
          </div>
        </div>
      </PageShell>
    );
  }

  // Completed — group by LLM-assigned topic (the `section` field is now the
  // LLM-emitted "Board compensation"-style label, not the noisy PDF heading).
  const byTopic = {};
  for (const f of findings) {
    const key = f.section || 'Untitled';
    (byTopic[key] ||= []).push(f);
  }
  const topics = Object.entries(byTopic);
  const counts = comparison.counts ?? { modified: 0, added: 0, removed: 0 };

  return (
    <PageShell
      eyebrow="Results"
      heading="Changes the judge surfaced."
      lead={`${findings.length} findings · ${counts.modified} modified, ${counts.added} newly disclosed, ${counts.removed} no longer disclosed. Each finding cites a verbatim span in both filings.`}
    >
      <div className="actions" style={{ marginTop: 0 }}>
        <Link className="button accent" to={`/analyses/${id}/qa`}>Ask follow-up questions</Link>
        <Link className="button ghost" to="/reports">View reports</Link>
        {canShare && (
          <button className="button ghost" onClick={toggleShare} disabled={sharing}>
            {sharing ? '…' : comparison.isShared ? 'Unshare' : 'Share with firm'}
          </button>
        )}
        {!isOwner && owner?.name && (
          <span className="chip soft-accent" style={{ alignSelf: 'center' }}>Shared by {owner.name}</span>
        )}
      </div>

      {topics.map(([topic, list]) => (
        <div className="panel" key={topic}>
          <div className="panel-head">
            <div>
              <h3 className="panel-title">{topic}</h3>
              <p className="panel-sub">{list.length} {list.length === 1 ? 'finding' : 'findings'}</p>
            </div>
          </div>
          <div className="row-list">
            {list.map((f) => (
              <div className="data-row" key={f._id}>
                <div>
                  <div className="row-title">{f.summary || f.excerpt?.slice(0, 120)}</div>
                  <div className="row-sub">
                    {findingTypeLabel(f.type)}
                  </div>
                </div>
                <Link className={impactChipClass(f.impact)} to={`/analyses/${id}/findings/${f._id}`}>
                  Open
                </Link>
              </div>
            ))}
          </div>
        </div>
      ))}
    </PageShell>
  );
}

function findingTypeLabel(type) {
  if (type === 'added') return 'Newly disclosed';
  if (type === 'removed') return 'No longer disclosed';
  return 'Modified';
}

function PageShell({ eyebrow, heading, lead, children }) {
  return (
    <div className="screen">
      <div className="app-grid">
        <TopBar />
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{heading}</h2>
          <p className="lead">{lead}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
