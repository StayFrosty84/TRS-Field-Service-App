import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  db,
  saveBill,
  getBillForWorkOrder,
  updateWorkOrder,
  getProfile,
} from '../db/db.js';
import { money, computeTotals } from '../lib/format.js';
import { blobToDataURL, generateBillPdf } from '../lib/pdf.js';
import { shareFile, copyText } from '../lib/share.js';
import { useToast } from '../components/Toast.jsx';
import SignaturePadField from '../components/SignaturePadField.jsx';

const blankItem = () => ({ id: crypto.randomUUID(), description: '', qty: 1, unitPrice: '' });

export default function BillEditor() {
  const { id } = useParams(); // work order id
  const toast = useToast();
  const sigRef = useRef(null);

  const [ctx, setCtx] = useState(null); // { profile, account, contact, order, photos, bill }
  const [items, setItems] = useState([blankItem()]);
  const [taxRate, setTaxRate] = useState('');
  const [existingSignature, setExistingSignature] = useState(null); // Blob
  const [busy, setBusy] = useState(false);

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
      if (bill) {
        setItems(bill.lineItems?.length ? bill.lineItems.map((li) => ({ id: crypto.randomUUID(), ...li })) : [blankItem()]);
        setTaxRate(bill.taxRate ? String(bill.taxRate) : '');
        if (bill.signatureBlob) setExistingSignature(bill.signatureBlob);
      }
    })();
  }, [id]);

  // Pre-fill the pad if this bill already had a saved signature.
  useEffect(() => {
    if (!existingSignature || !sigRef.current) return;
    blobToDataURL(existingSignature).then((url) => sigRef.current?.fromDataURL(url));
  }, [existingSignature]);

  if (!ctx) return null;
  if (ctx.missing) return <p className="muted">Work order not found.</p>;
  const { profile, account, contact, order, photos } = ctx;

  const totals = computeTotals(items, taxRate);

  const setItem = (itemId, key, val) =>
    setItems((arr) => arr.map((it) => (it.id === itemId ? { ...it, [key]: val } : it)));
  const addItem = () => setItems((arr) => [...arr, blankItem()]);
  const removeItem = (itemId) => setItems((arr) => (arr.length > 1 ? arr.filter((it) => it.id !== itemId) : arr));

  async function generateAndShare() {
    const cleanItems = items
      .filter((it) => it.description.trim() || Number(it.unitPrice) > 0)
      .map(({ description, qty, unitPrice }) => ({
        description: description.trim(),
        qty: Number(qty) || 0,
        unitPrice: Number(unitPrice) || 0,
      }));
    if (cleanItems.length === 0) return toast('Add at least one line item');

    setBusy(true);
    try {
      const signatureBlob = (await sigRef.current?.getBlob()) || existingSignature || null;
      const { subtotal, taxAmount, total } = computeTotals(cleanItems, taxRate);
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
        total,
        signatureBlob,
        recipients,
        pdfGeneratedAt: Date.now(),
      };
      await saveBill(id, billRecord);
      if (order.status === 'open') {
        await updateWorkOrder(id, { status: 'completed', completedAt: Date.now() });
      }

      const pdfBlob = await generateBillPdf({
        profile,
        account,
        contact,
        workOrder: order,
        bill: billRecord,
        photoBlobs: photos.map((p) => p.blob),
      });
      const safeName = (account?.name || 'customer').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const result = await shareFile(pdfBlob, `bill-of-sale-${safeName}.pdf`, {
        title: 'Bill of Sale',
        text: 'Bill of Sale attached.',
      });
      toast(result === 'downloaded' ? 'PDF downloaded' : result === 'shared' ? 'Shared ✓' : 'Saved');
    } catch (err) {
      console.error(err);
      toast('Could not generate PDF');
    } finally {
      setBusy(false);
    }
  }

  const recipientList = [
    { label: 'To (customer)', value: account?.email },
    { label: 'To (contact)', value: contact?.email },
    { label: 'BCC (you)', value: profile?.email },
  ].filter((r) => r.value);

  return (
    <>
      <h1 style={{ marginTop: 4 }}>Bill of Sale</h1>
      <p className="muted">{account?.name}{contact ? ` · ${contact.name}` : ''}</p>

      <div className="section-title">Line items</div>
      {items.map((it) => {
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
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={it.qty}
                  onChange={(e) => setItem(it.id, 'qty', e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <span className="muted" style={{ fontSize: 12 }}>Unit price</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={it.unitPrice}
                  onChange={(e) => setItem(it.id, 'unitPrice', e.target.value)}
                />
              </div>
              <div style={{ flex: 1, textAlign: 'right' }}>
                <span className="muted" style={{ fontSize: 12 }}>Amount</span>
                <div style={{ minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  {money(amount)}
                </div>
              </div>
            </div>
            <button className="btn btn--ghost btn--sm" style={{ marginTop: 8 }} onClick={() => removeItem(it.id)}>
              Remove
            </button>
          </div>
        );
      })}
      <button className="btn btn--ghost" onClick={addItem}>
        ＋ Add line item
      </button>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span>Subtotal</span>
          <strong>{money(totals.subtotal)}</strong>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
          <label style={{ margin: 0 }}>Tax %</label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.001"
            placeholder="0"
            value={taxRate}
            onChange={(e) => setTaxRate(e.target.value)}
            style={{ width: 110 }}
          />
        </div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
          <span>Tax</span>
          <span>{money(totals.taxAmount)}</span>
        </div>
        <hr style={{ borderColor: 'var(--border)', margin: '12px 0' }} />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong style={{ fontSize: 18 }}>Total</strong>
          <strong style={{ fontSize: 18 }}>{money(totals.total)}</strong>
        </div>
      </div>

      <div className="section-title">Customer signature</div>
      <SignaturePadField ref={sigRef} />

      {recipientList.length > 0 && (
        <>
          <div className="section-title">Email recipients (tap to copy)</div>
          <div className="card">
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              After tapping Share, pick Mail and paste these in:
            </p>
            {recipientList.map((r) => (
              <button
                key={r.label}
                className="btn btn--ghost btn--sm"
                style={{ width: '100%', justifyContent: 'space-between', marginTop: 8 }}
                onClick={async () => {
                  (await copyText(r.value)) ? toast(`Copied ${r.value}`) : toast(r.value);
                }}
              >
                <span className="muted">{r.label}</span>
                <span>{r.value} 📋</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="btn-row">
        <button className="btn" onClick={generateAndShare} disabled={busy}>
          {busy ? 'Working…' : '📄 Generate PDF & Share'}
        </button>
      </div>
    </>
  );
}
