import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, createAccount, createContact, createWorkOrder, addPhoto, listWorkTypes, listStages, setWorkOrderStage, getProfile, listCatalog } from '../db/db.js';
import { toDateInput, fromDateInput } from '../lib/format.js';
import { computeRoundTripMiles, resolveOrigin, resolveDest } from '../lib/mileage.js';
import { resolveTemplateItems } from '../lib/templateItems.js';
import { accountWarning } from '../lib/unpaid.js';
import { useFeatures } from '../lib/useFeatures.js';
import { useAutosave } from '../lib/useAutosave.js';
import { loadDraft, saveDraft, clearDraft, draftHasContent } from '../lib/draft.js';
import { useToast } from '../components/Toast.jsx';
import AddressAutocomplete from '../components/AddressAutocomplete.jsx';
import LocationMap from '../components/LocationMap.jsx';
import Icon from '../components/Icon.jsx';

export default function WorkOrderNew() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const features = useFeatures();
  const accounts = useLiveQuery(() => db.accounts.orderBy('name').toArray());
  const allContacts = useLiveQuery(() => db.contacts.toArray());
  const workTypes = useLiveQuery(listWorkTypes) || [];
  const catalog = useLiveQuery(listCatalog) || [];
  const stages = useLiveQuery(listStages) || [];
  const profile = useLiveQuery(getProfile);

  // Restore any unsaved draft from a previous visit (cleared on save/Cancel).
  const [draft] = useState(() => loadDraft());

  const [accountId, setAccountId] = useState(location.state?.accountId || draft?.accountId || '');
  const [newAccountName, setNewAccountName] = useState(draft?.newAccountName || '');
  const [contactId, setContactId] = useState(draft?.contactId || '');
  const [newContactName, setNewContactName] = useState(draft?.newContactName || '');
  const [newContactPhone, setNewContactPhone] = useState(draft?.newContactPhone || '');
  const [locationText, setLocationText] = useState(draft?.locationText || '');
  const [gps, setGps] = useState(draft?.gps || null);
  const [miles, setMiles] = useState(draft?.miles ?? null);
  const [serviceDate, setServiceDate] = useState(draft?.serviceDate || toDateInput(Date.now()));
  const [issue, setIssue] = useState(draft?.issue || '');
  const [unitNumber, setUnitNumber] = useState(draft?.unitNumber || '');
  const [referenceNumber, setReferenceNumber] = useState(draft?.referenceNumber || '');
  const [workTypeId, setWorkTypeId] = useState(draft?.workTypeId || '');
  const [stageId, setStageId] = useState(draft?.stageId || '');
  const [isEstimate, setIsEstimate] = useState(Boolean(draft?.isEstimate));

  // Default the stage to the first pipeline stage once stages load (unless a draft picked one).
  useEffect(() => {
    if (!stageId && stages.length) setStageId(stages[0].id);
  }, [stages, stageId]);
  const [photos, setPhotos] = useState([]); // { id, blob, url } — not part of the draft
  const [busy, setBusy] = useState(false);

  // Let the user know their previous entries came back.
  useEffect(() => {
    if (draftHasContent(draft)) toast('Restored your unsaved work order');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the in-progress form so leaving the screen doesn't lose it.
  const draftData = {
    accountId,
    newAccountName,
    contactId,
    newContactName,
    newContactPhone,
    locationText,
    gps,
    miles,
    serviceDate,
    issue,
    unitNumber,
    referenceNumber,
    workTypeId,
    stageId,
    isEstimate,
  };
  const { status: draftStatus, cancel: cancelDraft } = useAutosave(
    draftData,
    (d) => (draftHasContent(d) ? saveDraft(d) : clearDraft())
  );

  // Drop the draft (and any pending write) — used on Cancel and after a real save.
  function discardDraft() {
    cancelDraft();
    clearDraft();
  }

  const contactsForAccount = useMemo(
    () => (allContacts || []).filter((c) => c.accountId === accountId),
    [allContacts, accountId]
  );

  const creatingAccount = accountId === '__new__';
  const creatingContact = contactId === '__new__';

  const selectedAccount = (accounts || []).find((a) => a.id === accountId);
  const warning = selectedAccount ? accountWarning(selectedAccount) : null;

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

  // Recompute round-trip miles from the shop to a job location. Silent on failure /
  // offline — we just keep whatever we had. Not awaited by callers.
  async function recomputeMiles(location) {
    setMiles(null); // invalidate the previous address's miles until a fresh value returns
    const origin = resolveOrigin(profile);
    const dest = resolveDest(location);
    if (!origin || !dest || !navigator.onLine) return;
    setMiles(await computeRoundTripMiles({ origin, dest })); // null on failure = no stale value
  }

  function useShopAddress() {
    const addr = (profile?.address || '').trim();
    if (!addr) return toast('Add your business address in Settings first');
    setLocationText(addr);
    setGps(null);
    setMiles(0);
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

      const finalLocation = { text: locationText.trim(), ...(gps || {}) };
      // Online: recompute authoritatively (fresh value or null). Offline: trust the
      // current `miles` state, which recomputeMiles already cleared on a failed re-pick.
      let finalMiles = miles;
      if (navigator.onLine) {
        finalMiles = await computeRoundTripMiles({ origin: resolveOrigin(profile), dest: resolveDest(finalLocation) });
      }

      const woId = await createWorkOrder({
        accountId: acctId,
        contactId: ctctId || null,
        location: finalLocation,
        roundTripMiles: finalMiles ?? undefined,
        serviceDate: fromDateInput(serviceDate) || Date.now(),
        issue: issue.trim(),
        unitNumber: unitNumber.trim(),
        referenceNumber: referenceNumber.trim(),
        isEstimate,
        workTypeId: workTypeId || null,
        templateItems: resolveTemplateItems(
          workTypes.find((w) => w.id === workTypeId)?.items || [],
          new Map(catalog.map((c) => [c.id, c]))
        ).map(({ description, qty, unitPrice }) => ({ description, qty, unitPrice })),
      });

      // createWorkOrder seeds the first stage; if the user picked a different one, move it
      // there so the legacy status/completedAt shadow + stage history stay correct.
      const chosenStage = stages.find((s) => s.id === stageId);
      if (chosenStage && stages[0] && chosenStage.id !== stages[0].id) {
        await setWorkOrderStage(woId, chosenStage);
      }

      for (const p of photos) await addPhoto(woId, p.blob);
      photos.forEach((p) => URL.revokeObjectURL(p.url));

      discardDraft(); // committed to a real record now
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
      {warning && (
        <div
          className="card"
          style={{
            marginTop: 8,
            background: 'var(--badge-open-bg)',
            color: 'var(--badge-open-fg)',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
          role="alert"
        >
          <Icon name="alert-triangle" size={16} /> {warning}
        </div>
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

      {features.stages && stages.length > 0 && (
        <>
          <label>Stage</label>
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {stages.map((s) => (
              <button
                type="button"
                key={s.id}
                className={`chip ${stageId === s.id ? 'chip--active' : ''}`}
                onClick={() => setStageId(s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
        </>
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
          const g = lat != null && lng != null ? { lat, lng } : null;
          setGps(g);
          recomputeMiles({ text: label, ...(g || {}) });
        }}
      />
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={useShopAddress}>
          <Icon name="building" size={16} /> Shop
        </button>
      </div>
      <LocationMap text={locationText} lat={gps?.lat} lng={gps?.lng} />
      <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
        Round trip from shop: {miles != null ? `${miles} mi` : '—'}
      </p>

      <label>Unit #</label>
      <input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} />
      <label>Reference #</label>
      <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />

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

      <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
        {draftStatus === 'saving'
          ? 'Saving draft…'
          : draftStatus === 'saved'
            ? 'Draft saved ✓ — your progress is kept if you leave'
            : 'Your progress is saved automatically'}
      </p>

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            discardDraft();
            navigate(-1);
          }}
        >
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
