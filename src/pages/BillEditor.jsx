import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  db,
  saveBill,
  getBillForWorkOrder,
  updateWorkOrder,
  getProfile,
  savePdfToBill,
} from '../db/db.js';
import { money, computeTotals, toDateInput, fromDateInput, fmtDate } from '../lib/format.js';
import { blobToDataURL, generateBillPdf } from '../lib/pdf.js';
import { shareFile, openBlob, copyText } from '../lib/share.js';
import { useToast } from '../components/Toast.jsx';
import { useFeatures } from '../lib/useFeatures.js';
import SignaturePadField from '../components/SignaturePadField.jsx';
import CatalogPicker from '../components/CatalogPicker.jsx';
import Icon from '../components/Icon.jsx';

const blankItem = () => ({ id: crypto.randomUUID(), description: '', qty: 1, unitPrice: '' });

export default function BillEditor() {
  const { id } = useParams(); // work order id
  const navigate = useNavigate();
  const toast = useToast();
  const features = useFeatures();
  const sigRef = useRef(null);

  const [ctx, setCtx] = useState(null);
  const [step, setStep] = useState('edit'); // edit | review | done
  const [items, setItems] = useState([blankItem()]);
  const [taxRate, setTaxRate] = useState('');
  const [billDate, setBillDate] = useState(toDateInput(Date.now()));
  const [ccFeeApplied, setCcFeeApplied] = useState(false);
  const [ccFeeRate, setCcFeeRate] = useState('3');
  const [paymentStatus, setPaymentStatus] = useState('unpaid');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [existingSignature, setExistingSignature] = useState(null);
  const [busy, setBusy] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [result, setResult] = useState(null); // { pdfBlob, recipients }

  useEffect(() => {
    (async () => {
      const order = await db.workOrders.get(id);
      if (!order) return setCtx({ missing: true });
      const account = await db.accounts.get(order.accountId);
      const contact = order.contactId ? await db.contacts.get(order.contactId) : null;
      const photos = await db.photos.where('workOrderId').equals(id).toArray();
      const profile = await getProfile();
      const bill = await getBillForWorkOrder(id);
      setCtx({ order, account, contact, photos, profile, bill });
      const defaultCcRate = profile?.ccFeeRate != null ? String(profile.ccFeeRate) : '3';
      if (bill) {
        setItems(bill.lineItems?.length ? bill.lineItems.map((li) => ({ id: crypto.randomUUID(), ...li })) : [blankItem()]);
        setTaxRate(bill.taxRate ? String(bill.taxRate) : '');
        setBillDate(toDateInput(bill.billDate || bill.pdfGeneratedAt || Date.now()));
        setCcFeeApplied(Boolean(bill.ccFeeApplied));
        setCcFeeRate(bill.ccFeeRate != null ? String(bill.ccFeeRate) : defaultCcRate);
        setPaymentStatus(bill.paymentStatus || 'unpaid');
        setPaymentMethod(bill.paymentMethod || '');
        if (bill.signatureBlob) setExistingSignature(bill.signatureBlob);
      } else {
        setCcFeeRate(defaultCcRate);
        if (profile?.taxRate) setTaxRate(String(profile.taxRate));
        if (order.templateItems?.length) {
          setItems(
            order.templateItems.map((li) => ({
              id: crypto.randomUUID(),
              description: li.description,
              qty: li.qty ?? 1,
              unitPrice: li.unitPrice ?? '',
            }))
          );
        }
      }
    })();
  }, [id]);

  // Pre-fill the pad with a saved signature when the review step mounts it.
  useEffect(() => {
    if (step !== 'review' || !existingSignature || !sigRef.current) return;
    blobToDataURL(existingSignature).then((url) => sigRef.current?.fromDataURL(url));
  }, [step, existingSignature]);

  if (!ctx) return null;
  if (ctx.missing) return <p className="muted">Work order not found.</p>;
  const { profile, account, contact, order, photos } = ctx;

  const totals = computeTotals(items, taxRate, ccFeeRate, features.cardFee && ccFeeApplied);
  const cleanItems = items
    .filter((it) => it.description.trim() || Number(it.unitPrice) > 0)
    .map(({ description, qty, unitPrice }) => ({
      description: description.trim(),
      qty: Number(qty) || 0,
      unitPrice: Number(unitPrice) || 0,
    }));

  const setItem = (itemId, key, val) =>
    setItems((arr) => arr.map((it) => (it.id === itemId ? { ...it, [key]: val } : it)));
  const addItem = () => setItems((arr) => [...arr, blankItem()]);
  const removeItem = (itemId) => setItems((arr) => (arr.length > 1 ? arr.filter((it) => it.id !== itemId) : arr));
  const moveItem = (itemId, dir) =>
    setItems((arr) => {
      const i = arr.findIndex((it) => it.id === itemId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return arr;
      const copy = [...arr];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  function addFromCatalog(item) {
    const line = { id: crypto.randomUUID(), description: item.description, qty: 1, unitPrice: item.unitPrice };
    setItems((arr) => {
      const onlyBlank = arr.length === 1 && !arr[0].description.trim() && !arr[0].unitPrice;
      return onlyBlank ? [line] : [...arr, line];
    });
    toast(`Added ${item.description}`);
  }

  function goReview() {
    if (cleanItems.length === 0) return toast('Add at least one line item');
    setStep('review');
  }

  async function generate() {
    setBusy(true);
    try {
      const signatureBlob = (await sigRef.current?.getBlob()) || existingSignature || null;
      const ccOn = features.cardFee && ccFeeApplied;
      const { subtotal, taxAmount, ccFeeAmount, total } = computeTotals(cleanItems, taxRate, ccFeeRate, ccOn);
      const recipients = {
        customerEmail: account?.email || '',
        contactEmail: contact?.email || '',
        bccSelf: profile?.email || '',
      };
      const billRecord = {
        lineItems: cleanItems,
        taxRate: Number(taxRate) || 0,
        subtotal,
        taxAmount,
        ccFeeApplied: ccOn,
        ccFeeRate: ccOn ? Number(ccFeeRate) || 0 : 0,
        ccFeeAmount,
        total,
        billDate: fromDateInput(billDate) || Date.now(),
        paymentStatus: features.billing ? paymentStatus : 'unpaid',
        paymentMethod: features.billing && paymentStatus === 'paid' ? paymentMethod : '',
        signatureBlob,
        recipients,
        pdfGeneratedAt: Date.now(),
      };
      const savedId = await saveBill(id, billRecord);
      if (order.status === 'open') await updateWorkOrder(id, { status: 'completed', completedAt: Date.now() });
      const saved = await getBillForWorkOrder(id);

      const pdfBlob = await generateBillPdf({
        profile,
        account,
        contact,
        workOrder: order,
        bill: { ...billRecord, billNumber: saved?.billNumber },
        photoBlobs: photos.map((p) => p.blob),
      });
      await savePdfToBill(savedId, pdfBlob);

      setResult({ pdfBlob, recipients });
      setStep('done');
      toast('Bill saved to work order');
    } catch (err) {
      console.error(err);
      toast('Could not generate PDF');
    } finally {
      setBusy(false);
    }
  }

  const isEstimate = Boolean(order?.isEstimate);
  const docNoun = isEstimate ? 'Estimate' : 'Bill of Sale';
  const pdfName = `${isEstimate ? 'estimate' : 'bill-of-sale'}-${(account?.name || 'customer').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
  const billNo = ctx.bill?.billNumber ? String(ctx.bill.billNumber) : null;

  // ---------- DONE ----------
  if (step === 'done') {
    const recipientList = [
      { label: 'To (customer)', value: result?.recipients?.customerEmail },
      { label: 'To (contact)', value: result?.recipients?.contactEmail },
      { label: 'BCC (you)', value: result?.recipients?.bccSelf },
    ].filter((r) => r.value);
    return (
      <>
        <div className="empty" style={{ paddingBottom: 12 }}>
          <span className="ico"><Icon name="check-circle" size={40} /></span>
          {docNoun} saved to this work order.
        </div>

        {recipientList.length > 0 && (
          <>
            <div className="section-title">Email recipients (tap to copy)</div>
            <div className="card">
              {recipientList.map((r) => (
                <button
                  key={r.label}
                  className="btn btn--ghost btn--sm"
                  style={{ width: '100%', justifyContent: 'space-between', marginTop: 8 }}
                  onClick={async () => ((await copyText(r.value)) ? toast(`Copied ${r.value}`) : toast(r.value))}
                >
                  <span className="muted">{r.label}</span>
                  <span>{r.value} <Icon name="clipboard" size={14} /></span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="btn-row">
          <button className="btn btn--ghost" onClick={() => openBlob(result.pdfBlob, pdfName)}>
            <Icon name="eye" /> View PDF
          </button>
          <button className="btn" onClick={() => shareFile(result.pdfBlob, pdfName, { title: docNoun })}>
            <Icon name="share" /> Share PDF
          </button>
        </div>
        <div className="btn-row">
          <button className="btn btn--ghost" onClick={() => navigate(`/work-orders/${id}`)}>
            Done
          </button>
        </div>
      </>
    );
  }

  // ---------- REVIEW ----------
  if (step === 'review') {
    return (
      <>
        <h1 style={{ marginTop: 4 }}>Review with customer</h1>
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 18 }}>{profile?.businessName || 'Bill of Sale'}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {fmtDate(fromDateInput(billDate))}
            {billNo ? ` · ${billNo}` : ''}
          </div>
          <hr style={{ borderColor: 'var(--border)', margin: '12px 0' }} />
          <div className="muted" style={{ fontSize: 13 }}>Bill to</div>
          <div style={{ fontWeight: 600 }}>{account?.name}</div>
          {contact && <div className="muted">{contact.name}</div>}

          <hr style={{ borderColor: 'var(--border)', margin: '12px 0' }} />
          {cleanItems.map((li, i) => (
            <div key={i} className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ flex: 1 }}>
                {li.description}{' '}
                <span className="muted">
                  {li.qty} × {money(li.unitPrice)}
                </span>
              </span>
              <strong>{money(li.qty * li.unitPrice)}</strong>
            </div>
          ))}
          <hr style={{ borderColor: 'var(--border)', margin: '12px 0' }} />
          <Row label="Subtotal" val={money(totals.subtotal)} />
          {Number(taxRate) > 0 && <Row label={`Tax (${taxRate}%)`} val={money(totals.taxAmount)} />}
          {features.cardFee && ccFeeApplied && (
            <Row label={`Credit card fee (${ccFeeRate}%)`} val={money(totals.ccFeeAmount)} />
          )}
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <strong style={{ fontSize: 20 }}>Total</strong>
            <strong style={{ fontSize: 20 }}>{money(totals.total)}</strong>
          </div>
        </div>

        <div className="section-title">Customer signature</div>
        <SignaturePadField ref={sigRef} />

        <div className="btn-row">
          <button className="btn btn--ghost" onClick={() => setStep('edit')}>
            <Icon name="arrow-left" /> Back
          </button>
          <button className="btn" onClick={generate} disabled={busy}>
            {busy ? 'Saving…' : <><Icon name="check" /> Generate &amp; Save PDF</>}
          </button>
        </div>
      </>
    );
  }

  // ---------- EDIT ----------
  return (
    <>
      <h1 style={{ marginTop: 4 }}>{docNoun}</h1>
      <p className="muted">
        {account?.name}
        {contact ? ` · ${contact.name}` : ''}
        {billNo ? ` · ${billNo}` : ''}
      </p>

      <div className="section-title">Line items</div>
      {items.map((it, idx) => {
        const amount = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
        return (
          <div key={it.id} className="card" style={{ padding: 12 }}>
            <input
              placeholder="Description (part or labor)"
              value={it.description}
              onChange={(e) => setItem(it.id, 'description', e.target.value)}
            />
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <span className="muted" style={{ fontSize: 12 }}>Qty</span>
                <input type="number" inputMode="decimal" min="0" value={it.qty} onChange={(e) => setItem(it.id, 'qty', e.target.value)} style={{ fontSize: 18, fontWeight: 600, textAlign: 'center' }} />
              </div>
              <div style={{ flex: 1 }}>
                <span className="muted" style={{ fontSize: 12 }}>Unit price</span>
                <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={it.unitPrice} onChange={(e) => setItem(it.id, 'unitPrice', e.target.value)} style={{ fontSize: 18 }} />
              </div>
              <div style={{ flex: '0 0 84px', textAlign: 'right' }}>
                <span className="muted" style={{ fontSize: 12 }}>Amount</span>
                <div style={{ minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>{money(amount)}</div>
              </div>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8, justifyContent: 'space-between' }}>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn--ghost btn--sm" aria-label="Move up" disabled={idx === 0} onClick={() => moveItem(it.id, -1)}>
                  <Icon name="chevron-up" size={16} />
                </button>
                <button className="btn btn--ghost btn--sm" aria-label="Move down" disabled={idx === items.length - 1} onClick={() => moveItem(it.id, 1)}>
                  <Icon name="chevron-down" size={16} />
                </button>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={() => removeItem(it.id)}>
                Remove
              </button>
            </div>
          </div>
        );
      })}
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn btn--ghost" onClick={addItem}><Icon name="plus" /> Add line item</button>
        <button className="btn btn--ghost" onClick={() => setCatalogOpen(true)}><Icon name="clipboard" /> Add from catalog</button>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <Row label="Subtotal" val={money(totals.subtotal)} />
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
          <label style={{ margin: 0 }}>Tax %</label>
          <input type="number" inputMode="decimal" min="0" step="0.001" placeholder="0" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} style={{ width: 110 }} />
        </div>
        <Row label="Tax" val={money(totals.taxAmount)} mt />

        {features.cardFee && (
          <>
            <hr style={{ borderColor: 'var(--border)', margin: '12px 0' }} />
            <label className="row" style={{ margin: 0, gap: 10, alignItems: 'center' }}>
              <input type="checkbox" checked={ccFeeApplied} onChange={(e) => setCcFeeApplied(e.target.checked)} style={{ width: 22, height: 22, minHeight: 0, flex: '0 0 auto' }} />
              <span style={{ flex: 1 }}>Add credit card fee</span>
              <input type="number" inputMode="decimal" min="0" step="0.01" value={ccFeeRate} onChange={(e) => setCcFeeRate(e.target.value)} disabled={!ccFeeApplied} aria-label="Credit card fee percent" style={{ width: 84 }} />
              <span className="muted">%</span>
            </label>
            {ccFeeApplied && <Row label="Credit card fee" val={money(totals.ccFeeAmount)} mt />}
          </>
        )}

        <hr style={{ borderColor: 'var(--border)', margin: '12px 0' }} />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong style={{ fontSize: 18 }}>Total</strong>
          <strong style={{ fontSize: 18 }}>{money(totals.total)}</strong>
        </div>
      </div>

      <label>Bill date</label>
      <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />

      {features.billing && (
        <>
          <div className="section-title">Payment</div>
          <div className="chips">
            {[
              ['unpaid', 'Unpaid'],
              ['paid', 'Paid'],
            ].map(([val, label]) => (
              <button key={val} className={`chip ${paymentStatus === val ? 'chip--active' : ''}`} onClick={() => setPaymentStatus(val)}>
                {label}
              </button>
            ))}
          </div>
          {paymentStatus === 'paid' && (
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="">Payment method…</option>
              <option>Cash</option>
              <option>Check</option>
              <option>Card</option>
              <option>Zelle</option>
              <option>Other</option>
            </select>
          )}
        </>
      )}

      <div className="btn-row">
        <button className="btn" onClick={goReview}>
          Review &amp; sign <Icon name="arrow-right" />
        </button>
      </div>

      {catalogOpen && <CatalogPicker onPick={addFromCatalog} onClose={() => setCatalogOpen(false)} />}
    </>
  );
}

function Row({ label, val, mt }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', ...(mt ? { marginTop: 10 } : {}) }}>
      <span>{label}</span>
      <span>{val}</span>
    </div>
  );
}
