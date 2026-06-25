import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../api.js';
import TopBar from '../components/TopBar.jsx';

const STEPS = [
  { label: 'Comparing paragraphs',     sub: 'Cosine similarity across all paragraph pairs' },
  { label: 'Ranking by materiality',   sub: 'Numeric delta + keyword signal + section weight' },
  { label: 'Summarizing top findings', sub: 'One LLM-generated sentence per finding' },
  { label: 'Complete',                 sub: 'Results ready' },
];

// status → which step index is active (0-3)
const ACTIVE = { pending: 0, comparing: 0, ranking: 1, summarizing: 2, completed: 3, failed: -1 };

function impactChipClass(impact) {
  if (impact === 'high') return 'chip red';
  if (impact === 'medium') return 'chip amber';
  return 'chip';
}

export default function Analysis() {
  const { id } = useParams();
  const [comparison, setComparison] = useState(null);
  const [findings, setFindings] = useState([]);

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
        lead="This usually takes 60–90 seconds. Stay on this page."
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

  // Completed — group by section
  const bySection = {};
  for (const f of findings) {
    const key = f.section || 'Unclassified';
    (bySection[key] ||= []).push(f);
  }
  const sections = Object.entries(bySection);
  const counts = comparison.counts ?? { modified: 0, added: 0, removed: 0 };

  return (
    <PageShell
      eyebrow="Results"
      heading="Impact-ranked findings."
      lead={`${findings.length} surfaced findings. ${counts.modified} modified, ${counts.added} added, ${counts.removed} removed.`}
    >
      <div className="actions" style={{ marginTop: 0 }}>
        <Link className="button accent" to={`/analyses/${id}/qa`}>Ask follow-up questions</Link>
        <Link className="button ghost" to="/reports">View reports</Link>
      </div>

      {sections.map(([section, list]) => (
        <div className="panel" key={section}>
          <div className="panel-head">
            <div>
              <h3 className="panel-title">{section}</h3>
              <p className="panel-sub">{list.length} {list.length === 1 ? 'finding' : 'findings'}</p>
            </div>
          </div>
          <div className="row-list">
            {list.map((f) => (
              <div className="data-row" key={f._id}>
                <div>
                  <div className="row-title">{f.summary || f.excerpt?.slice(0, 120)}</div>
                  <div className="row-sub">
                    {f.type} · materiality {f.materialityScore?.toFixed(2)}
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
