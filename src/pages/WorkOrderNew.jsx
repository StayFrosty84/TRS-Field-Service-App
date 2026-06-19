import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, createAccount, createContact, createWorkOrder, addPhoto } from '../db/db.js';
import { useToast } from '../components/Toast.jsx';

export default function WorkOrderNew() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const accounts = useLiveQuery(() => db.accounts.orderBy('name').toArray());
  const allContacts = useLiveQuery(() => db.contacts.toArray());

  const [accountId, setAccountId] = useState(location.state?.accountId || '');
  const [newAccountName, setNewAccountName] = useState('');
  const [contactId, setContactId] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [locationText, setLocationText] = useState('');
  const [gps, setGps] = useState(null);
  const [issue, setIssue] = useState('');
  const [photos, setPhotos] = useState([]); // { id, blob, url }
  const [busy, setBusy] = useState(false);

  const contactsForAccount = useMemo(
    () => (allContacts || []).filter((c) => c.accountId === accountId),
    [allContacts, accountId]
  );

  const creatingAccount = accountId === '__new__';
  const creatingContact = contactId === '__new__';

  function onPhotos(e) {
    const files = Array.from(e.target.files || []);
    const added = files.map((f) => ({ id: crypto.randomUUID(), blob: f, url: URL.createObjectURL(f) }));
    setPhotos((p) => [...p, ...added]);
    e.target.value = '';
  }

  function removePhoto(id) {
    setPhotos((p) => {
      const target = p.find((x) => x.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return p.filter((x) => x.id !== id);
    });
  }

  function useGps() {
    if (!navigator.geolocation) return toast('Geolocation not available');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setGps({ lat: latitude, lng: longitude });
        if (!locationText) setLocationText(`GPS ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        toast('Location captured');
      },
      () => toast('Could not get GPS'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      // Resolve account (existing or quick-created).
      let acctId = accountId;
      if (creatingAccount) {
        if (!newAccountName.trim()) return toast('Enter the new account name');
        acctId = await createAccount({ name: newAccountName.trim() });
      }
      if (!acctId) return toast('Pick or create an account');

      // Resolve contact (optional).
      let ctctId = creatingContact ? '' : contactId;
      if (creatingContact && newContactName.trim()) {
        ctctId = await createContact({
          accountId: acctId,
          name: newContactName.trim(),
          phone: newContactPhone.trim(),
        });
      }

      const woId = await createWorkOrder({
        accountId: acctId,
        contactId: ctctId || null,
        location: { text: locationText.trim(), ...(gps || {}) },
        issue: issue.trim(),
      });

      for (const p of photos) await addPhoto(woId, p.blob);
      photos.forEach((p) => URL.revokeObjectURL(p.url));

      toast('Work order saved');
      navigate(`/work-orders/${woId}`, { replace: true });
    } finally {
      setBusy(false);
    }
  }

  if (!accounts) return null;

  return (
    <form onSubmit={save}>
      <h1 style={{ marginTop: 4 }}>New Work Order</h1>

      <label>Account *</label>
      <select
        value={accountId}
        onChange={(e) => {
          setAccountId(e.target.value);
          setContactId('');
        }}
      >
        <option value="">— Select account —</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
        <option value="__new__">＋ New account…</option>
      </select>
      {creatingAccount && (
        <input
          style={{ marginTop: 8 }}
          placeholder="New account name"
          value={newAccountName}
          onChange={(e) => setNewAccountName(e.target.value)}
        />
      )}

      <label>Contact on site</label>
      <select value={contactId} onChange={(e) => setContactId(e.target.value)}>
        <option value="">— None / select —</option>
        {contactsForAccount.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value="__new__">＋ New contact…</option>
      </select>
      {creatingContact && (
        <div className="row" style={{ marginTop: 8, gap: 8 }}>
          <input
            placeholder="Contact name"
            value={newContactName}
            onChange={(e) => setNewContactName(e.target.value)}
          />
          <input
            placeholder="Phone"
            type="tel"
            value={newContactPhone}
            onChange={(e) => setNewContactPhone(e.target.value)}
          />
        </div>
      )}

      <label>Breakdown location</label>
      <div className="row" style={{ gap: 8 }}>
        <input
          placeholder="Address or description"
          value={locationText}
          onChange={(e) => setLocationText(e.target.value)}
        />
        <button type="button" className="btn btn--ghost btn--sm" onClick={useGps} style={{ whiteSpace: 'nowrap' }}>
          📍 GPS
        </button>
      </div>

      <label>The issue</label>
      <textarea
        placeholder="What's broken / what's the job?"
        value={issue}
        onChange={(e) => setIssue(e.target.value)}
      />

      <label>Photos</label>
      <label className="btn btn--ghost" style={{ margin: 0 }}>
        📷 Add photos
        <input type="file" accept="image/*" capture="environment" multiple onChange={onPhotos} hidden />
      </label>
      {photos.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
          {photos.map((p) => (
            <div key={p.id} style={{ position: 'relative' }}>
              <img src={p.url} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 10 }} />
              <button
                type="button"
                onClick={() => removePhoto(p.id)}
                style={removeBtn}
                aria-label="Remove photo"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="btn-row">
        <button type="button" className="btn btn--ghost" onClick={() => navigate(-1)}>
          Cancel
        </button>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Saving…' : 'Save work order'}
        </button>
      </div>
    </form>
  );
}

const removeBtn = {
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
};
