import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProfile, saveProfile } from '../db/db.js';
import { useFeatures } from '../lib/useFeatures.js';
import { exportBackup, importBackup, backupFilename } from '../lib/backup.js';
import { shareFile, openBlob } from '../lib/share.js';
import { computeTotals } from '../lib/format.js';
import { sampleBillData } from '../lib/sampleBill.js';
import { getTheme, setTheme } from '../lib/theme.js';
import { useToast } from '../components/Toast.jsx';
import CatalogManager from '../components/CatalogManager.jsx';

const EMPTY = {
  businessName: '',
  ownerName: '',
  phone: '',
  email: '',
  address: '',
  ccFeeRate: '3',
  taxRate: '',
  billPrefix: 'BOS-',
  billTerms: '',
};

export default function Settings() {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [logoBlob, setLogoBlob] = useState(null);
  const [logoUrl, setLogoUrl] = useState(null);
  const [theme, setThemeState] = useState(getTheme());
  const features = useFeatures();

  function chooseTheme(t) {
    setTheme(t);
    setThemeState(t);
  }

  async function toggleFeature(key, value) {
    await saveProfile({ [key]: value });
  }

  useEffect(() => {
    getProfile().then((p) => {
      if (p) {
        setForm({
          businessName: p.businessName || '',
          ownerName: p.ownerName || '',
          phone: p.phone || '',
          email: p.email || '',
          address: p.address || '',
          ccFeeRate: p.ccFeeRate != null ? String(p.ccFeeRate) : '3',
          taxRate: p.taxRate != null ? String(p.taxRate) : '',
          billPrefix: p.billPrefix != null ? p.billPrefix : 'BOS-',
          billTerms: p.billTerms || '',
        });
        if (p.logoBlob) {
          setLogoBlob(p.logoBlob);
          setLogoUrl(URL.createObjectURL(p.logoBlob));
        }
      }
    });
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function onLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (logoUrl) URL.revokeObjectURL(logoUrl);
    setLogoBlob(file);
    setLogoUrl(URL.createObjectURL(file));
  }

  async function saveProfileForm() {
    await saveProfile({
      ...form,
      ccFeeRate: Number(form.ccFeeRate) || 0,
      taxRate: Number(form.taxRate) || 0,
      logoBlob,
    });
    toast('Profile saved');
  }

  async function previewSample() {
    // Load the PDF library on demand so it stays out of the main bundle.
    const { generateBillPdf } = await import('../lib/pdf.js');
    const { account, contact, workOrder, lineItems, taxRate } = sampleBillData();
    const ccRate = Number(form.ccFeeRate) || 0;
    const { subtotal, taxAmount, ccFeeAmount, total } = computeTotals(lineItems, taxRate, ccRate, true);
    const bill = {
      lineItems,
      taxRate,
      subtotal,
      taxAmount,
      ccFeeApplied: true,
      ccFeeRate: ccRate,
      ccFeeAmount,
      total,
      signatureBlob: null,
      pdfGeneratedAt: Date.now(),
    };
    const blob = await generateBillPdf({
      profile: { ...form, logoBlob },
      account,
      contact,
      workOrder,
      bill,
      photoBlobs: [],
    });
    openBlob(blob, 'sample-bill-of-sale.pdf');
    toast('Opening sample PDF…');
  }

  async function backup() {
    const blob = await exportBackup();
    const result = await shareFile(blob, backupFilename(), {
      title: 'Field Service backup',
      text: 'Field Service data backup',
    });
    toast(result === 'downloaded' ? 'Backup downloaded' : 'Backup ready — save it to the cloud');
  }

  async function restore(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('Restoring will REPLACE all current data with the backup. Continue?')) return;
    try {
      const counts = await importBackup(file);
      toast(`Restored ${counts.accounts} accounts, ${counts.workOrders} work orders`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast(err.message || 'Restore failed');
    }
  }

  return (
    <>
      <h1 style={{ marginTop: 4 }}>Settings</h1>

      <div className="section-title">Appearance</div>
      <div className="chips">
        {[
          ['system', 'System'],
          ['light', 'Light'],
          ['dark', 'Dark'],
        ].map(([val, label]) => (
          <button
            key={val}
            className={`chip ${theme === val ? 'chip--active' : ''}`}
            onClick={() => chooseTheme(val)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="section-title">Features</div>
      <div className="card">
        <ToggleRow
          label="Home dashboard"
          hint="When off, Home is just the work-order list."
          checked={features.dashboard}
          onChange={(v) => toggleFeature('featDashboard', v)}
        />
        <ToggleRow
          label="Billing tab & payment tracking"
          hint="Show the Billing tab and Paid/Unpaid on bills."
          checked={features.billing}
          onChange={(v) => toggleFeature('featBilling', v)}
        />
        <ToggleRow
          label="Credit card fee"
          hint="Show the card-fee option on bills."
          checked={features.cardFee}
          onChange={(v) => toggleFeature('featCardFee', v)}
        />
      </div>

      <div className="section-title">Reports</div>
      <Link className="btn btn--ghost" to="/reports">
        📊 View revenue reports
      </Link>

      <div className="section-title" style={{ marginTop: 22 }}>Business profile (appears on every Bill of Sale)</div>

      <label>Business name</label>
      <input value={form.businessName} onChange={set('businessName')} />

      <label>Your name</label>
      <input value={form.ownerName} onChange={set('ownerName')} />

      <label>Phone</label>
      <input type="tel" value={form.phone} onChange={set('phone')} />

      <label>Email (used as your BCC on bills)</label>
      <input type="email" value={form.email} onChange={set('email')} />

      <label>Address</label>
      <textarea value={form.address} onChange={set('address')} />

      <div className="row" style={{ gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label>Default tax %</label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.001"
            value={form.taxRate}
            onChange={set('taxRate')}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label>Default card fee %</label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={form.ccFeeRate}
            onChange={set('ccFeeRate')}
          />
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
        Defaults for new bills — both stay editable on each bill.
      </p>

      <label>Bill number prefix</label>
      <input value={form.billPrefix} onChange={set('billPrefix')} placeholder="BOS-" style={{ width: 160 }} />

      <label>Terms / notes (printed at the bottom of every bill)</label>
      <textarea
        value={form.billTerms}
        onChange={set('billTerms')}
        placeholder="e.g. Payment due upon receipt. Thank you for your business!"
      />

      <label>Logo (optional)</label>
      <div className="row" style={{ gap: 12 }}>
        {logoUrl && (
          <img src={logoUrl} alt="logo" style={{ width: 64, height: 64, objectFit: 'contain', background: '#fff', borderRadius: 10 }} />
        )}
        <label className="btn btn--ghost btn--sm" style={{ margin: 0 }}>
          Choose logo
          <input type="file" accept="image/*" onChange={onLogo} hidden />
        </label>
      </div>

      <div className="btn-row">
        <button className="btn btn--ghost" onClick={previewSample}>
          👁 Preview sample
        </button>
        <button className="btn" onClick={saveProfileForm}>
          Save profile
        </button>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
        “Preview sample” opens an example Bill of Sale PDF using your current profile above,
        so you can check how it looks (including the credit card fee).
      </p>

      <div className="section-title">Parts &amp; Labor catalog</div>
      <CatalogManager />

      <div className="section-title">Backup &amp; restore</div>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Backup exports <strong>everything</strong> (accounts, contacts, work orders, photos, signatures)
          to one file. Use your share sheet to save it to Google Drive or iCloud / Files.
        </p>
        <button className="btn" onClick={backup}>
          ⬆️ Backup now
        </button>
        <label className="btn btn--ghost" style={{ marginTop: 10 }}>
          ⬇️ Restore from file
          <input type="file" accept="application/json,.json" onChange={restore} hidden />
        </label>
      </div>
    </>
  );
}

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <label className="row" style={{ gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 22, height: 22, minHeight: 0, flex: '0 0 auto', marginTop: 2 }}
      />
      <span style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div className="muted" style={{ fontSize: 13 }}>{hint}</div>
      </span>
    </label>
  );
}
