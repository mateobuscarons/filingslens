import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch, ApiError } from '../api.js';
import { useToast } from '../notifications.jsx';
import TopBar from '../components/TopBar.jsx';

export default function QA() {
  const { id: comparisonId } = useParams();
  const toast = useToast();

  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    apiFetch(`/comparisons/${comparisonId}`).then(async comp => {
      const companyId = comp.companyId?._id ?? comp.companyId;
      setCompanyName(comp.companyId?.name ?? '');
      const s = await apiFetch('/qa/sessions', {
        method: 'POST',
        body: JSON.stringify({ companyId }),
      });
      const detail = await apiFetch(`/qa/sessions/${s._id}`);
      setSession(detail.session);
      setQuestions(detail.questions);
      if (detail.questions.length > 0) setSelected(detail.questions[detail.questions.length - 1]);
    });
  }, [comparisonId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim() || !session) return;
    setLoading(true);
    const q = text.trim();
    setText('');
    try {
      const result = await apiFetch(`/qa/sessions/${session._id}/questions`, {
        method: 'POST',
        body: JSON.stringify({ text: q }),
      });
      setQuestions(prev => [...prev, result]);
      setSelected(result);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Question failed.');
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  async function saveToReport(question) {
    try {
      const reports = await apiFetch('/reports');
      let report = reports.find(r => r.comparisonId?._id === comparisonId || r.comparisonId === comparisonId);
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
        body: JSON.stringify({ kind: 'answer', refId: question._id }),
      });
      toast.success('Answer saved to report.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save to report.');
    }
  }

  const selectedCitations = selected?.citations ?? [];

  return (
    <div className="screen">
      <div className="app-grid">
        <TopBar />

        <div>
          <p className="eyebrow">Cited Q&A</p>
          <h2>Ask company-level questions.</h2>
          <p className="lead">
            Answers are grounded in the filing text. Every claim cites its source paragraph.
          </p>
        </div>

        <div className="evidence-grid">
          {/* Evidence panel */}
          <div className="panel setup-card">
            <h3 className="panel-title">Source evidence</h3>
            <p className="panel-sub">The filing excerpts the answer is grounded in.</p>

            {selectedCitations.length === 0 && (
              <p className="panel-sub" style={{ marginTop: 24 }}>
                {selected ? 'No citations — answer may be based on insufficient evidence.' : 'Ask a question to see source evidence here.'}
              </p>
            )}

            {selectedCitations.map((c, i) => (
              <div key={i}>
                <div className="citation-quote" style={{ marginTop: 24 }}>
                  "{c.excerpt}"
                </div>
                <span className="citation-meta">
                  {companyName} · FY{c.filingYear} · p. {c.page}
                </span>
              </div>
            ))}

            {selected && selected.status === 'ready' && (
              <div className="actions" style={{ marginTop: 28 }}>
                <button className="button accent" onClick={() => saveToReport(selected)}>
                  Save to report
                </button>
              </div>
            )}
          </div>

          {/* Q&A card */}
          <div className="qa-card">
            <h3 className="panel-title">Ask FilingLens</h3>
            <p className="panel-sub" style={{ color: '#c6d1ca' }}>
              {companyName ? `Asking about ${companyName}` : 'Loading…'}
            </p>

            {/* Question history */}
            <div style={{ marginTop: 24, display: 'grid', gap: 16, maxHeight: 420, overflowY: 'auto' }}>
              {questions.map(q => (
                <div
                  key={q._id}
                  onClick={() => setSelected(q)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className={`question ${selected?._id === q._id ? '' : ''}`}
                    style={{ opacity: selected?._id === q._id ? 1 : 0.7 }}
                  >
                    {q.text}
                  </div>
                  {q.status === 'ready' && (
                    <div className="answer">{q.answer}</div>
                  )}
                  {q.status === 'no_evidence' && (
                    <div className="answer" style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
                      Insufficient evidence in the filing to answer this question.
                    </div>
                  )}
                  {q.status === 'failed' && (
                    <div className="answer" style={{ color: 'var(--red)' }}>
                      Failed to get an answer. Try again.
                    </div>
                  )}
                  {q.status === 'pending' && (
                    <div className="answer" style={{ color: 'var(--muted)' }}>Thinking…</div>
                  )}
                </div>
              ))}
              {loading && (
                <div>
                  <div className="question">{text || '…'}</div>
                  <div className="answer" style={{ color: 'var(--muted)' }}>Thinking… this takes ~20s</div>
                </div>
              )}
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} style={{ marginTop: 24, display: 'flex', gap: 12 }}>
              <input
                ref={inputRef}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Wie hat sich der Umsatz entwickelt?"
                disabled={loading || !session}
                style={{
                  flex: 1, padding: '16px 20px', borderRadius: 999,
                  border: 'none', background: 'var(--dark-soft)',
                  color: 'white', fontSize: 14, fontWeight: 700,
                  fontFamily: 'inherit', outline: 'none',
                }}
              />
              <button
                className="button accent"
                type="submit"
                disabled={loading || !text.trim() || !session}
              >
                {loading ? '…' : 'Ask'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
