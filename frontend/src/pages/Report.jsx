import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import { apiFetch, ApiError } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../notifications.jsx';
import TopBar from '../components/TopBar.jsx';

// Report builder. Each item is rendered with its full content inline so a
// viewer can read everything in one place:
//   - Finding items show summary + prev/curr paragraph text + citations.
//   - Q&A items show the question + the cited answer.
// Notes attached to each item form a thread — any firm member can add to a
// shared report; only the original note author can delete their own.
function impactChipClass(impact) {
  if (impact === 'high') return 'chip red';
  if (impact === 'medium') return 'chip amber';
  return 'chip';
}

function findingTypeLabel(type) {
  if (type === 'added') return 'Newly disclosed';
  if (type === 'removed') return 'No longer disclosed';
  return 'Modified';
}

function formatRelative(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function Report() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();

  const [report, setReport] = useState(null);
  const [items, setItems] = useState([]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/reports/${id}`).then((data) => {
      setReport(data.report);
      setTitle(data.report.title);
      setItems(data.items);
    }).finally(() => setLoading(false));
  }, [id]);

  const isOwner = report?.userId?._id === user?.id || report?.userId === user?.id;
  // Who can add/delete items + add notes: owner OR any firm member when shared.
  const canEdit = isOwner || (report?.isShared && user?.firmId && report?.firmId === user?.firmId);

  async function saveTitle() {
    try {
      const updated = await apiFetch(`/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
      setReport((prev) => ({ ...prev, ...updated })); setEditingTitle(false);
      toast.success('Title updated.');
    } catch { toast.error('Could not update title.'); }
  }

  async function deleteItem(itemId) {
    if (!confirm('Remove this item from the report?')) return;
    try {
      await apiFetch(`/reports/${id}/items/${itemId}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((i) => i._id !== itemId));
      toast.success('Item removed.');
    } catch { toast.error('Could not remove item.'); }
  }

  async function toggleShare() {
    try {
      const method = report.isShared ? 'DELETE' : 'POST';
      const updated = await apiFetch(`/reports/${id}/share`, { method });
      setReport((prev) => ({ ...prev, ...updated }));
      toast.success(updated.isShared ? 'Shared with firm.' : 'Unshared.');
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not update sharing.'); }
  }

  async function addNote(itemId, text) {
    const note = await apiFetch(`/reports/${id}/items/${itemId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    setItems((prev) => prev.map((i) => i._id === itemId
      ? { ...i, notes: [...(i.notes ?? []), note] }
      : i));
  }

  async function removeNote(itemId, noteId) {
    await apiFetch(`/reports/${id}/items/${itemId}/notes/${noteId}`, { method: 'DELETE' });
    setItems((prev) => prev.map((i) => i._id === itemId
      ? { ...i, notes: (i.notes ?? []).filter((n) => n._id !== noteId) }
      : i));
  }

  if (loading) return null;
  if (!report) return <div style={{ padding: 40 }}><p>Report not found.</p></div>;

  return (
    <div className="screen">
      <div className="app-grid">
        <TopBar />

        <div>
          <p className="eyebrow">Report</p>
          <h2>Research report.</h2>
          <p className="lead">{report.isShared ? 'Shared with firm — any member can add notes.' : 'Personal draft.'}</p>
        </div>

        <div className="report-paper">
          <ReportHeader
            report={report} title={title} setTitle={setTitle}
            editingTitle={editingTitle} setEditingTitle={setEditingTitle}
            saveTitle={saveTitle} isOwner={isOwner} user={user}
            toggleShare={toggleShare}
            onDownload={() => downloadPdf(report, items)}
          />

          <div style={{ display: 'grid', gap: 22, marginTop: 24 }}>
            {items.length === 0 && (
              <p className="panel-sub">No items yet. Save a finding from the diff view or a Q&A answer.</p>
            )}
            {items.map((item) => (
              <ItemCard
                key={item._id}
                item={item}
                currentUserId={user?.id}
                canEdit={canEdit}
                onDelete={() => deleteItem(item._id)}
                onAddNote={(text) => addNote(item._id, text)}
                onRemoveNote={(noteId) => removeNote(item._id, noteId)}
              />
            ))}
          </div>

          {report.comparisonId && (
            <div className="actions">
              <Link className="button ghost" to={`/analyses/${report.comparisonId._id ?? report.comparisonId}`}>
                ← Back to analysis
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Header (title + share + download) -----------------------------

function ReportHeader({ report, title, setTitle, editingTitle, setEditingTitle, saveTitle, isOwner, user, toggleShare, onDownload }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
        {editingTitle && isOwner ? (
          <div style={{ flex: 1, display: 'flex', gap: 12 }}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
              style={{ flex: 1, fontSize: 22, fontWeight: 860, border: 'none', borderBottom: '2px solid var(--ink)', background: 'transparent', fontFamily: 'inherit', outline: 'none', padding: '4px 0' }}
            />
            <button className="button accent" onClick={saveTitle} style={{ minHeight: 36, padding: '0 16px', fontSize: 13 }}>Save</button>
            <button className="button ghost" onClick={() => setEditingTitle(false)} style={{ minHeight: 36, padding: '0 16px', fontSize: 13 }}>Cancel</button>
          </div>
        ) : (
          <h3
            className="panel-title"
            onClick={() => isOwner && setEditingTitle(true)}
            style={{ cursor: isOwner ? 'pointer' : 'default' }}
          >
            {report.title}
          </h3>
        )}
        {!editingTitle && (
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button className="button ghost" onClick={onDownload} style={{ minHeight: 38, padding: '0 16px', fontSize: 13 }}>
              Download PDF
            </button>
            {isOwner && user?.firmId && (
              <button
                className={`button ${report.isShared ? 'ghost' : 'accent'}`}
                onClick={toggleShare}
                style={{ minHeight: 38, padding: '0 16px', fontSize: 13 }}
              >
                {report.isShared ? 'Unshare' : 'Share with firm'}
              </button>
            )}
          </div>
        )}
      </div>

      <p className="panel-sub">
        {report.isShared ? 'Shared with firm · ' : 'Draft · '}
        {new Date(report.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        {report.userId?.name ? ` · by ${report.userId.name}` : ''}
      </p>
    </>
  );
}

// ---------- Item display --------------------------------------------------

function ItemCard({ item, currentUserId, canEdit, onDelete, onAddNote, onRemoveNote }) {
  return (
    <div className="report-item">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1 }}>
          {item.kind === 'finding' ? <FindingBody item={item} /> : <AnswerBody item={item} />}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          {item.kind === 'finding' && item.target?.impact && (
            <span className={impactChipClass(item.target.impact)}>
              {item.target.impact === 'high' ? 'High' : item.target.impact === 'medium' ? 'Medium' : 'Low'}
            </span>
          )}
          {item.kind === 'answer' && <span className="chip soft-accent">Q&A</span>}
        </div>
      </div>

      {item.addedByName && (
        <div className="row-sub" style={{ marginTop: 8, fontSize: 12 }}>
          Added by {item.addedByName}
        </div>
      )}

      <NotesPanel
        notes={item.notes ?? []}
        currentUserId={currentUserId}
        canAdd={canEdit}
        onAdd={onAddNote}
        onRemove={onRemoveNote}
      />

      {canEdit && (
        <div className="row-sub" style={{ marginTop: 12 }}>
          <span style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--red)' }} onClick={onDelete}>
            Remove item
          </span>
        </div>
      )}
    </div>
  );
}

function NotesPanel({ notes, currentUserId, canAdd, onAdd, onRemove }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e?.preventDefault?.();
    const value = text.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    try {
      await onAdd(value);
      setText('');
    } catch (err) {
      // surface gently — the row stays so the user can retry
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="notes-panel">
      <div className="notes-head">
        <span className="notes-label">Notes</span>
        <span className="notes-count">{notes.length}</span>
      </div>

      {notes.length === 0 && (
        <p className="notes-empty">No notes yet.</p>
      )}

      {notes.map((n) => (
        <div className="note" key={n._id}>
          <div className="note-head">
            <span className="note-author">{n.authorName || 'Member'}</span>
            <span className="note-time">{formatRelative(n.createdAt)}</span>
            {n.authorId === currentUserId && (
              <button className="note-delete" onClick={() => onRemove(n._id)} title="Delete this note">
                ×
              </button>
            )}
          </div>
          <p className="note-text">{n.text}</p>
        </div>
      ))}

      {canAdd && (
        <form className="note-compose" onSubmit={submit}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a note for the team…"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
            }}
          />
          <button type="submit" className="button accent" disabled={!text.trim() || submitting}>
            {submitting ? '…' : 'Post'}
          </button>
        </form>
      )}
    </div>
  );
}

function FindingBody({ item }) {
  const t = item.target ?? {};
  const cites = item.citations ?? [];
  return (
    <>
      <div className="row-title">{t.summary || t.excerpt?.slice(0, 120) || 'Finding'}</div>
      <div className="row-sub" style={{ marginTop: 4 }}>
        Finding · {t.section ?? '—'} · {findingTypeLabel(t.type)}
      </div>
      {t.excerpt && (
        <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
          {t.excerpt}
        </p>
      )}
      {cites.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {cites.map((c, i) => <span key={i} className="chip soft-accent">FY{c.filingYear} · p. {c.page}</span>)}
        </div>
      )}
    </>
  );
}

function AnswerBody({ item }) {
  const t = item.target ?? {};
  const cites = item.citations ?? [];
  return (
    <>
      <div className="row-title">Q: {t.text}</div>
      <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
        {t.status === 'ready' ? t.answer : <em style={{ color: 'var(--muted)' }}>No answer (status: {t.status}).</em>}
      </p>
      {cites.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {cites.map((c, i) => (
            <span key={i} className="chip soft-accent">FY{c.filingYear} · p. {c.page}</span>
          ))}
        </div>
      )}
    </>
  );
}

// ---------- PDF export ----------------------------------------------------

function downloadPdf(report, items) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 56;
  let y = M;

  const writeLines = (text, opts = {}) => {
    const size = opts.size ?? 11;
    const bold = opts.bold ?? false;
    const color = opts.color ?? [20, 20, 20];
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text ?? '', W - 2 * M);
    for (const ln of lines) {
      if (y > H - M) { doc.addPage(); y = M; }
      doc.text(ln, M, y);
      y += size * 1.3;
    }
  };

  writeLines(report.title, { size: 22, bold: true });
  y += 6;
  writeLines(
    `${report.isShared ? 'Shared with firm' : 'Personal draft'} · ${new Date(report.createdAt).toLocaleDateString()}` +
    (report.userId?.name ? ` · by ${report.userId.name}` : ''),
    { size: 10, color: [110, 110, 110] }
  );
  y += 14;

  for (const [idx, item] of items.entries()) {
    if (y > H - M - 60) { doc.addPage(); y = M; }
    const t = item.target ?? {};
    const cites = item.citations ?? [];

    writeLines(`${idx + 1}. ${item.kind === 'finding' ? 'Finding' : 'Q&A'}`, { size: 13, bold: true });
    y += 2;

    if (item.kind === 'finding') {
      if (t.summary) writeLines(t.summary, { size: 12 });
      if (t.section) writeLines(`Topic: ${t.section} · ${findingTypeLabel(t.type)}`, { size: 9, color: [110, 110, 110] });
      if (t.excerpt) { y += 4; writeLines(t.excerpt, { size: 10 }); }
    } else {
      if (t.text) writeLines(`Q: ${t.text}`, { size: 12 });
      if (t.answer) { y += 4; writeLines(t.answer, { size: 10 }); }
    }

    if (cites.length) {
      y += 4;
      writeLines('Citations: ' + cites.map((c) => `FY${c.filingYear} p.${c.page}`).join('; '), { size: 9, color: [110, 110, 110] });
    }

    const notes = item.notes ?? [];
    if (notes.length) {
      y += 6;
      writeLines('Notes:', { size: 10, bold: true, color: [60, 60, 60] });
      for (const n of notes) {
        writeLines(`  • ${n.authorName || 'Member'}: ${n.text}`, { size: 10, color: [60, 60, 60] });
      }
    }
    y += 14;
  }

  doc.save(`${report.title.replace(/[^a-z0-9-_ ]/gi, '_')}.pdf`);
}
