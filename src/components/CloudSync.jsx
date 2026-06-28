import { useEffect, useState } from 'react';
import { subscribe, getStatus, connect, disconnect, syncNow, isConfigured } from '../lib/sync/engine.js';
import { getClientId, setClientId, getSyncEndpoint, setSyncEndpoint } from '../lib/sync/drive.js';
import { useToast } from './Toast.jsx';
import Icon from './Icon.jsx';

function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

// Cloud Sync section: connect this device to a shared Google Drive folder so the field tech
// and office admin (on any phone signed into the same Google account) share one dataset.
export default function CloudSync() {
  const toast = useToast();
  const [status, setStatus] = useState(getStatus());
  const [clientId, setCid] = useState(getClientId());
  const [endpoint, setEndpoint] = useState(getSyncEndpoint());
  const [editingId, setEditingId] = useState(!isConfigured());
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribe(setStatus), []);

  function saveConfig() {
    setClientId(clientId);
    setSyncEndpoint(endpoint);
    setEditingId(false);
    toast('Sync settings saved');
  }

  async function run(fn, okMsg) {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast(okMsg);
    } catch (e) {
      toast(e.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const configured = isConfigured();

  return (
    <div className="card">
      <p className="muted" style={{ marginTop: 0 }}>
        Sync keeps the <strong>same data</strong> on every phone signed into one shared Google
        account — changes flow automatically while the app is open and online. It also doubles as a
        cloud backup.
      </p>

      {(!configured || editingId) && (
        <>
          <label>Google OAuth Client ID</label>
          <input
            value={clientId}
            onChange={(e) => setCid(e.target.value)}
            placeholder="xxxxx.apps.googleusercontent.com"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <label>Token endpoint (Google Apps Script URL)</label>
          <input
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <div className="btn-row">
            <button className="btn" onClick={saveConfig}>
              Save
            </button>
            {configured && (
              <button className="btn btn--ghost" onClick={() => setEditingId(false)}>
                Cancel
              </button>
            )}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            One-time setup — see “How to set up Google Drive sync” below.
          </p>
        </>
      )}

      {configured && !editingId && (
        <>
          {!status.connected ? (
            <button className="btn" disabled={busy} onClick={() => run(connect, 'Connected to Google Drive')}>
              <Icon name="upload" /> Connect Google Drive
            </button>
          ) : (
            <>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {status.syncing ? 'Syncing…' : status.error ? 'Reconnect needed' : 'Connected'}
                    {!status.online && ' (offline)'}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Last synced {timeAgo(status.lastSyncedAt)}
                  </div>
                </div>
                <button className="btn btn--ghost btn--sm" disabled={busy || status.syncing} onClick={() => run(() => syncNow())}>
                  Sync now
                </button>
              </div>
              {status.error && (
                <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
                  {status.error.includes('No Google') ? status.error : 'Tap “Connect Google Drive” to reconnect.'}
                </p>
              )}
              {status.error && (
                <button className="btn btn--ghost" style={{ marginTop: 10 }} disabled={busy} onClick={() => run(connect, 'Reconnected')}>
                  Reconnect Google Drive
                </button>
              )}
            </>
          )}

          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn btn--ghost btn--sm" onClick={() => setEditingId(true)}>
              Change settings
            </button>
            {status.connected && (
              <button className="btn btn--ghost btn--sm" onClick={() => run(disconnect, 'Disconnected')}>
                Disconnect
              </button>
            )}
          </div>
        </>
      )}

      <details style={{ marginTop: 12 }}>
        <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>
          How to set up Google Drive sync
        </summary>
        <ol className="muted" style={{ fontSize: 13, paddingLeft: 18 }}>
          <li>
            In <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console</a>,
            create a project and enable the <strong>Google Drive API</strong>.
          </li>
          <li>
            Configure the OAuth consent screen and <strong>publish it to “In production”</strong> (so
            sign-in stays valid for months).
          </li>
          <li>
            Create an <strong>OAuth Client ID → Web application</strong>; add this site’s URL as an
            <strong> authorized redirect URI</strong> (e.g. <code>{window.location.origin + import.meta.env.BASE_URL}</code>).
          </li>
          <li>
            Deploy the token-exchange <strong>Google Apps Script</strong> (<code>serverless/apps-script.gs</code>):
            create a script, add your Client ID + secret as Script Properties, deploy as a Web app
            (“Anyone” access), then paste its <code>/exec</code> URL above.
          </li>
          <li>Paste the Client ID above, tap Save, then Connect.</li>
          <li>
            <strong>Install this app to your home screen</strong> so it stays signed in — iOS clears
            storage from un-installed sites after about a week.
          </li>
          <li>
            On every device, sign in with the <strong>same Google account</strong> so they share one
            folder.
          </li>
        </ol>
      </details>
    </div>
  );
}
