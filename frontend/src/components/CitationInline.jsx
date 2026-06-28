import React from 'react';

// Renders an inline `[N]` marker inside answer text. Click → smooth-scroll
// to the matching citation card and pulse it.
export default function CitationInline({ marker, targetIdPrefix = 'citation-' }) {
  function handleClick(e) {
    e.preventDefault();
    const el = document.getElementById(`${targetIdPrefix}${marker}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('pulse');
    void el.offsetWidth; // restart CSS animation
    el.classList.add('pulse');
  }
  return (
    <button type="button" className="citation-inline" onClick={handleClick} title={`Jump to source [${marker}]`}>
      [{marker}]
    </button>
  );
}

// Splits an answer string on bracket markers `[N]` and yields a flat array
// of strings + CitationInline elements. Use in a JSX context:
//   <p>{renderAnswerWithCitations(answer, { targetIdPrefix })}</p>
export function renderAnswerWithCitations(answer, opts = {}) {
  if (!answer) return null;
  const parts = [];
  const re = /\[(\d+)\]/g;
  let lastIndex = 0;
  let m;
  while ((m = re.exec(answer)) !== null) {
    if (m.index > lastIndex) parts.push(answer.slice(lastIndex, m.index));
    parts.push(
      <CitationInline
        key={`c-${m.index}`}
        marker={parseInt(m[1], 10)}
        targetIdPrefix={opts.targetIdPrefix}
      />
    );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < answer.length) parts.push(answer.slice(lastIndex));
  return parts;
}
