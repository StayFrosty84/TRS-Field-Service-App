# Work-order & Bill Data-Entry Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a billing reference number, work-order Unit #/Reference # (both printed on the PDF when filled), and auto-save for work orders and bills.

**Architecture:** New pure helpers (debounce, bill-content predicate, PDF text builders) are unit-tested with vitest; a shared `useAutosave` React hook drives auto-save on the two edit screens; UI wiring and PDF rendering are verified by build + manual check. New data fields are plain object properties — no Dexie migration.

**Tech Stack:** Vite + React 18, Dexie (IndexedDB), jsPDF, vitest (`environment: node`).

## Global Constraints

- **No new dependencies.** Use existing libraries only.
- **No `db.version` bump.** New fields (`workOrders.unitNumber`, `workOrders.referenceNumber`, `billsOfSale.paymentReference`) are non-indexed object properties; backup/restore exports whole records, so they carry over automatically.
- **Test environment is `environment: node`** (see `vitest.config.js`) with a `localStorage` + `fake-indexeddb` shim in `vitest.setup.js`. There is **no React Testing Library / jsdom** — so React components and jsPDF rendering are NOT unit-tested. Put all testable logic in pure `src/lib/*.js` modules (mirroring `salesTax.js`, `maps.js`); verify UI/PDF tasks with `npm run build` + the manual steps given.
- **Money/format:** reuse `money`, `fmtDate`, `toDateInput`, `fromDateInput`, `computeTotals` from `src/lib/format.js`. Do not reimplement.
- **Billing Reference # (on the bill) and work-order Reference # are DISTINCT fields.**
- **Print rule:** Unit #, work-order Reference #, and the billing Ref are printed on the PDF **only when non-blank**.
- Run the full suite with `npx vitest run` and build with `npm run build`. Commit after each task.

---

### Task 1: `debounce` utility

**Files:**
- Create: `src/lib/autosave.js`
- Test: `src/lib/autosave.test.js`

**Interfaces:**
- Produces: `debounce(fn, wait)` → a function with `.flush()` and `.cancel()`. Calls `fn` with the most recent args `wait` ms after the last call; `flush()` runs any pending call immediately; `cancel()` drops it.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './autosave.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('debounce', () => {
  it('calls fn once with the latest args after the wait', () => {
    const fn = vi.fn();
    const d = debounce(fn, 700);
    d('a');
    d('b');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(700);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });

  it('flush runs the pending call immediately', () => {
    const fn = vi.fn();
    const d = debounce(fn, 700);
    d('x');
    d.flush();
    expect(fn).toHaveBeenCalledWith('x');
    vi.advanceTimersByTime(700);
    expect(fn).toHaveBeenCalledTimes(1); // not called again
  });

  it('flush with nothing pending does nothing', () => {
    const fn = vi.fn();
    const d = debounce(fn, 700);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it('cancel drops the pending call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 700);
    d('x');
    d.cancel();
    vi.advanceTimersByTime(700);
    expect(fn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/autosave.test.js`
Expected: FAIL — cannot import `debounce` / not a function.

- [ ] **Step 3: Write minimal implementation**

```js
// Debounce: call `fn` once, `wait` ms after the last invocation, with the latest args.
// `.flush()` runs a pending call now (used on blur/unmount); `.cancel()` drops it.
export function debounce(fn, wait) {
  let timer = null;
  let pendingArgs = null;
  const debounced = (...args) => {
    pendingArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const args2 = pendingArgs;
      pendingArgs = null;
      fn(...args2);
    }, wait);
  };
  debounced.flush = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    const args = pendingArgs;
    pendingArgs = null;
    if (args) fn(...args);
  };
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  };
  return debounced;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/autosave.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/autosave.js src/lib/autosave.test.js
git commit -m "feat: add debounce utility for auto-save"
```

---

### Task 2: `useAutosave` hook

**Files:**
- Create: `src/lib/useAutosave.js`

**Interfaces:**
- Consumes: `debounce` from `src/lib/autosave.js` (Task 1).
- Produces: `useAutosave(data, save, { wait = 700, enabled = true })` → `{ status, flush }`. `data` must be JSON-serializable. `save(data)` is called (debounced) whenever `data` changes after mount and `enabled` is true. `status` is `'idle' | 'saving' | 'saved'`. `flush` forces a pending save now (wire to a container `onBlur`). Pending saves also flush on unmount.

> No unit test (React hook; project has no React test harness). Verified via the screens in Tasks 8 and 11.

- [ ] **Step 1: Create the hook**

```js
import { useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from './autosave.js';

// Auto-save `data` by calling save(data) shortly after the user stops changing it.
// Returns { status, flush } — status drives a subtle indicator; flush forces a save
// (wire it to a container onBlur so leaving a field saves immediately).
export function useAutosave(data, save, { wait = 700, enabled = true } = {}) {
  const [status, setStatus] = useState('idle');
  const saveRef = useRef(save);
  saveRef.current = save;
  const lastSaved = useRef(null);
  const initialized = useRef(false);

  const debounced = useMemo(
    () =>
      debounce(async (payload) => {
        setStatus('saving');
        await saveRef.current(payload);
        setStatus('saved');
      }, wait),
    [wait]
  );

  useEffect(() => {
    if (!enabled) return;
    const json = JSON.stringify(data);
    if (!initialized.current) {
      initialized.current = true;
      lastSaved.current = json; // don't save the values we just loaded
      return;
    }
    if (json === lastSaved.current) return;
    lastSaved.current = json;
    debounced(data);
  }, [data, enabled, debounced]);

  useEffect(() => () => debounced.flush(), [debounced]);

  return { status, flush: debounced.flush };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 3: Commit**

```bash
git add src/lib/useAutosave.js
git commit -m "feat: add useAutosave hook"
```

---

### Task 3: Bill content helpers

**Files:**
- Create: `src/lib/bill.js`
- Test: `src/lib/bill.test.js`

**Interfaces:**
- Produces:
  - `cleanLineItems(items)` → array of `{ description, qty, unitPrice }` keeping only rows with a non-empty description OR `unitPrice > 0`; trims description, coerces qty/unitPrice to numbers.
  - `billHasContent(items)` → boolean, `true` when `cleanLineItems(items).length > 0`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { cleanLineItems, billHasContent } from './bill.js';

describe('cleanLineItems', () => {
  it('drops blank rows and coerces numbers', () => {
    const rows = [
      { id: '1', description: '  Filter ', qty: '2', unitPrice: '10' },
      { id: '2', description: '', qty: '', unitPrice: '' },
      { id: '3', description: '', qty: '1', unitPrice: '5' }, // priced, no desc → kept
    ];
    expect(cleanLineItems(rows)).toEqual([
      { description: 'Filter', qty: 2, unitPrice: 10 },
      { description: '', qty: 1, unitPrice: 5 },
    ]);
  });
});

describe('billHasContent', () => {
  it('is false for only-blank rows', () => {
    expect(billHasContent([{ description: '', qty: '', unitPrice: '' }])).toBe(false);
  });
  it('is true when a described or priced row exists', () => {
    expect(billHasContent([{ description: 'Labor', qty: 1, unitPrice: 0 }])).toBe(true);
    expect(billHasContent([{ description: '', qty: 1, unitPrice: 25 }])).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/bill.test.js`
Expected: FAIL — cannot import from `bill.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// Keep only meaningful line items (a description or a price), normalized for storage.
export function cleanLineItems(items = []) {
  return items
    .filter((it) => (it.description || '').trim() || Number(it.unitPrice) > 0)
    .map(({ description, qty, unitPrice }) => ({
      description: (description || '').trim(),
      qty: Number(qty) || 0,
      unitPrice: Number(unitPrice) || 0,
    }));
}

// A bill is worth persisting once it has at least one real line item.
export function billHasContent(items = []) {
  return cleanLineItems(items).length > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/bill.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bill.js src/lib/bill.test.js
git commit -m "feat: add bill content helpers"
```

---

### Task 4: PDF text builders

**Files:**
- Create: `src/lib/pdfText.js`
- Test: `src/lib/pdfText.test.js`

**Interfaces:**
- Produces:
  - `paidLine(bill)` → the PAID string: `'PAID'`, optionally ` (method)`, optionally ` · Ref: <ref>`. Returns `null` when the bill is not paid.
  - `infoLines(workOrder)` → array of strings for the Service column: `Unit #: <x>` and `Reference #: <x>`, each present only when its value is non-blank.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { paidLine, infoLines } from './pdfText.js';

describe('paidLine', () => {
  it('returns null when unpaid', () => {
    expect(paidLine({ paymentStatus: 'unpaid' })).toBeNull();
  });
  it('PAID with method and reference', () => {
    expect(paidLine({ paymentStatus: 'paid', paymentMethod: 'Check', paymentReference: '1234' }))
      .toBe('PAID (Check) · Ref: 1234');
  });
  it('PAID with method only', () => {
    expect(paidLine({ paymentStatus: 'paid', paymentMethod: 'Cash' })).toBe('PAID (Cash)');
  });
  it('PAID with reference only', () => {
    expect(paidLine({ paymentStatus: 'paid', paymentReference: 'TXN-9' })).toBe('PAID · Ref: TXN-9');
  });
  it('bare PAID', () => {
    expect(paidLine({ paymentStatus: 'paid' })).toBe('PAID');
  });
});

describe('infoLines', () => {
  it('omits blank fields', () => {
    expect(infoLines({ unitNumber: '', referenceNumber: '  ' })).toEqual([]);
  });
  it('includes present fields', () => {
    expect(infoLines({ unitNumber: '42', referenceNumber: 'PO-7' }))
      .toEqual(['Unit #: 42', 'Reference #: PO-7']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pdfText.test.js`
Expected: FAIL — cannot import from `pdfText.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// The "PAID" marker line for the PDF, with optional method and reference. null when unpaid.
export function paidLine(bill) {
  if (bill?.paymentStatus !== 'paid') return null;
  const method = (bill.paymentMethod || '').trim();
  const ref = (bill.paymentReference || '').trim();
  return `PAID${method ? ` (${method})` : ''}${ref ? ` · Ref: ${ref}` : ''}`;
}

// Work-order Unit #/Reference # lines for the Service column — only when filled.
export function infoLines(workOrder) {
  const lines = [];
  const unit = (workOrder?.unitNumber || '').trim();
  const ref = (workOrder?.referenceNumber || '').trim();
  if (unit) lines.push(`Unit #: ${unit}`);
  if (ref) lines.push(`Reference #: ${ref}`);
  return lines;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/pdfText.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdfText.js src/lib/pdfText.test.js
git commit -m "feat: add PDF text builders for paid line and work-order info"
```

---

### Task 5: Persist `paymentReference` from quick "mark paid"

**Files:**
- Modify: `src/db/db.js:169` (`markBillPaid`)
- Test: `src/db/markBillPaid.test.js`

**Interfaces:**
- Produces: `markBillPaid(id, method, reference)` — stores `paymentStatus:'paid'`, `paymentMethod`, `paymentReference`, `paidAt`. `reference` defaults to `''`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { db, markBillPaid } from './db.js';

beforeEach(async () => {
  await db.billsOfSale.clear();
  await db.billsOfSale.add({ id: 'b1', workOrderId: 'w1', total: 100, paymentStatus: 'unpaid' });
});

describe('markBillPaid', () => {
  it('stores method and reference', async () => {
    await markBillPaid('b1', 'Check', '5567');
    const b = await db.billsOfSale.get('b1');
    expect(b.paymentStatus).toBe('paid');
    expect(b.paymentMethod).toBe('Check');
    expect(b.paymentReference).toBe('5567');
  });

  it('defaults reference to empty string', async () => {
    await markBillPaid('b1', 'Cash');
    const b = await db.billsOfSale.get('b1');
    expect(b.paymentReference).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/markBillPaid.test.js`
Expected: FAIL — `paymentReference` is `undefined`.

- [ ] **Step 3: Implement the change**

In `src/db/db.js`, change `markBillPaid` from:

```js
export async function markBillPaid(id, method) {
  await db.billsOfSale.update(id, { paymentStatus: 'paid', paymentMethod: method || '', paidAt: now() });
}
```

to:

```js
export async function markBillPaid(id, method, reference = '') {
  await db.billsOfSale.update(id, {
    paymentStatus: 'paid',
    paymentMethod: method || '',
    paymentReference: reference || '',
    paidAt: now(),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db/markBillPaid.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/db/db.js src/db/markBillPaid.test.js
git commit -m "feat: store payment reference when marking a bill paid"
```

---

### Task 6: Render Unit #/Reference # and Ref on the PDF

**Files:**
- Modify: `src/lib/pdf.js` (paid line ~114-122; `svc` array ~158-161)

**Interfaces:**
- Consumes: `paidLine`, `infoLines` from `src/lib/pdfText.js` (Task 4).

> No unit test (jsPDF). Verified by the sample-PDF preview.

- [ ] **Step 1: Import the builders**

At the top of `src/lib/pdf.js`, add to the imports:

```js
import { paidLine, infoLines } from './pdfText.js';
```

- [ ] **Step 2: Use `paidLine` for the PAID marker**

Replace lines ~114-122:

```js
  const isPaid = bill?.paymentStatus === 'paid';
  if (isPaid) {
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(21, 128, 61);
    doc.text(`PAID${bill.paymentMethod ? ` (${bill.paymentMethod})` : ''}`, right, metaY + 2, {
      align: 'right',
    });
    metaY += 18;
    doc.setTextColor(0);
  }
```

with:

```js
  const paid = paidLine(bill);
  if (paid) {
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(21, 128, 61);
    doc.text(paid, right, metaY + 2, { align: 'right' });
    metaY += 18;
    doc.setTextColor(0);
  }
```

- [ ] **Step 3: Add work-order info lines to the Service column**

Replace the `svc` array (~158-161):

```js
  const svc = [
    workOrder?.location?.text ? `Location: ${workOrder.location.text}` : null,
    workOrder?.location?.lat ? `GPS: ${workOrder.location.lat.toFixed(5)}, ${workOrder.location.lng.toFixed(5)}` : null,
  ];
```

with:

```js
  const svc = [
    workOrder?.location?.text ? `Location: ${workOrder.location.text}` : null,
    workOrder?.location?.lat ? `GPS: ${workOrder.location.lat.toFixed(5)}, ${workOrder.location.lng.toFixed(5)}` : null,
    ...infoLines(workOrder),
  ];
```

- [ ] **Step 4: Verify build + manual sample**

Run: `npm run build` (expect success).
Manual: `npm run dev` → Settings → **Preview sample** still renders. Full PDF check happens in Task 11's manual flow (needs a paid bill with reference + a work order with Unit/Reference).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf.js
git commit -m "feat: print payment reference and work-order unit/reference on the PDF"
```

---

### Task 7: Unit #/Reference # on the New Work Order screen

**Files:**
- Modify: `src/pages/WorkOrderNew.jsx` (state ~26-33; form near the Shop button ~180-184; `createWorkOrder` call ~90-99)

> No unit test (React). Verified by build + manual.

- [ ] **Step 1: Add state**

After `const [issue, setIssue] = useState('');` (~line 29) add:

```js
  const [unitNumber, setUnitNumber] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
```

- [ ] **Step 2: Add the inputs**

Immediately after the `<LocationMap ... />` line added previously (after the Shop button row, ~line 185), insert:

```jsx
      <label>Unit #</label>
      <input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} />
      <label>Reference #</label>
      <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
```

- [ ] **Step 3: Include in the created record**

In the `createWorkOrder({ ... })` call (~90-99), add after `issue: issue.trim(),`:

```js
        unitNumber: unitNumber.trim(),
        referenceNumber: referenceNumber.trim(),
```

- [ ] **Step 4: Verify build + manual**

Run: `npm run build` (expect success).
Manual: `npm run dev` → New work order → fill Unit #/Reference # → save → reopen the work order; values persist (visible after Task 8 adds them to the detail screen, or check via DevTools → IndexedDB → `workOrders`).

- [ ] **Step 5: Commit**

```bash
git add src/pages/WorkOrderNew.jsx
git commit -m "feat: capture unit # and reference # on new work order"
```

---

### Task 8: Auto-save + Unit #/Reference # on Work Order Detail

**Files:**
- Modify: `src/pages/WorkOrderDetail.jsx` (imports; state ~31-37; load effect ~53-67; `saveEdits` ~73-82; render ~159-178)

**Interfaces:**
- Consumes: `useAutosave` from `src/lib/useAutosave.js` (Task 2).

> No unit test (React). Verified by build + manual.

- [ ] **Step 1: Import the hook**

Add near the other imports:

```js
import { useAutosave } from '../lib/useAutosave.js';
```

- [ ] **Step 2: Add Unit/Reference state**

After `const [isEstimate, setIsEstimate] = useState(false);` (~line 36) add:

```js
  const [unitNumber, setUnitNumber] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
```

- [ ] **Step 3: Load the new fields**

In the load effect, after `setIsEstimate(Boolean(data.order.isEstimate));` (~line 64) add:

```js
      setUnitNumber(data.order.unitNumber || '');
      setReferenceNumber(data.order.referenceNumber || '');
```

- [ ] **Step 4: Replace `saveEdits` (manual) with an auto-save payload + hook**

Replace the `saveEdits` function (~73-82):

```js
  async function saveEdits() {
    await updateWorkOrder(id, {
      issue: issue.trim(),
      notes: notes.trim(),
      location: { text: locationText.trim(), ...(gps || {}) },
      serviceDate: fromDateInput(serviceDate) || order.serviceDate,
      isEstimate,
    });
    toast('Saved');
  }
```

with:

```js
  const autosaveData = {
    issue,
    notes,
    locationText,
    gps,
    serviceDate,
    isEstimate,
    unitNumber,
    referenceNumber,
  };
  const { status: saveStatus, flush: flushSave } = useAutosave(
    autosaveData,
    (d) =>
      updateWorkOrder(id, {
        issue: d.issue.trim(),
        notes: d.notes.trim(),
        location: { text: d.locationText.trim(), ...(d.gps || {}) },
        serviceDate: fromDateInput(d.serviceDate) || order.serviceDate,
        isEstimate: d.isEstimate,
        unitNumber: d.unitNumber.trim(),
        referenceNumber: d.referenceNumber.trim(),
      }),
    { enabled: loaded }
  );
```

> Note: hooks must run before any early `return null`. The early returns are at ~69-70 (`if (!data) return null;`). Move this `useAutosave` block ABOVE those returns? No — it depends on `order`. Instead, guard inside the save callback is unnecessary because `enabled: loaded` is false until loaded. Keep the block where `saveEdits` was (after the early returns); `useAutosave` is then called unconditionally on every render that reaches it, which is fine because the early returns happen before any hooks were added below them. **Verify:** there are no hooks after line 70 currently except this one; React's rules are satisfied as long as this hook is always reached once data is present. To be safe, the early `return null` at line 69 happens before this hook — that WOULD violate rules-of-hooks. **Therefore:** move the two early returns' bodies to not skip hooks — see Step 5.

- [ ] **Step 5: Keep hook order legal**

Ensure `useAutosave` is not skipped by an early return. Change the early returns (~69-70) so the component still calls `useAutosave` every render. Simplest correct approach: compute a safe `order` fallback and call the hook before returning. Replace:

```js
  if (!data) return null;
  if (data.missing) return <p className="muted">Work order not found.</p>;
  const { order, account, contact, photos, bill } = data;
```

with:

```js
  const order = data?.order;
  const account = data?.account;
  const contact = data?.contact;
  const photos = data?.photos || [];
  const bill = data?.bill;
```

Then place the `useAutosave` block (from Step 4) immediately after these consts. AFTER the hook, add the guarded renders:

```js
  if (!data) return null;
  if (data.missing) return <p className="muted">Work order not found.</p>;
```

In the save callback, replace `order.serviceDate` with `order?.serviceDate` to tolerate the brief pre-load render.

- [ ] **Step 6: Replace the "Save changes" button with a status indicator and wrap fields for blur-flush**

Replace (~176-178):

```jsx
      <button className="btn btn--ghost btn--sm" onClick={saveEdits} style={{ marginTop: 8 }}>
        Save changes
      </button>
```

with:

```jsx
      <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
        {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved ✓' : 'Changes save automatically'}
      </p>
```

Wrap the editable fields so leaving any field flushes the save. Change the `<label>Location</label>` line (~147) to be preceded by an opening wrapper, and close it after the new Unit/Reference inputs. Concretely, insert before `<label>Location</label>`:

```jsx
      <div onBlur={flushSave}>
```

and after the Reference # input added in Step 7, insert `</div>`.

- [ ] **Step 7: Add the Unit/Reference inputs**

After `<label>Internal notes</label>` + its `<textarea ... />` (~174-175), and before the status indicator from Step 6, add:

```jsx
      <label>Unit #</label>
      <input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} />
      <label>Reference #</label>
      <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
```

Then ensure the `</div>` closing the blur wrapper (Step 6) sits after the status indicator paragraph so all edited fields are inside it.

- [ ] **Step 8: Verify build + manual**

Run: `npm run build` (expect success).
Manual: `npm run dev` → open a work order → edit issue/notes/Unit/Reference → indicator shows "Saving…" then "Saved ✓"; navigate away and back → values persisted. No "Save changes" button remains. Check the browser console for React "rules of hooks" / key warnings (expect none).

- [ ] **Step 9: Commit**

```bash
git add src/pages/WorkOrderDetail.jsx
git commit -m "feat: auto-save work order detail with unit/reference fields"
```

---

### Task 9: Reference # on quick mark-paid + Generate-PDF guard

**Files:**
- Modify: `src/pages/WorkOrderDetail.jsx` (mark-paid block ~241-252; bill card "Edit bill" button ~267-273)

**Interfaces:**
- Consumes: `markBillPaid(id, method, reference)` from Task 5.

> No unit test (React). Verified by build + manual.

- [ ] **Step 1: Add a reference state for the quick mark-paid**

After `const [payMethod, setPayMethod] = useState('Cash');` (~line 38) add:

```js
  const [payReference, setPayReference] = useState('');
```

- [ ] **Step 2: Add the reference input and pass it to `markBillPaid`**

Replace the mark-paid row (~241-252):

```jsx
              <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={{ flex: 1 }}>
                  <option>Cash</option>
                  <option>Check</option>
                  <option>Card</option>
                  <option>Zelle</option>
                  <option>Other</option>
                </select>
                <button className="btn btn--sm" onClick={() => markBillPaid(bill.id, payMethod)}>
                  <Icon name="check" /> Mark paid
                </button>
              </div>
```

with:

```jsx
              <div style={{ marginTop: 10 }}>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={{ flex: 1 }}>
                    <option>Cash</option>
                    <option>Check</option>
                    <option>Card</option>
                    <option>Zelle</option>
                    <option>Other</option>
                  </select>
                  <button className="btn btn--sm" onClick={() => markBillPaid(bill.id, payMethod, payReference.trim())}>
                    <Icon name="check" /> Mark paid
                  </button>
                </div>
                <input
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  placeholder="Reference # (optional)"
                  style={{ marginTop: 8 }}
                />
              </div>
```

- [ ] **Step 3: Label the bill button "Generate PDF" when there's no PDF yet**

Replace the "Edit bill" button (~267-273):

```jsx
          <button
            className="btn btn--ghost"
            style={{ marginTop: 10 }}
            onClick={() => navigate(`/work-orders/${id}/bill`)}
          >
            <Icon name="pencil" /> Edit bill
          </button>
```

with:

```jsx
          <button
            className={bill.pdfBlob ? 'btn btn--ghost' : 'btn'}
            style={{ marginTop: 10 }}
            onClick={() => navigate(`/work-orders/${id}/bill`)}
          >
            <Icon name={bill.pdfBlob ? 'pencil' : 'file-text'} /> {bill.pdfBlob ? 'Edit bill' : 'Generate PDF'}
          </button>
```

- [ ] **Step 4: Verify build + manual**

Run: `npm run build` (expect success).
Manual: on an unpaid bill, enter a reference, Mark paid → badge shows paid; reopen → method/reference stored (verify via Task 11 PDF, or DevTools IndexedDB `billsOfSale.paymentReference`). For a draft bill with no PDF (created in Task 11), the button reads **Generate PDF**.

- [ ] **Step 5: Commit**

```bash
git add src/pages/WorkOrderDetail.jsx
git commit -m "feat: capture reference on quick mark-paid; show Generate PDF for draft bills"
```

---

### Task 10: Billing Reference # field in the Bill editor

**Files:**
- Modify: `src/pages/BillEditor.jsx` (state ~37-38; load ~61-62; payment UI ~381-390; `billRecord` ~130-145)

> No unit test (React). Verified by build + manual.

- [ ] **Step 1: Add state**

After `const [paymentMethod, setPaymentMethod] = useState('');` (~line 38) add:

```js
  const [paymentReference, setPaymentReference] = useState('');
```

- [ ] **Step 2: Load existing value**

After `setPaymentMethod(bill.paymentMethod || '');` (~line 62) add:

```js
        setPaymentReference(bill.paymentReference || '');
```

- [ ] **Step 3: Add the input (shown when Paid)**

Replace the paid-method block (~381-390):

```jsx
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
```

with:

```jsx
          {paymentStatus === 'paid' && (
            <>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="">Payment method…</option>
                <option>Cash</option>
                <option>Check</option>
                <option>Card</option>
                <option>Zelle</option>
                <option>Other</option>
              </select>
              <label>Reference #</label>
              <input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Check #, transaction ID, etc."
              />
            </>
          )}
```

- [ ] **Step 4: Persist it in `billRecord`**

In `generate()`, in the `billRecord` object (~140-141), after the `paymentMethod` line add:

```js
        paymentReference: features.billing && paymentStatus === 'paid' ? paymentReference.trim() : '',
```

- [ ] **Step 5: Verify build + manual**

Run: `npm run build` (expect success).
Manual: `npm run dev` → open a bill → mark Paid → Reference # field appears → enter a value → Generate → reopen bill; value persists; PDF shows `PAID (method) · Ref: …` (full check in Task 11).

- [ ] **Step 6: Commit**

```bash
git add src/pages/BillEditor.jsx
git commit -m "feat: add billing reference field to bill editor"
```

---

### Task 11: Auto-save bills (first-save on content) + stale-PDF hint

**Files:**
- Modify: `src/pages/BillEditor.jsx` (imports; add autosave; stale hint in the edit step)

**Interfaces:**
- Consumes: `useAutosave` (Task 2), `cleanLineItems` + `billHasContent` (Task 3), `saveBill` + `getBillForWorkOrder` (existing in `db.js`), `computeTotals` (existing).

> No unit test (React). Verified by build + manual.

- [ ] **Step 1: Imports**

Add to imports in `src/pages/BillEditor.jsx`:

```js
import { useAutosave } from '../lib/useAutosave.js';
import { cleanLineItems, billHasContent } from '../lib/bill.js';
```

And refactor the existing inline `cleanItems` (~92-98) to reuse the helper:

```js
  const cleanItems = cleanLineItems(items);
```

- [ ] **Step 2: Track whether a saved bill exists and whether its PDF is stale**

After the `ctx` state and other state, add:

```js
  const [billId, setBillId] = useState(null);
  const [pdfStale, setPdfStale] = useState(false);
```

In the load effect, inside `if (bill) { ... }` (~55), add:

```js
        setBillId(bill.id);
```

- [ ] **Step 3: Add the auto-save hook (edit step only, once there's content)**

Place this AFTER `const totals = ...` and `const cleanItems = ...` (so they're in scope), and BEFORE the early `if (!ctx) return null;`? No — `ctx` guard is at ~87, before those consts. Hooks must not be after an early return. So add this hook BEFORE the `if (!ctx) return null;` line, using optional chaining for ctx-derived values. Insert right after the two `useEffect`s (~85), before `if (!ctx) return null;`:

```js
  const ccOnLive = features.cardFee && ccFeeApplied;
  const liveClean = cleanLineItems(items);
  const autosaveData = {
    items: liveClean,
    taxRate,
    ccFeeApplied: ccOnLive,
    ccFeeRate,
    billDate,
    paymentStatus,
    paymentMethod,
    paymentReference,
  };
  const { status: saveStatus, flush: flushSave } = useAutosave(
    autosaveData,
    async (d) => {
      const { subtotal, taxAmount, ccFeeAmount, total } = computeTotals(
        d.items,
        d.taxRate,
        d.ccFeeRate,
        d.ccFeeApplied
      );
      const record = {
        lineItems: d.items,
        taxRate: Number(d.taxRate) || 0,
        subtotal,
        taxAmount,
        ccFeeApplied: d.ccFeeApplied,
        ccFeeRate: d.ccFeeApplied ? Number(d.ccFeeRate) || 0 : 0,
        ccFeeAmount,
        total,
        billDate: fromDateInput(d.billDate) || Date.now(),
        paymentStatus: features.billing ? d.paymentStatus : 'unpaid',
        paymentMethod: features.billing && d.paymentStatus === 'paid' ? d.paymentMethod : '',
        paymentReference: features.billing && d.paymentStatus === 'paid' ? d.paymentReference.trim() : '',
      };
      await saveBill(id, record);
      const saved = await getBillForWorkOrder(id);
      if (saved) {
        setBillId(saved.id);
        if (saved.pdfGeneratedAt) setPdfStale(true); // data changed after a PDF existed
      }
    },
    { enabled: step === 'edit' && billHasContent(items) }
  );
```

> `saveBill` partial-updates an existing record (Dexie `update` merges), so omitting `pdfBlob`/`signatureBlob`/`pdfGeneratedAt` here preserves them; for a brand-new bill it creates the row and assigns the bill number.

- [ ] **Step 4: Reset the stale flag after Generate**

In `generate()`, after `const saved = await getBillForWorkOrder(id);` (~148), add:

```js
      setPdfStale(false);
```

- [ ] **Step 5: Show the status + stale hint in the edit step**

In the edit-step JSX, just above the `<div className="btn-row">` that holds "Review & sign" (~394), add:

```jsx
      <p className="muted" style={{ fontSize: 13 }}>
        {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved ✓' : 'Changes save automatically once you add a line item'}
      </p>
      {pdfStale && (
        <p className="muted" style={{ fontSize: 13, color: 'var(--badge-open-fg)' }}>
          PDF out of date — regenerate to update.
        </p>
      )}
```

Wrap the edit-step fields in a blur-flush container: find the edit-step return wrapper and add `onBlur={flushSave}` to its outermost element (the `<>`/fragment can't take props, so add it to the existing top-level `<div>` of the edit step, or wrap the line-items + totals + payment section in `<div onBlur={flushSave}>`). Verify by reading the edit-step JSX root element and attaching `onBlur` there.

- [ ] **Step 6: Verify build + manual (full end-to-end)**

Run: `npm run build` (expect success). Run `npx vitest run` (full suite green).
Manual (`npm run dev`):
1. New work order with Unit #/Reference # → save.
2. Generate Bill of Sale → add a line item → "Saved ✓" appears; go back to the work order → bill card shows total and **Generate PDF** (no PDF yet); dashboard shows the bill.
3. Reopen bill → mark Paid → method + Reference # → "Saved ✓".
4. Review & sign → Generate → PDF shows `PAID (method) · Ref: …` and, in Service Details, `Unit #:` / `Reference #:` (blank ones omitted).
5. Reopen the generated bill → change a line → "PDF out of date — regenerate to update." appears → Generate clears it.

- [ ] **Step 7: Commit**

```bash
git add src/pages/BillEditor.jsx
git commit -m "feat: auto-save bills once they have content; flag stale PDF"
```

---

## Self-Review

**Spec coverage:**
- Billing reference # → Tasks 4 (PDF text), 5 (quick mark-paid), 10 (bill editor field), 6 (PDF render). ✓
- Work-order Unit #/Reference # → Tasks 7 (new), 8 (detail), 4+6 (PDF). ✓
- Auto-save work orders → Task 8. ✓
- Auto-save bills (first-save on content, drafts allowed, stale hint, Generate-PDF guard) → Tasks 11 + 9. ✓
- No migration / fields carried by backup → Global Constraints; fields are plain properties. ✓
- Print only when filled → `paidLine`/`infoLines` (Task 4), tested. ✓

**Placeholder scan:** No TBD/TODO; all code steps include code. ✓

**Type consistency:** `markBillPaid(id, method, reference)` (Task 5) matches its call site (Task 9). `useAutosave(data, save, opts) → { status, flush }` (Task 2) matches usage (Tasks 8, 11). `cleanLineItems`/`billHasContent` (Task 3) match usage (Task 11). `paidLine`/`infoLines` (Task 4) match usage (Task 6). ✓

**Rules-of-hooks risk:** Tasks 8 and 11 explicitly place `useAutosave` before early returns — re-verify in the editor while implementing (read the file's current early-return positions first).
