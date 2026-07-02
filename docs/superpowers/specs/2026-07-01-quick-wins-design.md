---
date: 2026-07-01
topic: quick-wins-wave
---

# Quick wins wave — requirements

## Summary

Three independent S-sized improvements from the roadmap: promote the account and
contact names to the visual anchors of the work-order detail screen, add a one-tap
duplicate control to bill line items, and add an editable share-message template
(with placeholders) used when sending a bill or estimate via the share sheet.

## Requirements

**Enlarge names on WO detail**

- R1. On the work-order detail screen, the account name reads as the primary
  identifier at a glance, with the contact name a step below it in prominence.
- R2. Both names remain tappable links to their detail screens.

**Duplicate line item**

- R3. Each bill line row offers a one-tap control that inserts a copy of that row
  directly below it.
- R4. The copy is independent — editing it never mutates the original row.

**Custom share/email message template**

- R5. Sharing a bill or estimate PDF includes a default message so the receiving
  app (Mail, Messages) pre-fills the body text.
- R6. The template is editable in Settings and supports placeholders that resolve
  per document: account name, document number, total, business name, and document
  type (bill vs. estimate).
- R7. Unresolvable placeholders (missing data, unknown token) degrade gracefully
  rather than leaking raw braces where data exists to avoid it.
- R8. A sensible default template ships so the feature works before any
  customization; clearing the Settings value restores the default.

## Key Decisions

- **One template for bills and estimates** — the document-type placeholder adapts
  the wording instead of maintaining two templates.
- **Two override levels** — the default lives in Settings; the filled-in text
  stays editable in the receiving app before sending, via the native share sheet.

## Scope Boundaries

- No per-account templates.
- Non-document shares (backups, CSV reports) keep their current behavior.
- No rich text or email-subject control — the share sheet's `text` field only.
