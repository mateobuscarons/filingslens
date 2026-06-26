import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch, ApiError } from '../api.js';
import { useToast } from '../notifications.jsx';
import TopBar from '../components/TopBar.jsx';

// The new Diff page. The pipeline now decides what's a real change via the
// LLM and attaches the passages the LLM grounded its answer in. We just
// render those passages as two side-by-side panels, one per filing year,
// with the LLM's one-sentence summary as the headline.
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
  const citations = data.citations ?? [];
  const byYear = {};
  for (const c of citations) (byYear[c.filingYear] ||= []).push(c);
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b); // older first

  return (
    <div className="screen">
      <div className="app-grid">
        <TopBar />

        <div>
          <p className="eyebrow">Change detail · {data.impact}</p>
          <h2>{data.summary || 'Change'}</h2>
          <p className="lead">{data.section}</p>
        </div>

        <div className="actions" style={{ marginTop: 0 }}>
          <button className="button accent" onClick={saveToReport} disabled={saving}>
            {saving ? 'Saving…' : 'Save to report'}
          </button>
          <Link className="button ghost" to={`/analyses/${comparisonId}`}>← Back to results</Link>
        </div>

        <div className="two-col">
          {years.map((year) => (
            <div key={year} className="panel">
              <div className="panel-head">
                <div>
                  <h3 className="panel-title">FY{year} filing</h3>
                  <p className="panel-sub">{byYear[year].length} cited passage{byYear[year].length === 1 ? '' : 's'}</p>
                </div>
              </div>
              <div style={{ padding: '0 40px 32px', display: 'grid', gap: 14 }}>
                {byYear[year].map((c, i) => (
                  <div key={i} style={{ padding: 18, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 16 }}>
                    <div className="row-sub" style={{ marginBottom: 8 }}>Page {c.page}</div>
                    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{c.excerpt}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
