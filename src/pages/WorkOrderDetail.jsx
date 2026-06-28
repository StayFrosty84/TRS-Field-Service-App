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
  markBillPaid,
  markBillUnpaid,
  listWorkTypes,
  updatePhoto,
} from '../db/db.js';
import { toDateInput, fromDateInput, money, getPhones, telHref, fmtPhone } from '../lib/format.js';
import { mapsHref } from '../lib/maps.js';
import { shareFile, openBlob } from '../lib/share.js';
import { useToast } from '../components/Toast.jsx';
import { useFeatures } from '../lib/useFeatures.js';
import AddressAutocomplete from '../components/AddressAutocomplete.jsx';
import PhotoMarkup from '../components/PhotoMarkup.jsx';
import Icon from '../components/Icon.jsx';

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
  const [isEstimate, setIsEstimate] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [payMethod, setPayMethod] = useState('Cash');
  const [markupPhoto, setMarkupPhoto] = useState(null); // { id, blob }

  const data = useLiveQuery(async () => {
    const order = await db.workOrders.get(id);
    if (!order) return { missing: true };
    const account = await db.accounts.get(order.accountId);
    const contact = order.contactId ? await db.contacts.get(order.contactId) : null;
    const photos = await db.photos.where('workOrderId').equals(id).toArray();
    const bill = await getBillForWorkOrder(id);
    return { order, account, contact, photos, bill };
  }, [id]);

  const workTypes = useLiveQuery(listWorkTypes) || [];

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
      setIsEstimate(Boolean(data.order.isEstimate));
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
      isEstimate,
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
          <Icon name="building" size={15} /> <Link to={`/accounts/${account?.id}`}>{account?.name || 'Unknown'}</Link>
        </div>
        {contact && (
          <div>
            <Icon name="user" size={15} /> <Link to={`/contacts/${contact.id}`}>{contact.name}</Link>
            {(() => {
              const p = getPhones(contact)[0];
              return p ? (
                <>
                  {' · '}
                  <a href={telHref(p)}>{fmtPhone(p)}</a>
                </>
              ) : (
                ''
              );
            })()}
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
      {(locationText.trim() || gps) && (
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          style={{ marginTop: 8 }}
          onClick={() => {
            const href = mapsHref(
              { text: locationText, ...(gps || {}) },
              { ios: /iPad|iPhone|iPod/.test(navigator.userAgent) }
            );
            if (href) window.open(href, '_blank');
          }}
        >
          <Icon name="map-pin" /> Navigate
        </button>
      )}
      <label>Service date</label>
      <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
      <label className="row" style={{ gap: 10, alignItems: 'center', marginTop: 12 }}>
        <input
          type="checkbox"
          checked={isEstimate}
          onChange={(e) => setIsEstimate(e.target.checked)}
          style={{ width: 22, height: 22, minHeight: 0, flex: '0 0 auto' }}
        />
        <span style={{ flex: 1 }}>Estimate — the PDF prints a large “ESTIMATE” label instead of a bill</span>
      </label>
      <label>Issue</label>
      <textarea value={issue} onChange={(e) => setIssue(e.target.value)} />
      <label>Internal notes</label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button className="btn btn--ghost btn--sm" onClick={saveEdits} style={{ marginTop: 8 }}>
        Save changes
      </button>

      {workTypes.length > 0 && (
        <>
          <label>Work type</label>
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`chip ${!order.workTypeId ? 'chip--active' : ''}`}
              onClick={() => updateWorkOrder(id, { workTypeId: null, templateItems: [] })}
            >
              None
            </button>
            {workTypes.map((w) => (
              <button
                type="button"
                key={w.id}
                className={`chip ${order.workTypeId === w.id ? 'chip--active' : ''}`}
                onClick={() => updateWorkOrder(id, { workTypeId: w.id, templateItems: w.items || [] })}
              >
                <Icon name={w.icon || 'wrench'} size={14} /> {w.name}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="section-title">Photos ({photos.length})</div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <label className="btn btn--ghost" style={{ margin: 0 }}>
          <Icon name="camera" /> Take photo
          <input type="file" accept="image/*" capture="environment" multiple onChange={onPhotos} hidden />
        </label>
        <label className="btn btn--ghost" style={{ margin: 0 }}>
          <Icon name="image" /> Choose from library
          <input type="file" accept="image/*" multiple onChange={onPhotos} hidden />
        </label>
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {photos.map((p) => (
          <PhotoThumb key={p.id} photo={p} onOpen={() => setMarkupPhoto(p)} onRemove={() => deletePhoto(p.id)} />
        ))}
      </div>

      <div className="section-title">Bill of Sale</div>
      {bill ? (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{money(bill.total || 0)}</strong>
            {features.billing && (
              <span className={`badge badge--${bill.paymentStatus === 'paid' ? 'paid' : 'unpaid'}`}>
                {bill.paymentStatus === 'paid'
                  ? `paid${bill.paymentMethod ? ` · ${bill.paymentMethod}` : ''}`
                  : 'unpaid'}
              </span>
            )}
          </div>
          {features.billing &&
            (bill.paymentStatus === 'paid' ? (
              <button className="btn btn--ghost btn--sm" style={{ marginTop: 10 }} onClick={() => markBillUnpaid(bill.id)}>
                <Icon name="rotate-ccw" /> Mark unpaid
              </button>
            ) : (
              <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={{ flex: 1 }}>
                  <option>Cash</option>
                  <option>Check</option>
                  <option>Card</option>
                  <option>Zelle</option>
                  <option>Other</option>
                </select>
                <button className="btn btn--sm" onClick={() => markBillPaid(bill.id, payMethod)}>
                  <Icon name="check" /> Mark paid
                </button>
              </div>
            ))}
          {bill.pdfBlob && (
            <div className="btn-row">
              <button className="btn btn--ghost" onClick={() => openBlob(bill.pdfBlob, 'bill-of-sale.pdf')}>
                <Icon name="eye" /> View PDF
              </button>
              <button
                className="btn"
                onClick={() => shareFile(bill.pdfBlob, 'bill-of-sale.pdf', { title: 'Bill of Sale' })}
              >
                <Icon name="share" /> Share PDF
              </button>
            </div>
          )}
          <button
            className="btn btn--ghost"
            style={{ marginTop: 10 }}
            onClick={() => navigate(`/work-orders/${id}/bill`)}
          >
            <Icon name="pencil" /> Edit bill
          </button>
        </div>
      ) : (
        <button className="btn" onClick={() => navigate(`/work-orders/${id}/bill`)}>
          <Icon name="file-text" /> Generate Bill of Sale
        </button>
      )}

      <div className="btn-row">
        <button className="btn btn--ghost" onClick={toggleComplete}>
          {order.status === 'open' ? (
            <><Icon name="check" /> Mark completed</>
          ) : (
            <><Icon name="rotate-ccw" /> Reopen</>
          )}
        </button>
        <button className="btn btn--ghost" onClick={duplicate}>
          <Icon name="copy" /> Duplicate
        </button>
      </div>
      <div className="btn-row">
        <button className="btn btn--danger" onClick={onDelete}>
          Delete work order
        </button>
      </div>

      {markupPhoto && (
        <PhotoMarkup
          blob={markupPhoto.blob}
          onClose={() => setMarkupPhoto(null)}
          onSave={async (b) => {
            await updatePhoto(markupPhoto.id, b);
            setMarkupPhoto(null);
            toast('Photo updated');
          }}
        />
      )}
    </>
  );
}

function PhotoThumb({ photo, onOpen, onRemove }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const u = URL.createObjectURL(photo.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo.blob]);

  return (
    <div style={{ position: 'relative' }}>
      {url && (
        <img
          src={url}
          alt=""
          onClick={onOpen}
          style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 10, cursor: 'pointer' }}
        />
      )}
      <button
        onClick={onOpen}
        aria-label="Mark up photo"
        style={{
          position: 'absolute',
          bottom: -6,
          left: -6,
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: 'none',
          background: 'var(--primary)',
          color: '#fff',
        }}
      >
        <Icon name="pencil" size={13} />
      </button>
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
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
