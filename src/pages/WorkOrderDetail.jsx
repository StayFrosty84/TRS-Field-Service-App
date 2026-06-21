import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  updateWorkOrder,
  deleteWorkOrder,
  createWorkOrder,
  addPhoto,
  deletePhoto,
  getBillForWorkOrder,
} from '../db/db.js';
import { toDateInput, fromDateInput, money } from '../lib/format.js';
import { shareFile, openBlob } from '../lib/share.js';
import { useToast } from '../components/Toast.jsx';
import { useFeatures } from '../lib/useFeatures.js';
import AddressAutocomplete from '../components/AddressAutocomplete.jsx';

export default function WorkOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const features = useFeatures();
  const [issue, setIssue] = useState('');
  const [notes, setNotes] = useState('');
  const [locationText, setLocationText] = useState('');
  const [gps, setGps] = useState(null);
  const [serviceDate, setServiceDate] = useState('');
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
      setLocationText(data.order.location?.text || '');
      setGps(
        data.order.location?.lat != null
          ? { lat: data.order.location.lat, lng: data.order.location.lng }
          : null
      );
      setServiceDate(toDateInput(data.order.serviceDate));
      setLoaded(true);
    }
  }, [data, loaded]);

  if (!data) return null;
  if (data.missing) return <p className="muted">Work order not found.</p>;
  const { order, account, contact, photos, bill } = data;

  async function saveEdits() {
    await updateWorkOrder(id, {
      issue: issue.trim(),
      notes: notes.trim(),
      location: { text: locationText.trim(), ...(gps || {}) },
      serviceDate: fromDateInput(serviceDate) || order.serviceDate,
    });
    toast('Saved');
  }

  async function duplicate() {
    const newId = await createWorkOrder({
      accountId: order.accountId,
      contactId: order.contactId || null,
      location: order.location || { text: '' },
      issue: order.issue || '',
    });
    toast('Duplicated — new work order');
    navigate(`/work-orders/${newId}`);
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
            {contact.phone ? (
              <>
                {' · '}
                <a href={`tel:${contact.phone}`}>{contact.phone}</a>
              </>
            ) : (
              ''
            )}
          </div>
        )}
      </div>

      <label>Location</label>
      <AddressAutocomplete
        value={locationText}
        placeholder="Search address, or type a description"
        onChangeText={(t) => {
          setLocationText(t);
          setGps(null);
        }}
        onPick={({ label, lat, lng }) => {
          setLocationText(label);
          setGps(lat != null && lng != null ? { lat, lng } : null);
        }}
      />
      <label>Service date</label>
      <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
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
      {bill ? (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{money(bill.total || 0)}</strong>
            {features.billing && (
              <span className={`badge badge--${bill.paymentStatus === 'paid' ? 'paid' : 'unpaid'}`}>
                {bill.paymentStatus === 'paid' ? 'paid' : 'unpaid'}
              </span>
            )}
          </div>
          {bill.pdfBlob && (
            <div className="btn-row">
              <button className="btn btn--ghost" onClick={() => openBlob(bill.pdfBlob, 'bill-of-sale.pdf')}>
                👁 View PDF
              </button>
              <button
                className="btn"
                onClick={() => shareFile(bill.pdfBlob, 'bill-of-sale.pdf', { title: 'Bill of Sale' })}
              >
                📤 Share PDF
              </button>
            </div>
          )}
          <button
            className="btn btn--ghost"
            style={{ marginTop: 10 }}
            onClick={() => navigate(`/work-orders/${id}/bill`)}
          >
            ✏️ Edit bill
          </button>
        </div>
      ) : (
        <button className="btn" onClick={() => navigate(`/work-orders/${id}/bill`)}>
          📄 Generate Bill of Sale
        </button>
      )}

      <div className="btn-row">
        <button className="btn btn--ghost" onClick={toggleComplete}>
          {order.status === 'open' ? '✓ Mark completed' : '↩ Reopen'}
        </button>
        <button className="btn btn--ghost" onClick={duplicate}>
          ⧉ Duplicate
        </button>
      </div>
      <div className="btn-row">
        <button className="btn btn--danger" onClick={onDelete}>
          Delete work order
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
