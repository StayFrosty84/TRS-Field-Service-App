import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, createAccount, createContact, createWorkOrder, addPhoto, listWorkTypes, getProfile } from '../db/db.js';
import { toDateInput, fromDateInput } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';
import AddressAutocomplete from '../components/AddressAutocomplete.jsx';
import LocationMap from '../components/LocationMap.jsx';
import Icon from '../components/Icon.jsx';

export default function WorkOrderNew() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const accounts = useLiveQuery(() => db.accounts.orderBy('name').toArray());
  const allContacts = useLiveQuery(() => db.contacts.toArray());
  const workTypes = useLiveQuery(listWorkTypes) || [];
  const profile = useLiveQuery(getProfile);

  const [accountId, setAccountId] = useState(location.state?.accountId || '');
  const [newAccountName, setNewAccountName] = useState('');
  const [contactId, setContactId] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [locationText, setLocationText] = useState('');
  const [gps, setGps] = useState(null);
  const [serviceDate, setServiceDate] = useState(toDateInput(Date.now()));
  const [issue, setIssue] = useState('');
  const [workTypeId, setWorkTypeId] = useState('');
  const [isEstimate, setIsEstimate] = useState(false);
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

  function useShopAddress() {
    const addr = (profile?.address || '').trim();
    if (!addr) return toast('Add your business address in Settings first');
    setLocationText(addr);
    setGps(null);
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
          phones: newContactPhone.trim()
            ? [{ label: 'Mobile', number: newContactPhone.trim(), ext: '' }]
            : [],
        });
      }

      const woId = await createWorkOrder({
        accountId: acctId,
        contactId: ctctId || null,
        location: { text: locationText.trim(), ...(gps || {}) },
        serviceDate: fromDateInput(serviceDate) || Date.now(),
        issue: issue.trim(),
        isEstimate,
        workTypeId: workTypeId || null,
        templateItems: workTypes.find((w) => w.id === workTypeId)?.items || [],
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
      <AddressAutocomplete
        value={locationText}
        placeholder="Search address, or type a description"
        onChangeText={(t) => {
          setLocationText(t);
          setGps(null); // manual edit no longer matches a picked address's coordinates
        }}
        onPick={({ label, lat, lng }) => {
          setLocationText(label);
          setGps(lat != null && lng != null ? { lat, lng } : null);
        }}
      />
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={useShopAddress}>
          <Icon name="building" size={16} /> Shop
        </button>
      </div>
      <LocationMap text={locationText} lat={gps?.lat} lng={gps?.lng} />

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

      {workTypes.length > 0 && (
        <>
          <label>Work type</label>
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            <button type="button" className={`chip ${!workTypeId ? 'chip--active' : ''}`} onClick={() => setWorkTypeId('')}>
              None
            </button>
            {workTypes.map((w) => (
              <button
                type="button"
                key={w.id}
                className={`chip ${workTypeId === w.id ? 'chip--active' : ''}`}
                onClick={() => setWorkTypeId(w.id)}
              >
                <Icon name={w.icon || 'wrench'} size={14} /> {w.name}
              </button>
            ))}
          </div>
        </>
      )}

      <label>The issue</label>
      <textarea
        placeholder="What's broken / what's the job?"
        value={issue}
        onChange={(e) => setIssue(e.target.value)}
      />

      <label>Photos</label>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <label className="btn btn--ghost" style={{ margin: 0 }}>
          <Icon name="camera" /> Take photo
          <input type="file" accept="image/*" capture="environment" multiple onChange={onPhotos} hidden />
        </label>
        <label className="btn btn--ghost" style={{ margin: 0 }}>
          <Icon name="image" /> Choose from library
          <input type="file" accept="image/*" multiple onChange={onPhotos} hidden />
        </label>
      </div>
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
                <Icon name="x" size={14} />
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
