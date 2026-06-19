# Field Service — Work Orders & Bills of Sale

A free, offline-first **PWA** for a sole-proprietor field-service operator. Log work orders
on-site, generate signed Bills of Sale (PDF with job photos), and keep a lightweight CRM
(Accounts, Contacts, service history). All data lives **on your device**; nothing is sent
to any server.

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

## Tech

Vite + React, Dexie (IndexedDB) for local storage, jsPDF for the PDF, signature_pad for
signatures, vite-plugin-pwa for offline/installability. No backend, no login, no cost.
