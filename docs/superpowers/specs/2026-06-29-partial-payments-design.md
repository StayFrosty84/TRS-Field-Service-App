# Design: Partial payments + balance due

Date: 2026-06-29

> Autonomous draft. There was no interactive user; every point that would normally be a
> clarifying question is recorded under **Open design questions** with a recommended default,
> and the rest of the spec is written against those defaults.

## Context

Roadmap **(L)** item (`docs/ROADMAP.md`):

> **Partial payments + balance due** — record `payments[]` against a bill (amount + method +
> date + reference / check #); "paid" derives when balance hits zero; hide a blank reference
> on the PDF. Extends `markBillPaid` in `db.js`. **Subsumes the "billing reference number" note.**

Today a bill carries a single payment: `paymentStatus` (`'paid'`/`'unpaid'`), `paymentMethod`,
`paymentReference`, `paidAt`. That cannot represent a deposit-plus-balance or two checks against
one invoice. This feature replaces the single payment with a list of payments and **derives**
paid/unpaid plus a running balance from that list.

The "billing reference #" feature from the 2026-06-28 spec already shipped (`paymentReference`
on the bill, printed as `· Ref: <x>` via `paidLine()`). Partial payments subsumes it: the
reference now lives on each payment entry, and `paidLine()` is replaced by a payments summary.

### Files in scope (explored read-only)

- `src/db/db.js` — `markBillPaid(id, method, reference)`, `markBillUnpaid(id)`, `saveBill`,
  the schemaless `billsOfSale` store.
- `src/pages/WorkOrderDetail.jsx` (~256–294) — the quick mark-paid flow (method `<select>` +
  optional Reference # input + "Mark paid" / "Mark unpaid").
- `src/lib/unpaid.js` + `src/lib/unpaid.test.js` — `unpaidBills()`, filters `paymentStatus !== 'paid'`
  and sums `b.total`.
- `src/pages/Home.jsx` (~26–35, ~91) — computes `outstanding` by summing `b.total` for non-paid
  bills, and renders the `unpaidBills()` list.
- `src/lib/pdfText.js` + `src/lib/pdfText.test.js` — `paidLine(bill)`.
- `src/lib/pdf.js` (~104–121) — renders the meta band and the `paidLine` PAID marker.

## Data model

`billsOfSale` is schemaless in Dexie and backup/restore exports whole records, so this is a new
field plus a derive-on-read convention — **no `db.version` bump, no `.upgrade()` migration**.

**New field**

- `payments`: `Array<Payment>` where
  `Payment = { id, amount: number, method: string, date: number (epoch ms), reference: string }`.
  `id` is a `uid()` so entries can be removed by identity; `reference` may be `''`.

**Derived, not stored** (computed by `src/lib/payments.js`, see below):

- `amountPaid` = sum of `payments[].amount`
- `balance` = `bill.total - amountPaid` (clamped at 0 floor for display; see Open Q4 on overpay)
- derived status: `paid` when `balance <= 0` **and** `total > 0`; else `unpaid` (also
  surfaced as `partial` in the UI when `0 < amountPaid < total`).

**Retired / legacy fields** — `paymentStatus`, `paymentMethod`, `paymentReference`, `paidAt`.
These are **not deleted from existing records**; they are read only by the compatibility shim
during normalization (below). New writes stop setting them. `paymentStatus` is kept written in
sync (mirrored) for one transition window — see Backward compatibility.

## Core logic — `src/lib/payments.js` (new, pure, unit-tested)

A single pure module is the source of truth so the DB layer, dashboards, PDF, and the
per-account rollup all derive identically. Mirrors the existing pure-helper pattern
(`bill.js`, `unpaid.js`, `pdfText.js`).

```
normalizePayments(bill) -> Payment[]
  // Back-compat shim. If bill.payments is a non-empty array, return it.
  // Else if the legacy bill is paymentStatus==='paid', synthesize a single payment:
  //   [{ id, amount: bill.total||0, method: bill.paymentMethod||'',
  //      date: bill.paidAt||bill.billDate||bill.createdAt, reference: bill.paymentReference||'' }]
  // Else return [].

amountPaid(bill) -> number          // sum of normalizePayments(bill) amounts
billBalance(bill) -> number         // (bill.total||0) - amountPaid(bill)
isPaid(bill) -> boolean             // (bill.total||0) > 0 && billBalance(bill) <= 0
paymentState(bill) -> 'paid'|'partial'|'unpaid'
```

`isPaid` returns the derived status used everywhere a `paymentStatus === 'paid'` check exists
today. The `total > 0` guard prevents a $0 bill (or a draft with no line items) from reading as
"paid" off an empty payments list.

## DB layer — `src/db/db.js`

Replace the single-payment mutators with payment-list operations. Each call recomputes and
**mirrors** the derived status into the stored `paymentStatus` field so the existing
`paymentStatus` index (`db.version(2)`) and any not-yet-migrated reader stay correct during the
transition.

```js
export async function addBillPayment(id, payment) {
  // payment: { amount, method, date?, reference? }
  const bill = await db.billsOfSale.get(id);
  const payments = [...normalizePayments(bill), {
    id: uid(),
    amount: Number(payment.amount) || 0,
    method: payment.method || '',
    date: payment.date || now(),
    reference: (payment.reference || '').trim(),
  }];
  await writePayments(id, payments);
}

export async function removeBillPayment(id, paymentId) {
  const bill = await db.billsOfSale.get(id);
  const payments = normalizePayments(bill).filter((p) => p.id !== paymentId);
  await writePayments(id, payments);
}

// shared: persist list + mirror derived status for index/back-compat
async function writePayments(id, payments) {
  const bill = await db.billsOfSale.get(id);
  const derivedPaid = isPaid({ ...bill, payments });
  await db.billsOfSale.update(id, {
    payments,
    paymentStatus: derivedPaid ? 'paid' : 'unpaid', // mirror for the v2 index
    paidAt: derivedPaid ? now() : null,
    updatedAt: now(),
  });
}
```

`markBillPaid` / `markBillUnpaid` are **kept as thin wrappers** so callers and tests don't break
in one commit:

- `markBillPaid(id, method, reference)` → if the bill is not already fully paid, add one payment
  for the **outstanding balance** with that method/reference (a one-tap "paid in full"). This
  preserves the quick-pay UX.
- `markBillUnpaid(id)` → clear `payments` to `[]` and mirror `paymentStatus: 'unpaid'`.

## Backward compatibility

- **Existing single-payment bills** (have `paymentStatus`/`paymentMethod`/`paymentReference`,
  no `payments[]`): `normalizePayments()` synthesizes one Payment on read, so balance/status/PDF
  are correct with zero migration. The first time such a bill is edited through
  `add/removeBillPayment`, the synthesized payment is materialized into a real `payments[]`.
- **`paymentStatus` mirror:** kept written by `writePayments` so the `db.version(2)`
  `paymentStatus` index and any reader still using `b.paymentStatus !== 'paid'` keep working
  until they are migrated to `isPaid()`. This is the safety net that lets us migrate readers
  incrementally rather than in one big-bang commit.
- **Backup/restore & Drive sync:** `payments[]` is a plain JSON-serializable array on the record,
  so it is exported/imported and LWW-synced automatically (it lives under the row's `updatedAt`).
  No change to `backup.js` or sync.
- **No `db.version` bump.** Adding an index on a derived value isn't possible; we keep relying on
  the mirrored `paymentStatus` index for the unpaid filter.

## UI — `src/pages/WorkOrderDetail.jsx` bill card

Replace the single method-select + reference + "Mark paid" block (~268–294) with a payments
panel. Behavior, top to bottom:

1. **Balance line:** `Total $X · Paid $Y · Balance $Z`, with a badge: `paid` (green) when
   balance ≤ 0, `partial` (amber) when `0 < paid < total`, `unpaid` otherwise. Reuses the
   existing `badge--paid` / `badge--unpaid` classes; add a `badge--partial` style.
2. **Payments list:** each recorded payment as a row — `amount · method · date` and the
   reference when present — with a small remove (trash) control. Removing recomputes
   balance/status immediately (already-instant action, like today's mark-paid).
3. **Add payment:** an amount input (defaulting to the current outstanding balance so
   "paid in full" stays one tap), the existing method `<select>`
   (Cash/Check/Card/Zelle/Other), an optional Reference # input, and an "Add payment" button →
   `addBillPayment(bill.id, …)`. A blank reference is allowed.
4. The old standalone "Mark paid" / "Mark unpaid" buttons are removed; "paid in full" is just
   adding a payment for the full balance. (Keep a subtle "Clear payments" affordance for the
   correct-a-mistake case → `markBillUnpaid`.)

This stays consistent with the screen's auto-save model: payment add/remove writes straight to
the record (no Save button), matching how mark-paid already works.

> The full Bill editor (`src/pages/BillEditor.jsx`) is **out of scope** for this draft beyond
> deriving its status badge from `isPaid()` instead of `paymentStatus`. See Open Q3.

## PDF — `src/lib/pdfText.js` + `src/lib/pdf.js`

Replace `paidLine(bill)` (single PAID marker) with a payments summary builder, keeping the
"hide a blank reference" requirement.

```js
// src/lib/pdfText.js
// Returns the lines to print in the payments/PAID area, or [] when nothing is paid.
export function paymentLines(bill) {
  const payments = normalizePayments(bill);
  if (payments.length === 0) return [];
  const lines = payments.map((p) => {
    const ref = (p.reference || '').trim();
    return `${money(p.amount)} (${p.method || 'payment'})`
         + `${ref ? ` · Ref: ${ref}` : ''}`           // ← blank reference omitted
         + ` · ${fmtDate(p.date)}`;
  });
  const bal = billBalance(bill);
  lines.push(bal <= 0 ? 'PAID IN FULL' : `Balance due: ${money(bal)}`);
  return lines;
}
```

- **Blank reference is hidden** by the `ref ? … : ''` guard, exactly as the current `paidLine`
  does for the single-payment case (`src/lib/pdfText.test.js` already covers reference-present
  vs reference-absent; extend those tests to the per-payment form).
- `src/lib/pdf.js` (~115–121): the block that prints the single green `paidLine` becomes a small
  right-aligned stack rendering each `paymentLines(bill)` entry, advancing `metaY` per line so it
  still sits below the date meta and above "Bill To" without collision. The final
  "PAID IN FULL" / "Balance due" line keeps the bold green (paid) or a neutral/amber treatment
  (balance due) — see Open Q5 for color.
- Keep `paidLine` exported as a deprecated thin alias for one release if anything else imports it
  (grep shows only `pdf.js` and the test do today, so it can likely be deleted outright).

## Cross-feature impact — Per-account outstanding rollup (in flight)

Another roadmap **(S)** item, *Per-account outstanding rollup*, is in flight: "on Account detail,
total unpaid across the account's bills + last paid date — reuse `unpaid.js` scoped to one
account." That feature and the dashboard's existing `outstanding` stat both derive "outstanding"
the **old way**: `paymentStatus !== 'paid'` ⇒ count the **entire** `bill.total`. Once partial
payments lands, that is wrong — a bill with a deposit would either count its full total
(overstating what's owed) or drop to zero the moment it's marked paid (no partial state).

**Exactly what must change once partial payments lands** (call-outs for the rollup author):

1. **Outstanding is per-bill `billBalance(bill)`, not `bill.total`.** Anywhere outstanding is
   summed — `src/pages/Home.jsx` (~29, `outstanding += b.total`) and the new account rollup
   helper — must sum `billBalance(bill)` from `src/lib/payments.js`, not the full total of
   non-paid bills.
2. **The "is this bill outstanding?" predicate becomes `!isPaid(bill)`** (equivalently
   `billBalance(bill) > 0`), replacing `b.paymentStatus !== 'paid'`. With the mirrored
   `paymentStatus` the old predicate keeps *compiling*, but it will misclassify partials, so it
   must be migrated.
3. **`unpaid.js` `unpaidBills()` must change two lines:** the filter
   `b.paymentStatus !== 'paid'` → `(b) => !isPaid(b)`, and the row's `total: b.total` →
   `balance: billBalance(b)` (rename or add; the dashboard/rollup display the **balance**, not the
   gross total). `unpaid.test.js` fixtures must add `payments[]` cases (partial → appears with its
   balance; fully paid via payments → excluded).
4. **"Last paid" date** for the rollup is `max(payments[].date)` via `normalizePayments`, not the
   legacy `paidAt` (which is only the mirror and is null for partials).

**Recommended sequencing:** land `src/lib/payments.js` (this spec) **first** and have the rollup
build on `billBalance`/`isPaid` from day one, so the rollup never ships the soon-wrong
`total`-based math. If the rollup ships first, it must be revised per points 1–4 above the moment
partial payments merges. This spec's `unpaid.js` changes (point 3) are the shared seam both
features touch — coordinate that single edit.

## Testing / verification

- **Unit tests** (vitest, `environment: node`, mirroring existing pure-logic suites):
  - `src/lib/payments.test.js`: `normalizePayments` legacy synthesis (paid single-payment bill →
    one payment; unpaid → []; modern `payments[]` passthrough); `amountPaid`/`billBalance` sums;
    `isPaid` true only when `total>0 && balance<=0`; `$0` bill is not "paid"; `paymentState`
    returns paid/partial/unpaid at the boundaries.
  - `src/lib/pdfText.test.js`: extend for `paymentLines` — blank reference omitted, present
    reference shown, multi-payment list, "Balance due" vs "PAID IN FULL" trailer.
  - `src/lib/unpaid.test.js`: partial bill appears with its **balance**; bill fully paid via
    `payments[]` excluded; legacy `paymentStatus:'paid'` still excluded.
- **Full suite + build:** `npx vitest run` green; `npm run build` succeeds.
- **Manual** (`npm run dev`, device mode):
  1. Open a bill, add a partial payment (< total) → badge shows `partial`, balance line correct,
     payment row lists amount/method/date.
  2. Add a second payment covering the rest → badge flips to `paid`, balance $0.
  3. Remove a payment → balance/status recompute live.
  4. Add a payment with a blank reference and one with a check # → Generate PDF: blank-ref line
     has no `Ref:`, the other prints `Ref: <#>`; trailer shows PAID IN FULL or Balance due.
  5. Open a **pre-existing** paid bill (single legacy payment, no `payments[]`) → still reads paid,
     PDF still shows the payment; editing it materializes a real `payments[]`.
  6. Home dashboard "Outstanding" reflects **balances** (a partial bill contributes its remaining
     balance, not its full total).

## Out of scope

- Editing an existing payment in place (use remove + re-add).
- Full `BillEditor.jsx` payments management UI beyond reading derived status (Open Q3).
- Removing the legacy `paymentStatus`/`paymentMethod`/`paymentReference` fields from stored
  records or dropping the `paymentStatus` index (kept as the back-compat mirror).
- Refunds / negative payments and currencies other than the app's single implicit currency.
- Payment-due reminders / aging beyond the existing `ageDays` display.

## Open design questions (recommended defaults)

1. **Where does "Add payment" live — quick card only, or full bill editor too?**
   *Default:* implement on the WorkOrderDetail bill card now (replaces today's quick mark-paid);
   add to `BillEditor.jsx` later. Rationale: the existing quick-pay flow is the one being
   subsumed; keeps this change surgical.

2. **Keep `markBillPaid`/`markBillUnpaid` as wrappers, or hard-replace them?**
   *Default:* keep them as thin wrappers over `addBillPayment` (full-balance) / clear-payments.
   Rationale: avoids breaking callers/tests in one commit and preserves one-tap "paid in full".

3. **Migrate every `paymentStatus === 'paid'` reader now, or rely on the mirror?**
   *Default:* migrate the **dashboards/rollup** readers (`Home.jsx`, `unpaid.js`, account rollup)
   to `isPaid()`/`billBalance()` because partials make them wrong; leave incidental readers on the
   mirrored `paymentStatus` for now. Rationale: targets exactly the code partial payments breaks.

4. **Overpayment (amountPaid > total) — allow it?**
   *Default:* allow recording it (don't block the input), clamp **displayed/summed balance** at
   `max(0, …)` so dashboards never go negative, and treat the bill as `paid`. Rationale: matches
   real check-rounding/tip cases without a refund concept; keep it simple.

5. **PDF "Balance due" line color/treatment.**
   *Default:* PAID IN FULL stays bold green (current paid color `21,128,61`); "Balance due"
   prints in the neutral meta gray (`90`) bold, not red, to avoid alarming the customer on a
   normal deposit invoice. Rationale: least visually disruptive; revisit if a stronger dunning
   tone is wanted.

6. **Payment date entry — pick a date, or stamp "now"?**
   *Default:* stamp `now()` on add, no date picker in this iteration (a payment is recorded when
   received). Rationale: matches the current one-tap flow; a back-dated-payment picker is a later
   nicety.

7. **`partial` badge styling.**
   *Default:* add a `badge--partial` amber style alongside `badge--paid`/`badge--unpaid`.
   Rationale: a distinct partial state is the whole point of the feature; reuse the estimate amber
   already used in the PDF (`202,138,4`).
