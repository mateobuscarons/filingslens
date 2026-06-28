import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch, ApiError } from '../api.js';
import { useToast } from '../notifications.jsx';
import TopBar from '../components/TopBar.jsx';
import CitationCard from '../components/CitationCard.jsx';

// One finding = one LLM-identified change in a section, with up to two
// citations: PREV (marker 1) and CURR (marker 2). We render the summary on
// top and the citations side by side so the analyst can see the grounding
// without scrolling.
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
  const prev = citations.find((c) => c.marker === 1);
  const curr = citations.find((c) => c.marker === 2);

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

        <div className="citation-pair">
          {prev ? (
            <CitationCard
              citation={prev}
              marker={1}
              label="Previous"
              id="citation-1"
            />
          ) : (
            <div className="citation-card dim"><p className="citation-empty">Newly disclosed — no prior-year passage.</p></div>
          )}
          {curr ? (
            <CitationCard
              citation={curr}
              marker={2}
              label="Current"
              id="citation-2"
            />
          ) : (
            <div className="citation-card dim"><p className="citation-empty">No longer disclosed in the current filing.</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
