import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  updateWorkOrder,
  deleteWorkOrder,
  addPhoto,
  deletePhoto,
  getBillForWorkOrder,
} from '../db/db.js';
import { fmtDate } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';

export default function WorkOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [issue, setIssue] = useState('');
  const [notes, setNotes] = useState('');
  const [loaded, setLoaded] = useState(false);

  const data = useLiveQuery(async () => {
    const order = await db.workOrders.get(id);
    if (!order) return { missing: true };
    const account = await db.accounts.get(order.accountId);
    const contact = order.contactId ? await db.contacts.get(order.contactId) : null;
    const photos = await db.photos.where('workOrderId').equals(id).toArray();
    const bill = await getBillForWorkOrder(id);
    return { order, account, contact, photos, bill };
  }, [id]);

  useEffect(() => {
    if (data?.order && !loaded) {
      setIssue(data.order.issue || '');
      setNotes(data.order.notes || '');
      setLoaded(true);
    }
  }, [data, loaded]);

  if (!data) return null;
  if (data.missing) return <p className="muted">Work order not found.</p>;
  const { order, account, contact, photos, bill } = data;

  async function saveEdits() {
    await updateWorkOrder(id, { issue: issue.trim(), notes: notes.trim() });
    toast('Saved');
  }

  async function toggleComplete() {
    const completing = order.status === 'open';
    await updateWorkOrder(id, {
      status: completing ? 'completed' : 'open',
      completedAt: completing ? Date.now() : null,
    });
    toast(completing ? 'Marked completed' : 'Reopened');
  }

  async function onPhotos(e) {
    const files = Array.from(e.target.files || []);
    for (const f of files) await addPhoto(id, f);
    e.target.value = '';
    if (files.length) toast(`${files.length} photo(s) added`);
  }

  async function onDelete() {
    if (!confirm('Delete this work order, its photos, and any bill of sale?')) return;
    await deleteWorkOrder(id);
    toast('Work order deleted');
    navigate('/');
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
        <h1 style={{ margin: 0 }}>Work Order</h1>
        <span className={`badge badge--${order.status}`}>{order.status}</span>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div>
          🏢 <Link to={`/accounts/${account?.id}`}>{account?.name || 'Unknown'}</Link>
        </div>
        {contact && (
          <div>
            👤 <Link to={`/contacts/${contact.id}`}>{contact.name}</Link>
            {contact.phone ? ` · ${contact.phone}` : ''}
          </div>
        )}
        {order.location?.text && <div className="muted" style={{ marginTop: 6 }}>📍 {order.location.text}</div>}
        <div className="muted" style={{ marginTop: 6 }}>Service date: {fmtDate(order.serviceDate)}</div>
      </div>

      <label>Issue</label>
      <textarea value={issue} onChange={(e) => setIssue(e.target.value)} />
      <label>Internal notes</label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button className="btn btn--ghost btn--sm" onClick={saveEdits} style={{ marginTop: 8 }}>
        Save changes
      </button>

      <div className="section-title">Photos ({photos.length})</div>
      <label className="btn btn--ghost" style={{ margin: '0 0 10px' }}>
        📷 Add photos
        <input type="file" accept="image/*" capture="environment" multiple onChange={onPhotos} hidden />
      </label>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {photos.map((p) => (
          <PhotoThumb key={p.id} photo={p} onRemove={() => deletePhoto(p.id)} />
        ))}
      </div>

      <div className="section-title">Bill of Sale</div>
      <button className="btn" onClick={() => navigate(`/work-orders/${id}/bill`)}>
        {bill ? '📄 View / edit Bill of Sale' : '📄 Generate Bill of Sale'}
      </button>

      <div className="btn-row">
        <button className="btn btn--ghost" onClick={toggleComplete}>
          {order.status === 'open' ? '✓ Mark completed' : '↩ Reopen'}
        </button>
        <button className="btn btn--danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </>
  );
}

function PhotoThumb({ photo, onRemove }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const u = URL.createObjectURL(photo.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo.blob]);

  return (
    <div style={{ position: 'relative' }}>
      {url && (
        <img src={url} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 10 }} />
      )}
      <button
        onClick={() => confirm('Remove this photo?') && onRemove()}
        aria-label="Remove photo"
        style={{
          position: 'absolute',
          top: -6,
          right: -6,
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: 'none',
          background: '#ef4444',
          color: '#fff',
          fontSize: 12,
        }}
      >
        ✕
      </button>
    </div>
  );
}
