# PDF Photo Compression + Bill-of-Sale Header Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compress job photos when generating the Bill of Sale PDF so it stays under the ~24 MB email limit, and fix the overlapping lines in the PDF's title/meta header band.

**Architecture:** A new pure helper `fitDimensions` (unit-tested) plus a browser-only `compressForPdf` (canvas downscale → JPEG) in `src/lib/image.js`. `generateBillPdf` calls `compressForPdf` per job photo with a fallback to the original blob. The header band in `src/lib/pdf.js` is reworked so the title and right-aligned meta block share a single top anchor with explicit spacing.

**Tech Stack:** Vite + React, jsPDF, Vitest (node environment), browser Canvas API.

## Global Constraints

- Test environment is `node` (no `Image`/`canvas`); unit tests must target pure JS only. See [vitest.config.js](../../../vitest.config.js).
- Test files match `src/**/*.test.js`.
- No new npm dependencies.
- Photo originals in IndexedDB must remain untouched — only the PDF copy is compressed.
- Compression constants: `maxEdge = 1600` px, `quality = 0.72`, output `image/jpeg`.
- Commit messages end with the repo's existing co-author trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: `fitDimensions` + `compressForPdf` image helpers

**Files:**
- Create: `src/lib/image.js`
- Test: `src/lib/image.test.js`

**Interfaces:**
- Produces:
  - `fitDimensions(w: number, h: number, maxEdge: number) => { w: number, h: number, scale: number }` — clamps the longer edge to `maxEdge`, never upscales, rounds to integers.
  - `compressForPdf(blob: Blob, opts?: { maxEdge?: number, quality?: number }) => Promise<{ dataUrl: string, w: number, h: number } | null>` — browser-only; resolves `null` on load failure so callers can fall back.

- [ ] **Step 1: Write the failing test**

Create `src/lib/image.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { fitDimensions } from './image.js';

describe('fitDimensions', () => {
  it('scales the long edge (landscape) down to maxEdge', () => {
    expect(fitDimensions(4000, 3000, 1600)).toEqual({ w: 1600, h: 1200, scale: 0.4 });
  });

  it('scales the long edge (portrait) down to maxEdge', () => {
    expect(fitDimensions(3000, 4000, 1600)).toEqual({ w: 1200, h: 1600, scale: 0.4 });
  });

  it('never upscales images already within maxEdge', () => {
    expect(fitDimensions(800, 600, 1600)).toEqual({ w: 800, h: 600, scale: 1 });
  });

  it('rounds fractional dimensions to integers', () => {
    const out = fitDimensions(1000, 333, 500);
    expect(out.w).toBe(500);
    expect(out.h).toBe(167); // 333 * 0.5 = 166.5 -> 167
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/image.test.js`
Expected: FAIL — `Failed to resolve import "./image.js"` / `fitDimensions is not a function`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/image.js`:

```js
// Image helpers for the Bill of Sale PDF. `fitDimensions` is pure (unit-tested);
// `compressForPdf` is browser-only (canvas) and verified via the sample PDF.

// Clamp the longer edge to `maxEdge`, preserving aspect ratio. Never upscales.
export function fitDimensions(w, h, maxEdge) {
  const longEdge = Math.max(w, h);
  if (longEdge <= maxEdge) return { w: Math.round(w), h: Math.round(h), scale: 1 };
  const scale = maxEdge / longEdge;
  return { w: Math.round(w * scale), h: Math.round(h * scale), scale };
}

// Downscale + JPEG-recompress a photo blob for embedding in the PDF.
// Resolves null if the image can't be decoded so the caller can fall back to the original.
export function compressForPdf(blob, { maxEdge = 1600, quality = 0.72 } = {}) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const { w, h } = fitDimensions(img.naturalWidth, img.naturalHeight, maxEdge);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), w, h });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/image.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/image.js src/lib/image.test.js
git commit -m "feat: add image helpers for PDF photo compression

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Use `compressForPdf` in the PDF photo loop

**Files:**
- Modify: `src/lib/pdf.js` (import; photo loop at [lines 248–271](../../../src/lib/pdf.js#L248-L271))

**Interfaces:**
- Consumes: `compressForPdf` from Task 1.

- [ ] **Step 1: Add the import**

At the top of `src/lib/pdf.js`, below the existing `import { money, ... } from './format.js';` line, add:

```js
import { compressForPdf } from './image.js';
```

- [ ] **Step 2: Replace the photo loop body**

Replace the existing `for (const pb of photoBlobs) { ... }` block (currently [lines 255–270](../../../src/lib/pdf.js#L255-L270)) with:

```js
    for (const pb of photoBlobs) {
      try {
        const compressed = await compressForPdf(pb);
        let url, w, h, fmt;
        if (compressed) {
          ({ dataUrl: url, w, h } = compressed);
          fmt = 'JPEG';
        } else {
          // Fall back to the original blob if compression failed.
          url = await blobToDataURL(pb);
          ({ w, h } = await imageSize(url));
          fmt = fmtForJsPDF(pb.type);
        }
        const dispW = Math.min(maxW, 360);
        const dispH = (h / w) * dispW;
        if (y + dispH > PH - M) {
          doc.addPage();
          y = M;
        }
        doc.addImage(url, fmt, M, y, dispW, dispH);
        y += dispH + 14;
      } catch {
        /* skip bad image */
      }
    }
```

- [ ] **Step 3: Verify existing tests still pass**

Run: `npx vitest run`
Expected: PASS — all existing suites green (no test imports `pdf.js`; this confirms nothing regressed).

- [ ] **Step 4: Verify compression visually**

Run `npm run dev`, open the app in the browser (device mode). On a work order with at least 2 photos taken from a phone camera, generate the Bill of Sale PDF.
Expected: PDF opens with the job photos visibly intact; the saved/downloaded PDF file size is a few MB at most (well under 24 MB), not tens of MB.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf.js
git commit -m "feat: compress job photos when generating the Bill of Sale PDF

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Fix the title/meta header overlap

**Files:**
- Modify: `src/lib/pdf.js` (title + meta band at [lines 86–113](../../../src/lib/pdf.js#L86-L113))

**Interfaces:** none (self-contained layout change).

- [ ] **Step 1: Reproduce the bug**

Run `npm run dev`, open the app, go to **Settings → Preview sample** (this generates the sample Bill of Sale PDF using the current profile — see [Settings.jsx:99–115](../../../src/pages/Settings.jsx#L99-L115)).
Expected: observe the top meta line (`Bill #: …`) overlapping the divider rule / line above it. Note the exact overlap so you can confirm it's gone after the fix.

- [ ] **Step 2: Replace the title + meta band**

Replace the block from the `// ---- Title ----` comment through the `line(isPaid ? 60 : 44);` line (currently [lines 86–113](../../../src/lib/pdf.js#L86-L113)) with:

```js
  // ---- Title + meta band ----
  line(22);
  doc.setDrawColor(220).line(M, y, right, y);
  line(18); // clearance below the divider so the first meta line never rides up against it
  const bandTop = y;

  const isEstimate = Boolean(workOrder?.isEstimate);
  doc.setFont('helvetica', 'bold').setFontSize(isEstimate ? 26 : 20);
  if (isEstimate) doc.setTextColor(202, 138, 4); // amber so it reads as a quote, not a bill
  doc.text(isEstimate ? 'ESTIMATE' : 'BILL OF SALE', M, bandTop + 8);
  doc.setTextColor(0);

  // Right-aligned meta block: stacked lines from a shared top anchor with even spacing.
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(90);
  const META_LH = 13;
  const metaLines = [];
  if (bill?.billNumber) metaLines.push(`Bill #: ${bill.billNumber}`);
  metaLines.push(`Date: ${fmtDate(bill?.billDate || bill?.pdfGeneratedAt || Date.now())}`);
  metaLines.push(`Service: ${fmtDate(workOrder?.serviceDate)}`);
  let metaY = bandTop + 2;
  metaLines.forEach((t) => {
    doc.text(t, right, metaY, { align: 'right' });
    metaY += META_LH;
  });
  doc.setTextColor(0);

  // PAID marker, below the dates so it never collides with the meta lines or "Bill To".
  const isPaid = bill?.paymentStatus === 'paid';
  if (isPaid) {
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(21, 128, 61);
    doc.text(`PAID${bill.paymentMethod ? ` (${bill.paymentMethod})` : ''}`, right, metaY + 2, {
      align: 'right',
    });
    metaY += 18;
    doc.setTextColor(0);
  }

  // Continue below whichever column is taller: the title or the meta block.
  y = Math.max(bandTop + 8, metaY - META_LH);
  line(20);
```

- [ ] **Step 3: Verify the fix visually**

Run `npm run dev`, repeat **Settings → Preview sample**.
Expected: the `Bill #`, `Date`, and `Service` lines are evenly spaced, sit clearly below the divider, and do not overlap the divider or the title. Confirm the `Bill To` / `Service Details` columns below still start with a clean gap (no collision). Re-check with a paid bill if available, or temporarily set `paymentStatus: 'paid'` in the sample to confirm the PAID marker still renders below the dates.

- [ ] **Step 4: Verify existing tests still pass**

Run: `npx vitest run`
Expected: PASS — all suites green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf.js
git commit -m "fix: even spacing in Bill of Sale title/meta header band

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Item 1 (compress photos, Option A, originals untouched, helper in `src/lib/image.js`, unit test) → Tasks 1 & 2. Unit test covers the pure `fitDimensions`; the canvas path is verified visually (Task 2 Step 4) — an honest adaptation since the node test env has no canvas, consistent with the spec's hedge.
- Item 2 (reproduce, then rework the band with a shared anchor and explicit spacing, preserve Bill #/PAID/advance) → Task 3.
- Out-of-scope backlog items → untouched.

**Placeholder scan:** none — all code and commands are concrete.

**Type consistency:** `compressForPdf` returns `{ dataUrl, w, h } | null`; Task 2 destructures `dataUrl`/`w`/`h` and handles `null`. `fitDimensions` returns `{ w, h, scale }`; tests assert that shape. `META_LH` and `bandTop` are defined before use within Task 3.
