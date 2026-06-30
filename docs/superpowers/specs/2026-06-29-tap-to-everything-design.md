# Tap-to-everything — design

Make contact and location details actionable from the detail screens: text a phone with
one tap, and get turn-by-turn directions to an address with one tap. Roadmap item
**Tap-to-everything (S)**.

## Background

Two of the four pieces named in the roadmap already ship:

- **Tap-to-call** — phones render as `tel:` buttons on Account, Contact, and Work Order
  detail (`telHref` in `src/lib/format.js`).
- **Email** — `mailto:` links exist on Account and Contact detail.

The remaining gaps:

- **SMS** — no `sms:` link exists anywhere.
- **Navigate** — no directions link exists anywhere. The Account address renders as plain
  muted text; the Work Order location renders a `LocationMap` with no "get directions"
  action. `mapsHref()` in `src/lib/maps.js` is written and tested but unused.

Contact detail has no address field, so Navigate does not apply there.

## Scope

In: add SMS links beside phones, and Navigate links for addresses, across Account / Contact
/ Work Order detail.

Out: tap-to-call and email (already done — untouched except that the phone row gains a Text
button). No new address fields. No changes to how locations are entered or geocoded.

## Helpers and building blocks

- **`smsHref(p)`** in `src/lib/format.js` — mirrors `telHref`: strip the number to
  `[\d+*#]`, return `sms:<number>`. No extension handling (you can't auto-text an
  extension). Unit-tested next to the existing `telHref` tests in `format` tests.
- **Two icons** in `src/components/Icon.jsx` (inline Lucide-style SVG paths, matching the
  existing set):
  - `message-square` — the Text/SMS action.
  - `navigation` — the directions arrow.
- **iOS detection** — a one-line check, `/iPad|iPhone|iPod/.test(navigator.userAgent)`,
  passed to `mapsHref(loc, { ios })` so iPhone opens Apple Maps and everything else opens
  Google Maps.

## Components

Two thin presentational components, to avoid duplicating markup across three pages:

- **`PhoneRow.jsx`** — props: one phone `{ label, number, ext }`. Renders the existing
  full-width ghost call button (`phone` icon + label + `fmtPhone`, href `telHref`) **plus** a
  compact icon-only Text button (`message-square` icon, href `smsHref`) docked on its right
  edge. Used by Account and Contact detail.
- **`NavigateLink.jsx`** — props: `{ text, lat, lng }`. Renders a full-width ghost button
  (`navigation` icon + address text) linking to `mapsHref({ text, lat, lng }, { ios })`.
  Renders `null` when `mapsHref` returns `null` (no location), so callers can drop it in
  unconditionally. Used by Account and Work Order detail.

Both follow the existing ghost-button styling already used for the call/email links.

## Wiring

- **AccountDetail** (`src/pages/AccountDetail.jsx`) — replace the inline phone `<a>` map with
  `PhoneRow`; replace the plain-text address line with `NavigateLink`. When there's no
  address, `NavigateLink` renders nothing — same as today, where the plain-text line is
  conditional on `account.address`.
- **ContactDetail** (`src/pages/ContactDetail.jsx`) — replace the inline phone `<a>` map with
  `PhoneRow`. No address, so no `NavigateLink`.
- **WorkOrderDetail** (`src/pages/WorkOrderDetail.jsx`) — add `NavigateLink` directly under
  the `LocationMap`, driven by the live `locationText` / `gps` state so it routes to whatever
  is currently entered (matching how `LocationMap` already consumes that state).

## Testing

- `smsHref` — unit tests in the `format` test file (digits stripped, `sms:` prefix,
  empty/missing number).
- `mapsHref` — already covered by `src/lib/maps.test.js`; no change.
- `PhoneRow` / `NavigateLink` — thin presentational wrappers; verified by running the app,
  consistent with how the codebase treats `LocationMap` and `PhoneListField` (no component
  tests for those).

## Out of scope / non-goals

- Changing the location entry / autocomplete flow.
- Adding addresses to contacts.
- Any backend, schema, or Dexie migration (everything here is presentational).
