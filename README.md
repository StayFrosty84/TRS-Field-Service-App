# Field Service — Work Orders & Bills of Sale

A free, offline-first **PWA** for a sole-proprietor field-service operator. Log work orders
on-site, generate signed Bills of Sale (PDF with job photos), and keep a lightweight CRM
(Accounts, Contacts, service history). All data lives **on your device** by default; nothing is
sent to any server unless you turn on optional [Google Drive sync](#cloud-sync-google-drive--share-data-across-phones)
to share data across phones.

## What it does

- **Work orders** — capture account, on-site contact, breakdown location (with optional
  GPS), the issue, and job photos in under a minute.
- **Bill of Sale** — itemized line items + optional tax, on-screen customer signature, and
  a generated **PDF** with your business header and the job photos.
- **Share** — hand the PDF to your phone's native share sheet (pick Mail); the app shows
  the customer / contact / your-BCC addresses to paste in.
- **CRM** — Accounts and Contacts with full service history.
- **Backup** — one button exports everything (incl. photos & signatures) to a single file
  you save to Google Drive / iCloud; Restore re-imports it on any device.

## Run locally

```bash
npm install
npm run icons   # generates PWA icons from public/icons/favicon.svg (run once)
npm run dev     # open the printed URL; use device mode in DevTools to emulate a phone
```

## Deploy to GitHub Pages (install once on your phone)

1. Create a new GitHub repo and push **this folder's contents** as the repo root.
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main`. The included workflow (`.github/workflows/deploy.yml`) builds and
   deploys automatically. It sets the app's base path to `/<repo-name>/` for you.
4. Open `https://<your-username>.github.io/<repo-name>/` on your phone →
   **Share → Add to Home Screen**. After the first load it works fully offline.

## Cloud sync (Google Drive) — share data across phones

Sync lets a field tech and an office admin (or any number of phones) see **one shared dataset**.
There's still no server: the app talks directly to **your Google Drive**, which holds a small
sync file per device plus the job photos. Changes flow automatically while the app is open and
online, and the Drive copy doubles as a backup. Data merges with **last-writer-wins** — different
records never collide; if two people edit the *same* record, the later save wins (coordinate by
phone for the rare overlap).

**One-time setup (~10 min):**

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and **enable the
   Google Drive API**.
2. Configure the **OAuth consent screen** and **publish it to "In production."** (Left in
   "Testing," logins expire every 7 days. The app only uses the non-sensitive `drive.file` scope,
   so production needs no security review.)
3. Create an **OAuth Client ID → Web application**. Under *Authorized JavaScript origins* add your
   site URL (e.g. `https://<user>.github.io`) and `http://localhost` for local dev.
4. In the app: **Settings → Cloud sync → paste the Client ID → Connect Google Drive**.
5. On every device, sign in with the **same Google account** so they share one folder
   (`Field Service Sync`). Under `drive.file`, an app only sees files it created, so one shared
   account is the simplest way to share.

You can also bake the Client ID into a build with a `VITE_GOOGLE_CLIENT_ID` env var instead of
pasting it.

**Limits:** a PWA can't sync while **fully closed** (strongest on iPhone) — opening the app syncs
immediately. On iPhone/Safari, token renewal isn't always silent, so you may get an occasional
one-tap "Reconnect." Android/Chrome stays connected after the first sign-in.

## Tech

Vite + React, Dexie (IndexedDB) for local storage, jsPDF for the PDF, signature_pad for
signatures, vite-plugin-pwa for offline/installability. Optional Google Drive sync (browser OAuth,
`drive.file` scope) shares data across devices — otherwise no backend, no login, no cost.
