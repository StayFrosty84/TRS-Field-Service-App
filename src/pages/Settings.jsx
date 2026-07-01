import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProfile, saveProfile } from '../db/db.js';
import { useFeatures } from '../lib/useFeatures.js';
import { exportBackup, importBackup, backupFilename } from '../lib/backup.js';
import { shareFile, openBlob } from '../lib/share.js';
import { computeTotals } from '../lib/format.js';
import { sampleBillData } from '../lib/sampleBill.js';
import { getTheme, setTheme, getContrast, setContrast, getScale, setScale } from '../lib/theme.js';
import {
  getGoogleEnabled,
  setGoogleEnabled,
  getGoogleKey,
  setGoogleKey,
} from '../lib/addrProvider.js';
import { useToast } from '../components/Toast.jsx';
import CatalogManager from '../components/CatalogManager.jsx';
import WorkTypeManager from '../components/WorkTypeManager.jsx';
import ListManager from '../components/ListManager.jsx';
import StageManager from '../components/StageManager.jsx';
import ImportExport from '../components/ImportExport.jsx';
import Icon from '../components/Icon.jsx';

const EMPTY = {
  businessName: '',
  ownerName: '',
  phone: '',
  email: '',
  address: '',
  ccFeeRate: '3',
  taxRate: '',
  billTerms: '',
};

export default function Settings() {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [logoBlob, setLogoBlob] = useState(null);
  const [logoUrl, setLogoUrl] = useState(null);
  const [theme, setThemeState] = useState(getTheme());
  const [contrast, setContrastState] = useState(getContrast());
  const [scale, setScaleState] = useState(getScale());
  const [googleOn, setGoogleOnState] = useState(getGoogleEnabled());
  const [googleKey, setGoogleKeyState] = useState(getGoogleKey());
  const [stuckDays, setStuckDaysState] = useState('7');
  const features = useFeatures();

  function chooseTheme(t) {
    setTheme(t);
    setThemeState(t);
  }

  function chooseContrast(c) {
    setContrast(c);
    setContrastState(c);
  }

  function chooseScale(s) {
    setScale(s);
    setScaleState(s);
  }

  function chooseGoogle(on) {
    setGoogleEnabled(on);
    setGoogleOnState(on);
  }

  function changeGoogleKey(key) {
    setGoogleKey(key);
    setGoogleKeyState(key);
  }

  async function toggleFeature(key, value) {
    await saveProfile({ [key]: value });
  }

  function changeStuckDays(v) {
    setStuckDaysState(v);
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) saveProfile({ stuckDays: Math.floor(n) });
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
          billTerms: p.billTerms || '',
        });
        if (p.stuckDays != null) setStuckDaysState(String(p.stuckDays));
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

      <div className="section-title">Display &amp; accessibility</div>
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
      <div className="card" style={{ marginTop: 10 }}>
        <ToggleRow
          label="High contrast"
          hint="Stronger text and borders for easier reading in bright sun."
          checked={contrast === 'high'}
          onChange={(v) => chooseContrast(v ? 'high' : 'normal')}
        />
        <label>Text size</label>
        <div className="chips">
          {[
            ['normal', 'Normal'],
            ['large', 'Large'],
            ['xl', 'Larger'],
          ].map(([val, label]) => (
            <button
              key={val}
              className={`chip ${scale === val ? 'chip--active' : ''}`}
              onClick={() => chooseScale(val)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="section-title">Reports</div>
      <Link className="btn btn--ghost" to="/reports">
        <Icon name="bar-chart" /> View revenue reports
      </Link>

      <div className="section-title" style={{ marginTop: 22 }}>Backup</div>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Backup exports <strong>everything</strong> (accounts, contacts, work orders, photos, signatures)
          to one file. Use your share sheet to save it to Google Drive or iCloud / Files.
        </p>
        <button className="btn" onClick={backup}>
          <Icon name="upload" /> Backup now
        </button>
      </div>

      <Section id="profile" title="Business profile">
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Appears on every Bill of Sale.</p>

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
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          Bill numbers are auto-generated by date (e.g. 2026062101 = 1st bill on Jun 21, 2026).
        </p>

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
            <Icon name="eye" /> Preview sample
          </button>
          <button className="btn" onClick={saveProfileForm}>
            Save profile
          </button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          “Preview sample” opens an example Bill of Sale PDF using your current profile above,
          so you can check how it looks (including the credit card fee).
        </p>
      </Section>

      <Section id="lists" title="Lists &amp; templates">
        <div className="section-title" style={{ marginTop: 6 }}>Work types</div>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Pick a work type on a new work order to pre-fill the bill with these line items.
        </p>
        <WorkTypeManager />

        <div className="section-title">Parts &amp; Labor catalog</div>
        <CatalogManager />

        <div className="section-title">Payment methods</div>
        <ListManager kind="paymentMethod" label="payment method" />

        <div className="section-title">Phone labels</div>
        <ListManager kind="phoneLabel" label="phone label" />

        <div className="section-title">Account terms</div>
        <ListManager kind="accountTerm" label="term" />

        <div className="section-title">Import &amp; export lists</div>
        <ImportExport />
      </Section>

      {features.stages && (
        <Section id="workflow" title="Job workflow">
          <div className="section-title" style={{ marginTop: 6 }}>Work-order stages</div>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            The pipeline a job moves through. Drag to reorder; “finished” stages count as done.
          </p>
          <StageManager />
          <div className="card" style={{ marginTop: 10 }}>
            <label>Flag jobs stuck more than (days)</label>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={stuckDays}
              onChange={(e) => changeStuckDays(e.target.value)}
              style={{ maxWidth: 120 }}
            />
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              The Dashboard flags any job sitting in a non-finished stage longer than this.
            </p>
          </div>
        </Section>
      )}

      <Section id="integrations" title="Integrations">
        <div className="section-title" style={{ marginTop: 6 }}>Address search</div>
        <div className="card">
          <ToggleRow
            label="Use Google address search"
            hint="More accurate suggestions. Needs your own Google Maps API key (free tier). Stored on this device only — never included in backups. Falls back to the free search when off or unavailable."
            checked={googleOn}
            onChange={chooseGoogle}
          />
          {googleOn && (
            <>
              <label>Google Maps API key</label>
              <input
                type="password"
                value={googleKey}
                onChange={(e) => changeGoogleKey(e.target.value)}
                placeholder="Paste your API key"
                autoComplete="off"
              />
              <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                In the Google Cloud console: create an API key, enable “Places API (New)” and
                “Maps Embed API” (for the inline map), and restrict the key to your app’s
                website. It stays on this device.
              </p>
            </>
          )}
        </div>
      </Section>

      <Section id="advanced" title="Advanced">
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Feature toggles and data recovery. Leave these as-is unless you mean to change them.
        </p>
        <div className="card">
          <ToggleRow
            label="Home dashboard"
            hint="Show the Home tab with summary stats. When off, the Work tab is your home screen."
            checked={features.dashboard}
            onChange={(v) => toggleFeature('featDashboard', v)}
          />
          <ToggleRow
            label="Payment tracking"
            hint="Track Paid/Unpaid on bills and work orders."
            checked={features.billing}
            onChange={(v) => toggleFeature('featBilling', v)}
          />
          <ToggleRow
            label="Credit card fee"
            hint="Show the card-fee option on bills."
            checked={features.cardFee}
            onChange={(v) => toggleFeature('featCardFee', v)}
          />
          <ToggleRow
            label="Work-order stages"
            hint="Use a configurable stage pipeline (Open → Scheduled → … → Paid) instead of a simple open/completed toggle."
            checked={features.stages}
            onChange={(v) => toggleFeature('featStages', v)}
          />
        </div>

        <div className="section-title">Restore from backup</div>
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            Restoring <strong>replaces all current data</strong> with a backup file.
          </p>
          <label className="btn btn--ghost" style={{ margin: 0 }}>
            <Icon name="download" /> Restore from file
            <input type="file" accept="application/json,.json" onChange={restore} hidden />
          </label>
        </div>
      </Section>

      <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 24 }}>
        Field Service v{__APP_VERSION__}
      </p>
    </>
  );
}

// Collapsible Settings group. Remembers open/closed per id on this device.
function Section({ id, title, children }) {
  const storageKey = `fs-settings-open:${id}`;
  const [open, setOpen] = useState(() => localStorage.getItem(storageKey) === '1');
  return (
    <details
      className="settings-group"
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        if (next === open) return;
        setOpen(next);
        localStorage.setItem(storageKey, next ? '1' : '0');
      }}
    >
      <summary>{title}</summary>
      {children}
    </details>
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
