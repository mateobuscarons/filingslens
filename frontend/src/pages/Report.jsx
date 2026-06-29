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
  const [members, setMembers] = useState([]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/reports/${id}`).then((data) => {
      setReport(data.report);
      setTitle(data.report.title);
      setItems(data.items);
      if (user?.firmId) {
        apiFetch(`/firms/${user.firmId}/members`)
          .then(m => setMembers(m.filter(mb => mb._id !== user.id)))
          .catch(() => {});
      }
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

  async function patchItem(itemId, patch) {
    const updated = await apiFetch(`/reports/${id}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    setItems((prev) => prev.map((i) => i._id === itemId ? { ...i, ...updated } : i));
    return updated;
  }

  async function applyShare(all, userIds) {
    try {
      const updated = await apiFetch(`/reports/${id}/share`, {
        method: 'POST',
        body: JSON.stringify(all ? { all: true } : { userIds }),
      });
      setReport((prev) => ({ ...prev, ...updated }));
      toast.success(all ? 'Shared with everyone.' : userIds.length === 0 ? 'Unshared.' : `Shared with ${userIds.length} member(s).`);
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not share.'); }
  }

  async function unshare() {
    try {
      const updated = await apiFetch(`/reports/${id}/share`, { method: 'DELETE' });
      setReport((prev) => ({ ...prev, ...updated }));
      toast.success('Unshared.');
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not unshare.'); }
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
            members={members}
            onShare={applyShare}
            onUnshare={unshare}
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
                members={members}
                onDelete={() => deleteItem(item._id)}
                onPatch={(patch) => patchItem(item._id, patch)}
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

function ReportHeader({ report, title, setTitle, editingTitle, setEditingTitle, saveTitle, isOwner, user, members, onShare, onUnshare, onDownload }) {
  const [showPicker, setShowPicker] = useState(false);
  const [selected, setSelected] = useState(report.sharedWith ?? []);
  const pickerRef = React.useRef(null);

  React.useEffect(() => {
    function handleClick(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function toggleMember(id) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }

  function applyShare(all) {
    onShare(all, selected);
    setShowPicker(false);
  }

  const isSharedPartially = !report.isShared && report.sharedWith?.length > 0;
  const sharedLabel = report.isShared ? 'Shared with everyone'
    : isSharedPartially ? `Shared with ${report.sharedWith.length} member(s)`
    : 'Draft';

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
          <div style={{ display: 'flex', gap: 10, flexShrink: 0, position: 'relative' }} ref={pickerRef}>
            <button className="button ghost" onClick={onDownload} style={{ minHeight: 38, padding: '0 16px', fontSize: 13 }}>
              Download PDF
            </button>
            {isOwner && user?.firmId && (
              <>
                {(report.isShared || isSharedPartially) && (
                  <button className="button ghost" onClick={onUnshare} style={{ minHeight: 38, padding: '0 16px', fontSize: 13 }}>
                    Unshare all
                  </button>
                )}
                <button
                  className="button accent"
                  onClick={() => setShowPicker(s => !s)}
                  style={{ minHeight: 38, padding: '0 16px', fontSize: 13 }}
                >
                  Share ▾
                </button>
                {showPicker && (
                  <div style={{
                    position: 'absolute', top: 46, right: 0, background: 'white',
                    border: '1px solid var(--line)', borderRadius: 14,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.10)', minWidth: 220, zIndex: 20, padding: '8px 0',
                  }}>
                    <div
                      onClick={() => applyShare(true)}
                      style={{ padding: '9px 18px', fontSize: 13, fontWeight: 750, cursor: 'pointer', color: 'var(--ink)', borderBottom: '1px solid var(--line)', marginBottom: 4 }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}
                    >
                      Everyone in firm
                    </div>
                    {members.map(m => (
                      <div
                        key={m._id}
                        onClick={() => toggleMember(m._id)}
                        style={{ padding: '9px 18px', fontSize: 13, fontWeight: 750, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'white'}
                      >
                        <span style={{ width: 16, height: 16, borderRadius: 4, border: '2px solid var(--accent)', background: selected.includes(m._id) ? 'var(--accent)' : 'white', display: 'inline-block', flexShrink: 0 }} />
                        {m.name}
                      </div>
                    ))}
                    <div style={{ padding: '8px 18px', borderTop: '1px solid var(--line)', marginTop: 4 }}>
                      <button className="button accent" style={{ width: '100%', fontSize: 13 }} onClick={() => applyShare(false)}>
                        {selected.length === 0 ? 'Remove all access' : `Share with ${selected.length} member(s)`}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <p className="panel-sub">
        {sharedLabel} · {new Date(report.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        {report.userId?.name ? ` · by ${report.userId.name}` : ''}
      </p>
    </>
  );
}

// ---------- Item display --------------------------------------------------

function ItemCard({ item, currentUserId, canEdit, members, onDelete, onPatch, onAddNote, onRemoveNote }) {
  return (
    <div className="report-item">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1 }}>
          {item.kind === 'finding'
            ? <FindingBody item={item} canEdit={canEdit} onPatch={onPatch} />
            : <AnswerBody item={item} canEdit={canEdit} onPatch={onPatch} />}
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
        members={members}
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

function renderNoteText(text) {
  const parts = text.split(/(@\S+)/g);
  return parts.map((part, i) =>
    part.startsWith('@')
      ? <span key={i} style={{ color: 'var(--accent)', fontWeight: 700 }}>{part}</span>
      : part
  );
}

function EditableSummary({ originalText, override, canEdit, onPatch, variant = 'title', placeholder = '' }) {
  const hasOverride = typeof override === 'string' && override.length > 0;
  const displayed = hasOverride ? override : originalText;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setDraft(displayed || '');
    setEditing(true);
  }
  async function save() {
    const text = draft.trim();
    if (text === (displayed || '').trim()) { setEditing(false); return; }
    setSaving(true);
    try {
      await onPatch({ userSummary: text });
      setEditing(false);
    } finally { setSaving(false); }
  }
  async function revert() {
    setSaving(true);
    try {
      await onPatch({ userSummary: '' });
      setEditing(false);
    } finally { setSaving(false); }
  }

  if (editing) {
    return (
      <div className="item-edit">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          rows={variant === 'title' ? 2 : 4}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
        <div className="item-edit-actions">
          <button className="button accent" onClick={save} disabled={saving}>
            {saving ? '…' : 'Save'}
          </button>
          <button className="button ghost" onClick={() => setEditing(false)}>Cancel</button>
          {hasOverride && (
            <button className="button ghost" onClick={revert} disabled={saving}>Revert to original</button>
          )}
        </div>
      </div>
    );
  }

  const textClass = variant === 'title' ? 'row-title' : 'item-answer';
  return (
    <div className="item-editable">
      <div className={textClass}>
        {displayed || <em style={{ color: 'var(--muted)' }}>{placeholder}</em>}
        {hasOverride && <span className="chip item-edited-chip">Edited</span>}
      </div>
      {canEdit && (
        <button className="item-edit-link" onClick={startEdit} title="Edit this text">
          Edit
        </button>
      )}
    </div>
  );
}

function NotesPanel({ notes, currentUserId, canAdd, members = [], onAdd, onRemove }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionAt, setMentionAt] = useState(0);
  const textareaRef = React.useRef(null);

  function handleChange(e) {
    const val = e.target.value;
    setText(val);
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const match = before.match(/@(\w*)$/);
    if (match && members.length > 0) {
      setMentionQuery(match[1].toLowerCase());
      setMentionAt(cursor - match[0].length);
    } else {
      setMentionQuery(null);
    }
  }

  function pickMember(member) {
    const before = text.slice(0, mentionAt);
    const after = text.slice(mentionAt + 1 + (mentionQuery?.length ?? 0));
    const newText = before + '@' + member.name + ' ' + after;
    setText(newText);
    setMentionQuery(null);
    textareaRef.current?.focus();
  }

  const allOption = mentionQuery !== null && 'all'.startsWith(mentionQuery) ? [{ _id: '__all__', name: 'all' }] : [];
  const suggestions = mentionQuery !== null
    ? [...allOption, ...members.filter(m => m.name.toLowerCase().startsWith(mentionQuery))].slice(0, 6)
    : [];

  async function submit(e) {
    e?.preventDefault?.();
    const value = text.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    try {
      await onAdd(value);
      setText('');
    } catch (err) {
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
          <p className="note-text">{renderNoteText(n.text)}</p>
        </div>
      ))}

      {canAdd && (
        <form className="note-compose" onSubmit={submit} style={{ position: 'relative' }}>
          {suggestions.length > 0 && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 0,
              background: 'white', border: '1px solid var(--line)', borderRadius: 10,
              boxShadow: '0 4px 16px rgba(0,0,0,0.10)', zIndex: 10, minWidth: 180, marginBottom: 4,
            }}>
              {suggestions.map(m => (
                <div
                  key={m._id}
                  onClick={() => pickMember(m)}
                  style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: 'var(--ink)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}
                >
                  @{m.name}
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            placeholder="Add a note… type @ to mention a team member"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMentionQuery(null);
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

function FindingBody({ item, canEdit, onPatch }) {
  const t = item.target ?? {};
  const cites = item.citations ?? [];
  const originalSummary = t.summary || t.excerpt?.slice(0, 120) || 'Finding';
  return (
    <>
      <EditableSummary
        originalText={originalSummary}
        override={item.userSummary}
        canEdit={canEdit}
        onPatch={onPatch}
        variant="title"
        placeholder="Write your own summary…"
      />
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

function AnswerBody({ item, canEdit, onPatch }) {
  const t = item.target ?? {};
  const cites = item.citations ?? [];
  const originalAnswer = t.status === 'ready' ? (t.answer || '') : '';
  return (
    <>
      <div className="row-title">Q: {t.text}</div>
      <div style={{ marginTop: 12 }}>
        {originalAnswer || item.userSummary ? (
          <EditableSummary
            originalText={originalAnswer}
            override={item.userSummary}
            canEdit={canEdit}
            onPatch={onPatch}
            variant="paragraph"
            placeholder="Write your own answer…"
          />
        ) : (
          <em style={{ color: 'var(--muted)' }}>No answer (status: {t.status}).</em>
        )}
      </div>
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

    // Use the analyst override when present, else the LLM original.
    const overrideText = item.userSummary && item.userSummary.length > 0 ? item.userSummary : null;
    if (item.kind === 'finding') {
      const headline = overrideText ?? t.summary;
      if (headline) writeLines(headline, { size: 12 });
      if (t.section) writeLines(`Topic: ${t.section} · ${findingTypeLabel(t.type)}`, { size: 9, color: [110, 110, 110] });
      if (t.excerpt) { y += 4; writeLines(t.excerpt, { size: 10 }); }
    } else {
      if (t.text) writeLines(`Q: ${t.text}`, { size: 12 });
      const body = overrideText ?? t.answer;
      if (body) { y += 4; writeLines(body, { size: 10 }); }
    }
    if (overrideText) writeLines('(edited by analyst)', { size: 9, color: [110, 110, 110] });

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
