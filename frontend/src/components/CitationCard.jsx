import React from 'react';
import { apiUrl } from '../api.js';

// Renders one citation card: the full paragraph excerpt with the cited span
// highlighted in-place. `id` is what CitationInline's scroll-to handler
// targets; `marker` shows the [N] badge in the card header. The footer link
// opens the original PDF in a new tab jumped to the cited page via the
// browser's native viewer (`#page=N`).
export default function CitationCard({ citation, marker, companyName, label, id, dim }) {
  const text = citation.excerpt || '';
  const start = Number.isInteger(citation.charStart) ? citation.charStart : -1;
  const end = Number.isInteger(citation.charEnd) ? citation.charEnd : -1;
  const hasSpan = start >= 0 && end > start && end <= text.length;

  const filingId = typeof citation.filingId === 'object' ? citation.filingId?._id : citation.filingId;
  const pdfHref = filingId ? `${apiUrl(`/filings/${filingId}/file`)}#page=${citation.page}` : null;

  return (
    <div id={id} className={`citation-card${dim ? ' dim' : ''}`}>
      <div className="citation-card-head">
        {marker != null && <span className="citation-marker">[{marker}]</span>}
        <span className="citation-card-meta">
          {label || ''}{label ? ' · ' : ''}
          {companyName ? `${companyName} · ` : ''}FY{citation.filingYear} · p. {citation.page}
        </span>
      </div>
      <p className="citation-excerpt">
        {hasSpan ? (
          <>
            {text.slice(0, start)}
            <mark className="citation-highlight">{text.slice(start, end)}</mark>
            {text.slice(end)}
          </>
        ) : (
          text
        )}
      </p>
      {pdfHref && (
        <a className="citation-pdf-link" href={pdfHref} target="_blank" rel="noopener noreferrer">
          View page in PDF ↗
        </a>
      )}
    </div>
  );
}
