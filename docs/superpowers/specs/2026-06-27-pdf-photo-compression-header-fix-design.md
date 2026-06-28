# Design — PDF photo compression + Bill-of-Sale header fix

Date: 2026-06-27
Status: Approved (design)

Two independent improvements to the Bill of Sale PDF pipeline ([src/lib/pdf.js](../../../src/lib/pdf.js)).

## Item 1 — Compress photos in the generated PDF

### Problem
Job photos are stored as the raw camera file ([WorkOrderDetail.jsx:106](../../../src/pages/WorkOrderDetail.jsx#L106)) — typically 3–6 MB and ~3000–4000 px wide — and embedded in the PDF at full resolution ([pdf.js:265](../../../src/lib/pdf.js#L265)). A handful of photos pushes the PDF past the ~24 MB email-attachment limit, so the generated Bill of Sale can't be mailed.

### Approach (chosen: A — compress at PDF-generation time)
Add a reusable helper `compressForPdf(blob, { maxEdge = 1600, quality = 0.72 })` in a new `src/lib/image.js`:

- Load the blob into an `Image`.
- Draw to an offscreen `<canvas>` scaled so the long edge is at most `maxEdge` px (never upscale).
- Export the canvas as JPEG at `quality` via `canvas.toBlob(..., 'image/jpeg', quality)`.
- Return `{ blob, dataUrl, w, h }` (data URL + dimensions so `pdf.js` can place it without re-measuring).

In `generateBillPdf`, the job-photo loop ([pdf.js:255–270](../../../src/lib/pdf.js#L255-L270)) calls `compressForPdf` for each photo instead of `blobToDataURL` + `imageSize`, then `addImage` uses the compressed JPEG (`'JPEG'` format) and returned dimensions.

### Decisions / constraints
- **Originals are left untouched in IndexedDB.** Only the emailed PDF copy is compressed; on-screen zoom and photo markup keep full resolution.
- Fixed constants (`maxEdge` 1600, `quality` 0.72). No new Settings UI — YAGNI for a sole operator's typical 1–6 photos.
- Scope is **job photos only** (the size driver). The logo and signature are small and unchanged.
- On a compression failure, fall back to the original blob for that photo so PDF generation never breaks.
- Not adaptive (no measure-and-retry loop). Fixed downscale reliably keeps typical jobs well under 24 MB; the rare 30-photo case is out of scope.

### Testing
Unit test `src/lib/image.test.js` for `compressForPdf`:
- Output dimensions: long edge ≤ `maxEdge`; small images are not upscaled.
- Output blob type is `image/jpeg`.
- Output byte size is smaller than a large input.

(Uses a canvas-capable test environment; if jsdom's canvas is insufficient under vitest, gate the byte-size assertion behind a capability check and keep the dimension/format assertions.)

## Item 2 — Fix the Bill of Sale header overlap

### Problem
In the title/meta band ([pdf.js:86–113](../../../src/lib/pdf.js#L86-L113)), the right-aligned meta lines (`Bill #:`, `Date:`, `Service:`) are positioned with hand-tuned offsets (`y+2 / y+15 / y+28`) relative to a left-aligned title drawn at `y+8`. The reported symptom: the top meta line overlaps the line above it.

### Approach
1. **Reproduce first.** Use the existing "Preview sample Bill of Sale" button in Settings to generate the sample PDF and visually confirm the overlap and its exact cause.
2. **Rework the band** so the meta block is a self-contained, stacked right-column rendered with explicit, consistent line spacing and a guaranteed offset below the divider rule — computed from a shared top anchor rather than magic per-line offsets. The title and meta block share that anchor so their vertical relationship is deterministic regardless of business-name length or PAID marker.
3. Preserve existing behavior: optional `Bill #`, the `PAID (method)` marker below the dates, and the `line(isPaid ? 60 : 44)` advance so the following Bill To / Service columns don't collide.

### Testing
Visual: regenerate the sample-bill PDF before and after; confirm the three meta lines and the title no longer overlap and spacing is even. (Layout fix — no unit test; jsPDF output is not meaningfully assertable in unit tests.)

## Out of scope
Other backlog items in `Update the auto complete address to focu.md` (date filters, bill-# search, accessibility, navigate button, unpaid shortlist, sales-tax summary, cloud-sync surfacing, help text). Each is a separate spec/plan cycle.
