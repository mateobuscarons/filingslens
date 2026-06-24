import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch, ApiError } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../notifications.jsx';
import TopBar from '../components/TopBar.jsx';

function impactChipClass(impact) {
  if (impact === 'high') return 'chip red';
  if (impact === 'medium') return 'chip amber';
  return 'chip';
}

export default function Report() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();

  const [report, setReport] = useState(null);
  const [items, setItems] = useState([]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [editingNote, setEditingNote] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/reports/${id}`)
      .then(data => {
        setReport(data.report);
        setTitle(data.report.title);
        setItems(data.items);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const isOwner = report?.userId?._id === user?.id || report?.userId === user?.id;

  async function saveTitle() {
    try {
      const updated = await apiFetch(`/reports/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
      setReport(updated);
      setEditingTitle(false);
      toast.success('Title updated.');
    } catch (err) {
      toast.error('Could not update title.');
    }
  }

  async function saveNote(itemId) {
    try {
      await apiFetch(`/reports/${id}/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ note: noteText }),
      });
      setItems(prev => prev.map(i => i._id === itemId ? { ...i, note: noteText } : i));
      setEditingNote(null);
      toast.success('Note saved.');
    } catch (err) {
      toast.error('Could not save note.');
    }
  }

  async function archiveItem(itemId) {
    try {
      await apiFetch(`/reports/${id}/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false }),
      });
      setItems(prev => prev.filter(i => i._id !== itemId));
      toast.success('Item archived.');
    } catch (err) {
      toast.error('Could not archive item.');
    }
  }

  async function deleteItem(itemId) {
    try {
      await apiFetch(`/reports/${id}/items/${itemId}`, { method: 'DELETE' });
      setItems(prev => prev.filter(i => i._id !== itemId));
      toast.success('Item removed.');
    } catch (err) {
      toast.error('Could not remove item.');
    }
  }

  async function toggleShare() {
    try {
      const method = report.isShared ? 'DELETE' : 'POST';
      const updated = await apiFetch(`/reports/${id}/share`, { method });
      setReport(updated);
      toast.success(updated.isShared ? 'Shared with firm.' : 'Unshared.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update sharing.');
    }
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function itemTitle(item) {
    if (item.kind === 'finding') return item.target?.summary || item.target?.excerpt?.slice(0, 100) || 'Finding';
    if (item.kind === 'answer') return `"${item.target?.text?.slice(0, 80) ?? 'Q&A answer'}"`;
    return 'Item';
  }

  function itemSub(item) {
    const parts = [];
    if (item.kind === 'finding') parts.push('Finding');
    if (item.kind === 'answer') parts.push('Q&A answer');
    if (item.note) parts.push(`note: "${item.note}"`);
    if (item.citations?.length) parts.push(`${item.citations.length} citation${item.citations.length > 1 ? 's' : ''}`);
    return parts.join(' · ');
  }

  if (loading) return null;
  if (!report) return <div style={{ padding: 40 }}><p>Report not found.</p></div>;

  return (
    <div className="screen">
      <div className="app-grid">
        <TopBar />

        <div>
          <p className="eyebrow">Report builder</p>
          <h2>From findings to one report.</h2>
          <p className="lead">Add saved findings and cited answers. Annotate. Share with your firm.</p>
        </div>

        <div className="report-paper">
          {/* Title */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
            {editingTitle && isOwner ? (
              <div style={{ flex: 1, display: 'flex', gap: 12 }}>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  style={{
                    flex: 1, fontSize: 22, fontWeight: 860, border: 'none',
                    borderBottom: '2px solid var(--ink)', background: 'transparent',
                    fontFamily: 'inherit', outline: 'none', padding: '4px 0',
                  }}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
                />
                <button className="button accent" onClick={saveTitle} style={{ minHeight: 36, padding: '0 16px', fontSize: 13 }}>Save</button>
                <button className="button ghost" onClick={() => setEditingTitle(false)} style={{ minHeight: 36, padding: '0 16px', fontSize: 13 }}>Cancel</button>
              </div>
            ) : (
              <h3
                className="panel-title"
                onClick={() => isOwner && setEditingTitle(true)}
                style={{ cursor: isOwner ? 'pointer' : 'default' }}
                title={isOwner ? 'Click to edit title' : ''}
              >
                {report.title}
              </h3>
            )}
            {isOwner && !editingTitle && (
              <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                {user?.firmId && (
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
            {formatDate(report.createdAt)}
            {report.userId?.name ? ` · by ${report.userId.name}` : ''}
          </p>

          {/* Items */}
          <div className="row-list" style={{ paddingLeft: 0, paddingRight: 0 }}>
            {items.length === 0 && (
              <p className="panel-sub" style={{ padding: '0 4px' }}>
                No items yet. Save a finding from the diff view or a Q&A answer.
              </p>
            )}
            {items.map(item => (
              <div className="data-row" key={item._id} style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div className="row-title">{itemTitle(item)}</div>

                  {editingNote === item._id ? (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder="Add a note…"
                        style={{
                          flex: 1, padding: '8px 12px', borderRadius: 10,
                          border: '1px solid var(--line)', background: 'var(--bg)',
                          fontSize: 13, fontFamily: 'inherit', outline: 'none',
                        }}
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') saveNote(item._id); if (e.key === 'Escape') setEditingNote(null); }}
                      />
                      <button className="button accent" onClick={() => saveNote(item._id)} style={{ minHeight: 34, padding: '0 12px', fontSize: 12 }}>Save</button>
                      <button className="button ghost" onClick={() => setEditingNote(null)} style={{ minHeight: 34, padding: '0 12px', fontSize: 12 }}>Cancel</button>
                    </div>
                  ) : (
                    <div className="row-sub">
                      {itemSub(item)}
                      {isOwner && (
                        <span style={{ marginLeft: 8 }}>
                          <span
                            style={{ cursor: 'pointer', textDecoration: 'underline' }}
                            onClick={() => { setEditingNote(item._id); setNoteText(item.note || ''); }}
                          >
                            {item.note ? 'Edit note' : 'Add note'}
                          </span>
                          {' · '}
                          <span style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--muted)' }} onClick={() => archiveItem(item._id)}>Archive</span>
                          {' · '}
                          <span style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--red)' }} onClick={() => deleteItem(item._id)}>Remove</span>
                        </span>
                      )}
                    </div>
                  )}
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
            ))}
          </div>

          {isOwner && (
            <div className="actions">
              {report.comparisonId && (
                <Link className="button ghost" to={`/analyses/${report.comparisonId._id ?? report.comparisonId}`}>
                  ← Back to analysis
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
