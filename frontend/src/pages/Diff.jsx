import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch, ApiError } from '../api.js';
import { useToast } from '../notifications.jsx';
import TopBar from '../components/TopBar.jsx';

// Diff page renders the previous and current excerpts as continuous text,
// with red strikethrough for removed words and green highlight for added.
// Each pane is a single flowing block — not a stack of cards.
export default function Diff() {
  const { id: comparisonId, findingId } = useParams();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch(`/findings/${findingId}`).then(setData);
  }, [findingId]);

  async function saveToReport() {
    setSaving(true);
    try {
      const reports = await apiFetch('/reports');
      let report = reports.find((r) => r.comparisonId?._id === comparisonId || r.comparisonId === comparisonId);
      if (!report) {
        const comp = await apiFetch(`/comparisons/${comparisonId}`);
        const title = `${comp.companyId?.name ?? 'Analysis'} ${comp.currentFilingId?.fiscalYear} vs ${comp.previousFilingId?.fiscalYear}`;
        report = await apiFetch('/reports', {
          method: 'POST',
          body: JSON.stringify({ title, comparisonId }),
        });
      }
      await apiFetch(`/reports/${report._id}/items`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'finding', refId: findingId }),
      });
      toast.success('Finding saved to report.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save to report.');
    } finally {
      setSaving(false);
    }
  }

  if (!data) return null;
  const { diff = [], currentParagraph, previousParagraph, citations = [] } = data;

  return (
    <div className="screen">
      <div className="app-grid">
        <TopBar />

        <div>
          <p className="eyebrow">Change detail</p>
          <h2>Filing diff.</h2>
          <p className="lead">
            See exactly which text changed between the two filings, with
            source page references on the right.
          </p>
        </div>

        <div className="diff-grid">
          <div className="diff-pane">
            <div className="diff-head">
              <div>
                <div className="row-title">Previous filing</div>
                <div className="row-sub">{data.section} · p. {previousParagraph?.page ?? '—'}</div>
              </div>
              <span className="chip">Previous</span>
            </div>
            <p className="diff-flow">
              <InlineDiff diff={diff} side="previous" />
            </p>
          </div>

          <div className="diff-pane">
            <div className="diff-head">
              <div>
                <div className="row-title">Current filing</div>
                <div className="row-sub">{data.section} · p. {currentParagraph?.page ?? '—'}</div>
              </div>
              <span className="chip soft-accent">Current</span>
            </div>
            <p className="diff-flow">
              <InlineDiff diff={diff} side="current" />
            </p>
          </div>

          <div className="diff-side">
            <h3 className="panel-title">Why this ranks {data.impact}</h3>
            <p className="panel-sub">{data.summary || data.excerpt || '—'}</p>
            <p className="panel-sub" style={{ marginTop: 12 }}>
              Impact score: {data.materialityScore?.toFixed(2)} · {data.type}
            </p>
            <div className="diff-actions">
              {citations.map((c, i) => (
                <span key={i} className="chip accent">FY{c.filingYear} · p. {c.page}</span>
              ))}
              <button className="button accent" onClick={saveToReport} disabled={saving}>
                {saving ? 'Saving…' : 'Save to report'}
              </button>
              <Link className="button ghost" to={`/analyses/${comparisonId}`}>← Back to results</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Render the appropriate side. For "previous", show equal + removed. For
// "current", show equal + added. Each segment is a span so the text flows
// naturally; removed/added get color-coded inline.
function InlineDiff({ diff, side }) {
  return diff.map((seg, i) => {
    if (seg.op === 'eq') return <span key={i}>{seg.text}</span>;
    if (seg.op === 'rem' && side === 'previous') {
      return <span key={i} className="diff-rem">{seg.text}</span>;
    }
    if (seg.op === 'add' && side === 'current') {
      return <span key={i} className="diff-add">{seg.text}</span>;
    }
    return null;
  });
}
