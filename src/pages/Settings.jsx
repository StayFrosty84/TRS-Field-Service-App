import { useEffect, useState } from 'react';
import { getProfile, saveProfile } from '../db/db.js';
import { exportBackup, importBackup, backupFilename } from '../lib/backup.js';
import { shareFile } from '../lib/share.js';
import { useToast } from '../components/Toast.jsx';

const EMPTY = { businessName: '', ownerName: '', phone: '', email: '', address: '' };

export default function Settings() {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [logoBlob, setLogoBlob] = useState(null);
  const [logoUrl, setLogoUrl] = useState(null);

  useEffect(() => {
    getProfile().then((p) => {
      if (p) {
        setForm({
          businessName: p.businessName || '',
          ownerName: p.ownerName || '',
          phone: p.phone || '',
          email: p.email || '',
          address: p.address || '',
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
    await saveProfile({ ...form, logoBlob });
    toast('Profile saved');
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

      <div className="section-title">Business profile (appears on every Bill of Sale)</div>

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
        <button className="btn" onClick={saveProfileForm}>
          Save profile
        </button>
      </div>

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
