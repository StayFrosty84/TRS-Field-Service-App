# Work Types, Payment-on-Work-Order, Photo Markup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add work-type line-item templates, move payment tracking onto the work order (retire the Billing tab), and add red box/arrow/circle photo markup — all in the existing offline PWA.

**Architecture:** Additive on the existing Dexie + React + jsPDF app. Work types are a new Dexie store (v3) whose template items snapshot onto a work order and pre-fill the bill editor. Payment status already lives on the bill record; we surface `markBillPaid`/`markBillUnpaid` on the work-order detail and the Work list and delete the Billing tab. Photo markup is a hand-rolled `<canvas>` editor that flattens shapes onto the photo blob in place.

**Tech Stack:** Vite + React (plain JSX), Dexie.js (IndexedDB), dexie-react-hooks `useLiveQuery`, jsPDF (lazy chunk), the inline-SVG `Icon` component, Playwright (smoke test in `/tmp/fs-smoke`).

## Global Constraints

- No TypeScript; plain JSX matching surrounding style.
- No new runtime dependencies (photo markup is hand-rolled canvas).
- New UI uses `<Icon name="…" />` (`src/components/Icon.jsx`), never emoji.
- Keep jsPDF in its own lazy chunk (dynamic `import('../lib/pdf.js')`); never static-import it into the main bundle.
- Payment UI is gated by `useFeatures().billing` (internal key stays `featBilling`).
- Estimates/Quotes are OUT OF SCOPE — do not build them.
- Verification per task = `npm run build` succeeds + smoke test passes (`cd /tmp/fs-smoke && node smoke.mjs`). Dev server runs at http://localhost:5173/.
- Commit after each task. Do NOT `git push` / deploy until the user asks.

---

## Phase 1 — Payment on the work order; remove Billing tab

### Task 1: Retire the Billing tab and rename the toggle

**Files:**
- Modify: `src/components/Layout.jsx` (remove billing tab entry + billing filter)
- Modify: `src/App.jsx` (remove `Billing` import + `/billing` route)
- Modify: `src/pages/Home.jsx` (Unpaid button → `/work` with filter state)
- Modify: `src/pages/Settings.jsx` (rename toggle label/hint)
- Delete: `src/pages/Billing.jsx`

**Interfaces:**
- Produces: Work list will read `location.state?.filter === 'unpaid'` (Task 2).

- [ ] **Step 1: Layout.jsx** — remove the `{ to: '/billing', … }` object from `ALL_TABS`, and simplify the `tabs` filter so it only drops Home when `!features.dashboard`:

```jsx
const tabs = ALL_TABS.filter((t) => !(t.to === '/' && !features.dashboard));
```

- [ ] **Step 2: App.jsx** — delete `import Billing from './pages/Billing.jsx';` and the `<Route path="billing" element={<Billing />} />` line.

- [ ] **Step 3: Home.jsx** — change the Unpaid quick action's handler from `navigate('/billing')` to:

```jsx
onClick={() => navigate('/work', { state: { filter: 'unpaid' } })}
```

- [ ] **Step 4: Settings.jsx** — replace the `featBilling` ToggleRow label/hint:

```jsx
<ToggleRow
  label="Payment tracking"
  hint="Track Paid/Unpaid on bills and work orders."
  checked={features.billing}
  onChange={(v) => toggleFeature('featBilling', v)}
/>
```

- [ ] **Step 5: Delete Billing.jsx**

```bash
git rm src/pages/Billing.jsx
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: success, no "Billing" import errors.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Remove Billing tab; rename payment-tracking toggle"
```

---

### Task 2: Payment status + Unpaid filter on the Work list

**Files:**
- Modify: `src/pages/Work.jsx`
- Modify: `/tmp/fs-smoke/smoke.mjs`

**Interfaces:**
- Consumes: `markBillPaid(billId, method)` from `db.js` (exists).
- Consumes: `location.state?.filter` from Task 1.

- [ ] **Step 1: Work.jsx** — load bills and (when `features.billing`) render payment. Full updated component:

```jsx
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, markBillPaid } from '../db/db.js';
import { fmtDate, money } from '../lib/format.js';
import { useFeatures } from '../lib/useFeatures.js';
import SearchBar from '../components/SearchBar.jsx';
import Icon from '../components/Icon.jsx';

export default function Work() {
  const navigate = useNavigate();
  const location = useLocation();
  const features = useFeatures();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(location.state?.filter || 'all'); // all | open | completed | unpaid

  const data = useLiveQuery(async () => {
    const orders = await db.workOrders.orderBy('createdAt').reverse().toArray();
    const accounts = Object.fromEntries((await db.accounts.toArray()).map((a) => [a.id, a]));
    const bills = await db.billsOfSale.toArray();
    const billByWo = Object.fromEntries(bills.map((b) => [b.workOrderId, b]));
    return { orders, accounts, billByWo };
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.orders.filter((o) => {
      const bill = data.billByWo[o.id];
      if (filter === 'open' || filter === 'completed') {
        if (o.status !== filter) return false;
      } else if (filter === 'unpaid') {
        if (!bill || bill.paymentStatus === 'paid') return false;
      }
      if (!q) return true;
      const acct = data.accounts[o.accountId]?.name || '';
      return (
        acct.toLowerCase().includes(q) ||
        (o.issue || '').toLowerCase().includes(q) ||
        (o.location?.text || '').toLowerCase().includes(q)
      );
    });
  }, [data, query, filter]);

  if (!data) return null;
  const { orders, accounts, billByWo } = data;
  const showPay = features.billing;
  const chips = [['all', 'All'], ['open', 'Open'], ['completed', 'Completed']];
  if (showPay) chips.push(['unpaid', 'Unpaid']);

  return (
    <>
      <h1 style={{ marginTop: 4 }}>Work Orders</h1>

      {orders.length === 0 && (
        <div className="empty">
          <span className="ico"><Icon name="wrench" size={40} /></span>
          No work orders yet.
          <br />
          Tap ＋ to log your first job.
        </div>
      )}

      {orders.length > 0 && (
        <>
          <SearchBar value={query} onChange={setQuery} placeholder="Search jobs, customers, locations…" />
          <div className="chips">
            {chips.map(([val, label]) => (
              <button key={val} className={`chip ${filter === val ? 'chip--active' : ''}`} onClick={() => setFilter(val)}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {orders.length > 0 && filtered.length === 0 && (
        <p className="muted" style={{ textAlign: 'center', padding: '24px 0' }}>No matches.</p>
      )}

      <div className="list">
        {filtered.map((o) => (
          <OrderRow key={o.id} order={o} account={accounts[o.accountId]} bill={billByWo[o.id]} showPay={showPay} />
        ))}
      </div>

      <button className="fab" onClick={() => navigate('/work-orders/new')} aria-label="New work order">
        <Icon name="plus" size={28} />
      </button>
    </>
  );
}

function OrderRow({ order, account, bill, showPay }) {
  const paid = bill?.paymentStatus === 'paid';
  async function quickPay(e) {
    e.preventDefault();
    e.stopPropagation();
    if (bill) await markBillPaid(bill.id, '');
  }
  return (
    <Link className="list-item" to={`/work-orders/${order.id}`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="list-item__title">{account?.name || 'Unknown account'}</p>
        <span className={`badge badge--${order.status}`}>{order.status}</span>
      </div>
      <p className="list-item__sub">
        {order.issue ? order.issue.slice(0, 80) : 'No issue noted'} · {fmtDate(order.serviceDate)}
      </p>
      {showPay && bill && (
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 6, alignItems: 'center' }}>
          <span className={`badge badge--${paid ? 'paid' : 'unpaid'}`}>
            {paid ? 'paid' : 'unpaid'} · {money(bill.total || 0)}
          </span>
          {!paid && (
            <button className="btn btn--ghost btn--sm" onClick={quickPay}>
              <Icon name="check" /> Mark paid
            </button>
          )}
        </div>
      )}
    </Link>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Add smoke assertion** — in `/tmp/fs-smoke/smoke.mjs`, the section that currently navigates to the Billing tab must change (the tab is gone). Replace the `// --- Billing tab ---` block with a Work-list payment check. After the bill is generated and the test is on the dashboard/work area, add:

```js
  // --- Work list shows payment + quick mark-paid (replaces Billing tab) ---
  await page.click('nav a:has-text("Work")');
  await page.waitForSelector('h1:has-text("Work Orders")');
  if ((await page.locator('nav a:has-text("Billing")').count()) !== 0) throw new Error('Billing tab should be gone');
  await page.click('.chip:has-text("Unpaid")');
  log('work list has Unpaid filter; no Billing tab');
```

Also delete the later block that did `await page.click('nav a:has-text("Billing")')` and the feature-toggle test that disabled the Billing tab (lines around "billing tab visible after disabling") — replace that final toggle assertion with a check that the **Payment tracking** label exists in Settings:

```js
  // --- Settings: payment-tracking toggle renamed ---
  await page.click('nav a:has-text("Settings")');
  await page.waitForSelector('text=Payment tracking');
  log('payment-tracking toggle present');
```

- [ ] **Step 4: Run smoke**

Run: `cd /tmp/fs-smoke && node smoke.mjs`
Expected: `✅ SMOKE TEST PASSED`, no console errors.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Work list: payment badge, quick mark-paid, Unpaid filter"
```

---

### Task 3: Mark paid / unpaid on the Work Order detail

**Files:**
- Modify: `src/pages/WorkOrderDetail.jsx`
- Modify: `/tmp/fs-smoke/smoke.mjs`

**Interfaces:**
- Consumes: `markBillPaid(id, method)`, `markBillUnpaid(id)` from `db.js` (exist).

- [ ] **Step 1: WorkOrderDetail.jsx imports** — add `markBillPaid, markBillUnpaid` to the `db.js` import and `Icon`:

```jsx
import { db, updateWorkOrder, deleteWorkOrder, createWorkOrder, addPhoto, deletePhoto, getBillForWorkOrder, markBillPaid, markBillUnpaid } from '../db/db.js';
import Icon from '../components/Icon.jsx';
```

- [ ] **Step 2: Add payment state + handler** near the other component state:

```jsx
  const [payMethod, setPayMethod] = useState('Cash');
```

- [ ] **Step 3: Replace the paid/unpaid badge block inside the Bill card** (the `features.billing && (<span className="badge …">)` section) with the badge **plus** controls:

```jsx
            {features.billing && (
              <span className={`badge badge--${bill.paymentStatus === 'paid' ? 'paid' : 'unpaid'}`}>
                {bill.paymentStatus === 'paid'
                  ? `paid${bill.paymentMethod ? ` · ${bill.paymentMethod}` : ''}`
                  : 'unpaid'}
              </span>
            )}
```

Then, still inside the bill `card`, after the View/Share buttons, add the payment controls:

```jsx
          {features.billing && (
            bill.paymentStatus === 'paid' ? (
              <button className="btn btn--ghost btn--sm" style={{ marginTop: 10 }} onClick={() => markBillUnpaid(bill.id)}>
                <Icon name="rotate-ccw" /> Mark unpaid
              </button>
            ) : (
              <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={{ flex: 1 }}>
                  <option>Cash</option>
                  <option>Check</option>
                  <option>Card</option>
                  <option>Other</option>
                </select>
                <button className="btn btn--sm" onClick={() => markBillPaid(bill.id, payMethod)}>
                  <Icon name="check" /> Mark paid
                </button>
              </div>
            )
          )}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Smoke** — after generating the bill (still on the WO detail or after navigating back to it), add:

```js
  // --- Mark paid from the work-order detail ---
  await page.locator('.list-item:has(.badge--completed)').first().click();
  await page.waitForSelector('h1:has-text("Work Order")');
  await page.getByRole('button', { name: /Mark paid/ }).click();
  await page.waitForSelector('.badge--paid');
  log('marked paid from work-order detail');
```

(Place this before the duplicate/2nd-bill block, and adjust navigation so the test is on the Work list first.)

- [ ] **Step 6: Run smoke**

Run: `cd /tmp/fs-smoke && node smoke.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Work order detail: mark paid/unpaid with method"
```

---

## Phase 2 — Work types with line-item templates

### Task 4: DB store, helpers, seed, backup

**Files:**
- Modify: `src/db/db.js`
- Modify: `src/main.jsx`
- Modify: `src/lib/backup.js`
- Modify: `/tmp/fs-smoke/smoke.mjs`

**Interfaces:**
- Produces: `listWorkTypes()`, `createWorkType(data)`, `updateWorkType(id, data)`, `deleteWorkType(id)`, `ensureSeedWorkTypes()`. Work type shape: `{ id, name, icon, items: [{description, qty, unitPrice}], createdAt }`.

- [ ] **Step 1: db.js schema** — after the `db.version(2)` block add:

```js
// v3: work-type line-item templates.
db.version(3).stores({
  workTypes: 'id, name, createdAt',
});
```

- [ ] **Step 2: db.js helpers + seed** — append:

```js
// ---- Work types -------------------------------------------------------------
export const DEFAULT_WORK_TYPES = [
  { name: 'Service Call', icon: 'wrench', items: [{ description: 'Service call / trip fee', qty: 1, unitPrice: 65 }] },
  { name: 'Diagnostic', icon: 'search', items: [{ description: 'Diagnostic fee', qty: 1, unitPrice: 95 }] },
  { name: 'Tire Job', icon: 'wrench', items: [
    { description: 'Tire mount & balance', qty: 4, unitPrice: 25 },
    { description: 'Shop supplies', qty: 1, unitPrice: 10 },
  ] },
];

export async function listWorkTypes() {
  return db.workTypes.orderBy('createdAt').toArray();
}

export async function createWorkType(data) {
  const id = uid();
  await db.workTypes.add({ id, createdAt: now(), icon: 'wrench', items: [], ...data });
  return id;
}

export async function updateWorkType(id, data) {
  await db.workTypes.update(id, data);
}

export async function deleteWorkType(id) {
  await db.workTypes.delete(id);
}

// Seed starter work types exactly once (flag on the profile so deleting them all won't re-add).
export async function ensureSeedWorkTypes() {
  const profile = await db.businessProfile.get(PROFILE_ID);
  if (profile?.workTypesSeeded) return;
  if ((await db.workTypes.count()) === 0) {
    await db.workTypes.bulkAdd(DEFAULT_WORK_TYPES.map((w) => ({ id: uid(), createdAt: now(), ...w })));
  }
  await saveProfile({ workTypesSeeded: true });
}

export async function updatePhoto(id, blob) {
  await db.photos.update(id, { blob, annotatedAt: now() });
}
```

(`updatePhoto` is added here so Phase 3 doesn't re-touch this file.)

- [ ] **Step 3: main.jsx** — import and call the seed on boot. Add near the other imports and before/after `initTheme()`:

```jsx
import { ensureSeedWorkTypes } from './db/db.js';
ensureSeedWorkTypes();
```

- [ ] **Step 4: backup.js** — add `'workTypes'` to the `TABLES` array.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Smoke** — after the backup-download block that parses `bundle`, assert seed:

```js
  if (!bundle.data.workTypes || bundle.data.workTypes.length < 3) throw new Error('work types not seeded into backup');
  log('work types seeded:', bundle.data.workTypes.map((w) => w.name).join(', '));
```

- [ ] **Step 7: Run smoke**

Run: `cd /tmp/fs-smoke && node smoke.mjs`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "Add work types store, helpers, seed, backup; updatePhoto helper"
```

---

### Task 5: Work types manager in Settings

**Files:**
- Create: `src/components/WorkTypeManager.jsx`
- Modify: `src/pages/Settings.jsx`

**Interfaces:**
- Consumes: `listWorkTypes`, `createWorkType`, `updateWorkType`, `deleteWorkType`.

- [ ] **Step 1: Create WorkTypeManager.jsx**

```jsx
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listWorkTypes, createWorkType, updateWorkType, deleteWorkType } from '../db/db.js';
import { money } from '../lib/format.js';
import Icon from './Icon.jsx';

const blankItem = () => ({ description: '', qty: 1, unitPrice: '' });

export default function WorkTypeManager() {
  const types = useLiveQuery(listWorkTypes) || [];
  const [editing, setEditing] = useState(null); // id | 'new' | null
  const [name, setName] = useState('');
  const [items, setItems] = useState([blankItem()]);

  function startNew() {
    setEditing('new');
    setName('');
    setItems([blankItem()]);
  }
  function startEdit(t) {
    setEditing(t.id);
    setName(t.name);
    setItems(t.items?.length ? t.items.map((i) => ({ ...i })) : [blankItem()]);
  }
  function cancel() {
    setEditing(null);
  }
  const setItem = (i, k, v) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const addRow = () => setItems((arr) => [...arr, blankItem()]);
  const removeRow = (i) => setItems((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr));

  async function save() {
    const clean = items
      .filter((it) => it.description.trim() || Number(it.unitPrice) > 0)
      .map((it) => ({ description: it.description.trim(), qty: Number(it.qty) || 1, unitPrice: Number(it.unitPrice) || 0 }));
    const data = { name: name.trim() || 'Untitled', items: clean };
    if (editing === 'new') await createWorkType(data);
    else await updateWorkType(editing, data);
    setEditing(null);
  }

  return (
    <div className="card">
      {types.length === 0 && <p className="muted" style={{ marginTop: 0 }}>No work types yet.</p>}
      <div className="list">
        {types.map((t) => (
          <div key={t.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span><Icon name={t.icon || 'wrench'} /> {t.name} <span className="muted">· {t.items?.length || 0} item(s)</span></span>
            <span className="row" style={{ gap: 6 }}>
              <button className="btn btn--ghost btn--sm" onClick={() => startEdit(t)}><Icon name="pencil" /></button>
              <button className="btn btn--ghost btn--sm" onClick={() => confirm(`Delete ${t.name}?`) && deleteWorkType(t.id)}><Icon name="trash-2" /></button>
            </span>
          </div>
        ))}
      </div>

      {editing && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <label>Work type name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tire Job" />
          <div className="section-title" style={{ marginTop: 12 }}>Template line items</div>
          {items.map((it, i) => (
            <div key={i} className="row" style={{ gap: 6, marginBottom: 6 }}>
              <input style={{ flex: 2 }} placeholder="Description" value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} />
              <input style={{ width: 56 }} type="number" inputMode="decimal" min="0" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} aria-label="Qty" />
              <input style={{ width: 80 }} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} aria-label="Unit price" />
              <button className="btn btn--ghost btn--sm" onClick={() => removeRow(i)}><Icon name="x" /></button>
            </div>
          ))}
          <button className="btn btn--ghost btn--sm" onClick={addRow}><Icon name="plus" /> Add item</button>
          <div className="btn-row">
            <button className="btn btn--ghost" onClick={cancel}>Cancel</button>
            <button className="btn" onClick={save}>Save work type</button>
          </div>
        </div>
      )}

      {!editing && (
        <button className="btn btn--ghost" style={{ marginTop: 10 }} onClick={startNew}><Icon name="plus" /> Add work type</button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Settings.jsx** — import and mount a section (place it next to the catalog section):

```jsx
import WorkTypeManager from '../components/WorkTypeManager.jsx';
```

```jsx
      <div className="section-title">Work types</div>
      <WorkTypeManager />
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Settings: work-types manager (name + template line items)"
```

---

### Task 6: Work-type chips on New Work Order

**Files:**
- Modify: `src/pages/WorkOrderNew.jsx`

**Interfaces:**
- Consumes: `listWorkTypes`. Produces on the work order: `workTypeId`, `templateItems`.

- [ ] **Step 1: Load work types + state** — add to imports and component:

```jsx
const workTypes = useLiveQuery(listWorkTypes) || [];
const [workTypeId, setWorkTypeId] = useState('');
```

(Add `listWorkTypes` to the `db.js` import; `Icon` import too.)

- [ ] **Step 2: Persist on save** — in `createWorkOrder({...})`, add:

```jsx
        workTypeId: workTypeId || null,
        templateItems: workTypes.find((w) => w.id === workTypeId)?.items || [],
```

- [ ] **Step 3: Render chips** — above the "The issue" field, add a Work type selector:

```jsx
      <label>Work type</label>
      <div className="chips" style={{ flexWrap: 'wrap' }}>
        <button type="button" className={`chip ${!workTypeId ? 'chip--active' : ''}`} onClick={() => setWorkTypeId('')}>None</button>
        {workTypes.map((w) => (
          <button type="button" key={w.id} className={`chip ${workTypeId === w.id ? 'chip--active' : ''}`} onClick={() => setWorkTypeId(w.id)}>
            <Icon name={w.icon || 'wrench'} /> {w.name}
          </button>
        ))}
      </div>
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "New work order: work-type chips snapshot template items"
```

---

### Task 7: Show/change work type on the detail screen + bill prefill

**Files:**
- Modify: `src/pages/WorkOrderDetail.jsx`
- Modify: `src/pages/BillEditor.jsx`
- Modify: `/tmp/fs-smoke/smoke.mjs`

**Interfaces:**
- Consumes: `listWorkTypes`. Bill editor reads `order.templateItems`.

- [ ] **Step 1: WorkOrderDetail.jsx** — load work types and render a changeable chip row (changing updates `workTypeId` + `templateItems`). Add after the location/issue fields:

```jsx
      <label>Work type</label>
      <div className="chips" style={{ flexWrap: 'wrap' }}>
        <button type="button" className={`chip ${!order.workTypeId ? 'chip--active' : ''}`}
          onClick={() => updateWorkOrder(id, { workTypeId: null, templateItems: [] })}>None</button>
        {(workTypes || []).map((w) => (
          <button type="button" key={w.id} className={`chip ${order.workTypeId === w.id ? 'chip--active' : ''}`}
            onClick={() => updateWorkOrder(id, { workTypeId: w.id, templateItems: w.items || [] })}>
            <Icon name={w.icon || 'wrench'} /> {w.name}
          </button>
        ))}
      </div>
```

with `const workTypes = useLiveQuery(listWorkTypes);` and `listWorkTypes` added to the import.

- [ ] **Step 2: BillEditor.jsx prefill** — in the init effect's `else` branch (no existing bill), seed line items from the template:

```jsx
      } else {
        setCcFeeRate(defaultCcRate);
        if (profile?.taxRate) setTaxRate(String(profile.taxRate));
        if (order.templateItems?.length) {
          setItems(order.templateItems.map((li) => ({ id: crypto.randomUUID(), description: li.description, qty: li.qty ?? 1, unitPrice: li.unitPrice ?? '' })));
        }
      }
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Smoke** — when the smoke test creates its work order, pick a work type and assert prefill. After filling the issue on the New WO form add:

```js
  await page.click('.chip:has-text("Tire Job")');
```

and after opening the bill editor (before adding catalog items), assert a template row is present:

```js
  const firstTpl = await page.locator('input[placeholder="Description (part or labor)"]').first().inputValue();
  if (!firstTpl) throw new Error('work-type template did not prefill line items');
  log('work-type template prefilled:', firstTpl);
```

(Adjust later assertions that assumed an empty editor / specific first item, since a template row now leads.)

- [ ] **Step 5: Run smoke**

Run: `cd /tmp/fs-smoke && node smoke.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Work type selectable on detail; bill editor prefills template line items"
```

---

## Phase 3 — Photo markup

### Task 8: Icon additions

**Files:**
- Modify: `src/components/Icon.jsx`

**Interfaces:**
- Produces: icon names `square`, `circle`, `arrow-up-right`, `trash-2`.

- [ ] **Step 1: Add to the `ICONS` map** (Lucide-style paths):

```jsx
  square: <rect width="18" height="18" x="3" y="3" rx="2" />,
  circle: <circle cx="12" cy="12" r="10" />,
  'arrow-up-right': (
    <>
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </>
  ),
  'trash-2': (
    <>
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Icon: add square, circle, arrow-up-right, trash-2"
```

---

### Task 9: PhotoMarkup canvas editor

**Files:**
- Create: `src/components/PhotoMarkup.jsx`
- Modify: `src/styles.css` (overlay styles)

**Interfaces:**
- Produces: `<PhotoMarkup blob={Blob} onSave={(Blob)=>void} onClose={()=>void} />`.

- [ ] **Step 1: Create PhotoMarkup.jsx**

```jsx
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const RED = '#ef4444';
const MAX = 1600; // cap longest side for memory

export default function PhotoMarkup({ blob, onSave, onClose }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const shapesRef = useRef([]);
  const draftRef = useRef(null);
  const drawingRef = useRef(false);
  const [tool, setTool] = useState('box'); // box | circle | arrow
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const c = canvasRef.current;
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      imgRef.current = img;
      setReady(true);
      redraw();
      URL.revokeObjectURL(url);
    };
    img.src = url;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);

  function stroke() {
    const c = canvasRef.current;
    return Math.max(3, Math.max(c.width, c.height) / 250);
  }

  function drawShape(ctx, s) {
    ctx.strokeStyle = RED;
    ctx.lineWidth = stroke();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const { tool: t, x0, y0, x1, y1 } = s;
    if (t === 'box') {
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    } else if (t === 'circle') {
      ctx.beginPath();
      ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (t === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      const a = Math.atan2(y1 - y0, x1 - x0);
      const head = stroke() * 4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - head * Math.cos(a - Math.PI / 6), y1 - head * Math.sin(a - Math.PI / 6));
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - head * Math.cos(a + Math.PI / 6), y1 - head * Math.sin(a + Math.PI / 6));
      ctx.stroke();
    }
  }

  function redraw() {
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (imgRef.current) ctx.drawImage(imgRef.current, 0, 0, c.width, c.height);
    for (const s of shapesRef.current) drawShape(ctx, s);
    if (draftRef.current) drawShape(ctx, draftRef.current);
  }

  function toCanvas(e) {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }

  function down(e) {
    e.preventDefault();
    drawingRef.current = true;
    const p = toCanvas(e);
    draftRef.current = { tool, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  }
  function move(e) {
    if (!drawingRef.current) return;
    const p = toCanvas(e);
    draftRef.current = { ...draftRef.current, x1: p.x, y1: p.y };
    redraw();
  }
  function up() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (draftRef.current) shapesRef.current = [...shapesRef.current, draftRef.current];
    draftRef.current = null;
    redraw();
  }

  function undo() {
    shapesRef.current = shapesRef.current.slice(0, -1);
    redraw();
  }
  function clear() {
    shapesRef.current = [];
    redraw();
  }
  function save() {
    canvasRef.current.toBlob((b) => b && onSave(b), 'image/jpeg', 0.9);
  }

  return (
    <div className="markup">
      <div className="markup__bar">
        {[['box', 'square'], ['circle', 'circle'], ['arrow', 'arrow-up-right']].map(([t, ico]) => (
          <button key={t} className={`btn btn--sm ${tool === t ? '' : 'btn--ghost'}`} onClick={() => setTool(t)} aria-label={t}>
            <Icon name={ico} />
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="btn btn--ghost btn--sm" onClick={undo} aria-label="Undo"><Icon name="rotate-ccw" /></button>
        <button className="btn btn--ghost btn--sm" onClick={clear} aria-label="Clear"><Icon name="trash-2" /></button>
      </div>
      <div className="markup__stage">
        <canvas
          ref={canvasRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          style={{ touchAction: 'none', maxWidth: '100%', maxHeight: '100%' }}
        />
      </div>
      <div className="markup__bar">
        <button className="btn btn--ghost" onClick={onClose}><Icon name="x" /> Cancel</button>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={save} disabled={!ready}><Icon name="check" /> Save</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: styles.css** — append overlay styles:

```css
.markup { position: fixed; inset: 0; z-index: 50; background: #000; display: flex; flex-direction: column; }
.markup__bar { display: flex; gap: 8px; align-items: center; padding: 10px; background: var(--surface); }
.markup__stage { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 8px; }
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Add PhotoMarkup canvas editor (red box/arrow/circle)"
```

---

### Task 10: Wire markup into the Work Order detail

**Files:**
- Modify: `src/pages/WorkOrderDetail.jsx`
- Modify: `/tmp/fs-smoke/smoke.mjs`

**Interfaces:**
- Consumes: `PhotoMarkup`, `updatePhoto(id, blob)`.

- [ ] **Step 1: Imports + state**

```jsx
import PhotoMarkup from '../components/PhotoMarkup.jsx';
import { /* …existing… */ updatePhoto } from '../db/db.js';
```

```jsx
  const [markupPhoto, setMarkupPhoto] = useState(null); // { id, blob }
```

- [ ] **Step 2: Make thumbnails open the editor** — update `PhotoThumb` usage to pass an `onOpen`, and add a click handler on the image:

```jsx
        {photos.map((p) => (
          <PhotoThumb key={p.id} photo={p} onOpen={() => setMarkupPhoto(p)} onRemove={() => deletePhoto(p.id)} />
        ))}
```

In `PhotoThumb`, wrap/attach to the `<img>`: `onClick={onOpen}` and `style={{ …, cursor: 'pointer' }}`.

- [ ] **Step 3: Render the editor** — near the end of the returned JSX:

```jsx
      {markupPhoto && (
        <PhotoMarkup
          blob={markupPhoto.blob}
          onClose={() => setMarkupPhoto(null)}
          onSave={async (b) => { await updatePhoto(markupPhoto.id, b); setMarkupPhoto(null); toast('Photo updated'); }}
        />
      )}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Smoke** — add a markup pass on a WO that has a photo. After navigating to a work-order detail with a photo:

```js
  // --- Photo markup ---
  const before = await page.evaluate(async () => {
    const { db } = await import('/src/db/db.js');
    const p = (await db.photos.toArray())[0];
    return p ? p.blob.size : 0;
  });
  await page.locator('.section-title:has-text("Photos") ~ .row img, img[alt=""]').first().click();
  await page.waitForSelector('.markup');
  const cv = page.locator('.markup canvas');
  await cv.evaluate((c) => {
    const r = c.getBoundingClientRect();
    const fire = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 1, clientX: r.left + x, clientY: r.top + y }));
    fire('pointerdown', 20, 20); fire('pointermove', 120, 120); fire('pointerup', 120, 120);
  });
  await page.click('.markup button:has-text("Save")');
  await page.waitForSelector('.markup', { state: 'detached' });
  const after = await page.evaluate(async () => {
    const { db } = await import('/src/db/db.js');
    const p = (await db.photos.toArray())[0];
    return p ? p.blob.size : 0;
  });
  if (after === before) throw new Error('photo blob did not change after markup save');
  log('photo markup saved; blob changed', before, '->', after);
```

(Note: requires a work order that actually has a photo. If the main smoke flow's WO has no photo, add a photo upload step first via `page.setInputFiles` on the detail's photo `<input type="file">` with a small fixture image, or annotate within a WO created with a photo.)

- [ ] **Step 6: Run smoke**

Run: `cd /tmp/fs-smoke && node smoke.mjs`
Expected: PASS, zero console errors.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Wire photo markup into work-order detail (tap photo to annotate)"
```

---

### Task 11: Final regression + visual check

**Files:** none (verification only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: success; jsPDF still in its own `pdf-*.js` chunk.

- [ ] **Step 2: Full smoke**

Run: `cd /tmp/fs-smoke && node smoke.mjs`
Expected: `✅ SMOKE TEST PASSED`, no console/page errors.

- [ ] **Step 3: Visual PDF check** — generate a bill from a work order created with the "Tire Job" type + an annotated photo; rasterize page 1 (`sips -s format png out.pdf --out out.png`) and confirm template line items and the marked-up photo render correctly.

- [ ] **Step 4: Confirm with user before deploy.** Do not push until asked; then `git push origin main` and verify https://stayfrosty84.github.io/field-service-app/ returns 200.

---

## Self-Review

**Spec coverage:**
- Work types store/seed/helpers/backup → Task 4. Manager → Task 5. New-WO chips + snapshot → Task 6. Detail change + bill prefill → Task 7. ✓
- Remove Billing tab + rename toggle + dashboard nav → Task 1. Work-list payment + Unpaid filter → Task 2. Detail mark paid/unpaid → Task 3. ✓
- Photo markup: icons → Task 8; editor → Task 9; wiring + replace blob → Task 10. ✓
- Backup includes workTypes → Task 4. Migration (v3) → Task 4. ✓

**Placeholder scan:** Task 10 Step 5 notes a conditional (WO must have a photo) — resolved by adding a photo-upload step if the flow's WO lacks one; not a code placeholder. No TBDs elsewhere.

**Type consistency:** `markBillPaid(id, method)`, `markBillUnpaid(id)`, `updatePhoto(id, blob)`, `listWorkTypes()`, work-type shape `{id,name,icon,items:[{description,qty,unitPrice}]}`, work-order fields `workTypeId`/`templateItems`, `PhotoMarkup` props `{blob,onSave,onClose}` — consistent across tasks.
