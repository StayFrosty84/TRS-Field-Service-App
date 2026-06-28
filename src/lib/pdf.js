import { jsPDF } from 'jspdf';
import { money, fmtDate, getPhones, fmtPhone } from './format.js';
import { compressForPdf } from './image.js';
import { paidLine, infoLines } from './pdfText.js';

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

const fmtForJsPDF = (type) => (type && type.includes('png') ? 'PNG' : 'JPEG');

// Loads natural dimensions of an image data URL (to keep photo aspect ratios).
function imageSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = dataUrl;
  });
}

/**
 * Build the Bill of Sale PDF and return a Blob.
 * @param {object} data { profile, account, contact, workOrder, bill, photoBlobs[] }
 */
export async function generateBillPdf({ profile, account, contact, workOrder, bill, photoBlobs = [] }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 48;
  const right = PW - M;
  let y = M;

  const line = (h = 16) => {
    y += h;
    if (y > PH - M) {
      doc.addPage();
      y = M;
    }
  };

  // ---- Seller header ----
  // Logo is scaled to fit a fixed box (preserving aspect ratio), pinned top-right.
  const LOGO_BOX_W = 120;
  const LOGO_BOX_H = 60;
  let logoH = 0;
  if (profile?.logoBlob) {
    try {
      const url = await blobToDataURL(profile.logoBlob);
      const { w, h } = await imageSize(url);
      const scale = Math.min(LOGO_BOX_W / w, LOGO_BOX_H / h);
      const lw = w * scale;
      logoH = h * scale;
      doc.addImage(url, fmtForJsPDF(profile.logoBlob.type), right - lw, y, lw, logoH);
    } catch {
      /* ignore logo errors */
    }
  }

  // Seller text is width-limited so it never runs under the logo, and wraps cleanly.
  const textW = right - M - (logoH ? LOGO_BOX_W + 16 : 0);
  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(0);
  const nameLines = doc.splitTextToSize(profile?.businessName || 'My Business', textW);
  doc.text(nameLines, M, y + 14);
  let infoY = y + 14 + (nameLines.length - 1) * 20 + 18;

  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(90);
  const sellerLines = [
    profile?.ownerName,
    profile?.address,
    [profile?.phone, profile?.email].filter(Boolean).join('  •  '),
  ].filter(Boolean);
  sellerLines.forEach((t) => {
    const wrapped = doc.splitTextToSize(String(t), textW);
    doc.text(wrapped, M, infoY);
    infoY += wrapped.length * 13;
  });
  doc.setTextColor(0);

  // Continue below whichever is taller: the text block or the logo.
  y = Math.max(infoY - 4, y + logoH);

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
  const paid = paidLine(bill);
  if (paid) {
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(21, 128, 61);
    doc.text(paid, right, metaY + 2, { align: 'right' });
    metaY += 18;
    doc.setTextColor(0);
  }

  // Continue below whichever column is taller: the title or the meta block.
  y = Math.max(bandTop + 8, metaY - META_LH);
  line(20);

  // ---- Bill To + Service (two columns; each line wraps within its column) ----
  const colW = (right - M - 16) / 2;
  const startY = y;
  const lineH = 13;

  // Renders a heading + list of strings in a column, wrapping each entry to colW.
  // Returns the y position just past the last rendered line so the taller column
  // determines where the next section starts (long addresses no longer overlap).
  const renderColumn = (heading, items, x) => {
    doc.setTextColor(0).setFont('helvetica', 'bold').setFontSize(11).text(heading, x, startY);
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(60);
    let cy = startY + 16;
    items.filter(Boolean).forEach((t) => {
      const wrapped = doc.splitTextToSize(String(t), colW);
      doc.text(wrapped, x, cy);
      cy += wrapped.length * lineH;
    });
    doc.setTextColor(0);
    return cy;
  };

  const acctPhone = getPhones(account)[0];
  const ctctPhone = getPhones(contact)[0];
  const billTo = [
    account?.name,
    account?.address,
    acctPhone ? fmtPhone(acctPhone) : null,
    contact ? `Attn: ${contact.name}` : null,
    [ctctPhone ? fmtPhone(ctctPhone) : null, contact?.email].filter(Boolean).join('  •  ') || null,
  ];
  const svc = [
    workOrder?.location?.text ? `Location: ${workOrder.location.text}` : null,
    workOrder?.location?.lat ? `GPS: ${workOrder.location.lat.toFixed(5)}, ${workOrder.location.lng.toFixed(5)}` : null,
    ...infoLines(workOrder),
  ];

  const billToEnd = renderColumn('Bill To', billTo, M);
  const svcEnd = renderColumn('Service Details', svc, M + colW + 16);

  y = Math.max(billToEnd, svcEnd);
  line(18);

  // ---- Issue ----
  if (workOrder?.issue) {
    doc.setFont('helvetica', 'bold').setFontSize(11).text('Reported Issue', M, y);
    line(15);
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(60);
    const wrapped = doc.splitTextToSize(workOrder.issue, right - M);
    doc.text(wrapped, M, y);
    doc.setTextColor(0);
    y += wrapped.length * 12;
    line(18);
  }

  // ---- Line items table ----
  const cols = { desc: M, qty: right - 190, unit: right - 120, amt: right };
  doc.setFillColor(241, 245, 249).rect(M, y - 12, right - M, 22, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(10);
  doc.text('Description', cols.desc + 6, y + 3);
  doc.text('Qty', cols.qty, y + 3, { align: 'right' });
  doc.text('Unit', cols.unit, y + 3, { align: 'right' });
  doc.text('Amount', cols.amt - 6, y + 3, { align: 'right' });
  line(20);

  doc.setFont('helvetica', 'normal');
  (bill?.lineItems || []).forEach((li) => {
    const amount = (Number(li.qty) || 0) * (Number(li.unitPrice) || 0);
    const descLines = doc.splitTextToSize(li.description || '', cols.qty - cols.desc - 16);
    doc.text(descLines, cols.desc + 6, y);
    doc.text(String(li.qty ?? ''), cols.qty, y, { align: 'right' });
    doc.text(money(li.unitPrice), cols.unit, y, { align: 'right' });
    doc.text(money(amount), cols.amt - 6, y, { align: 'right' });
    y += Math.max(descLines.length * 12, 14);
    doc.setDrawColor(235).line(M, y - 4, right, y - 4);
    if (y > PH - M) {
      doc.addPage();
      y = M;
    }
  });

  // ---- Totals ----
  line(8);
  const totalsX = right - 200;
  const totRow = (label, val, bold) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(bold ? 12 : 10);
    doc.text(label, totalsX, y, { align: 'left' });
    doc.text(money(val), right - 6, y, { align: 'right' });
    line(bold ? 18 : 15);
  };
  totRow('Subtotal', bill?.subtotal || 0);
  if (Number(bill?.taxRate) > 0) totRow(`Tax (${bill.taxRate}%)`, bill?.taxAmount || 0);
  if (bill?.ccFeeApplied && Number(bill?.ccFeeAmount) > 0)
    totRow(`Credit card fee (${bill.ccFeeRate}%)`, bill?.ccFeeAmount || 0);
  doc.setDrawColor(200).line(totalsX, y - 6, right, y - 6);
  totRow('Total', bill?.total || 0, true);

  // ---- Signature ----
  line(18);
  if (bill?.signatureBlob) {
    try {
      const url = await blobToDataURL(bill.signatureBlob);
      if (y > PH - 120) {
        doc.addPage();
        y = M;
      }
      doc.addImage(url, 'PNG', M, y, 180, 70);
      y += 74;
    } catch {
      /* ignore */
    }
  }
  doc.setDrawColor(120).line(M, y, M + 220, y);
  line(12);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90);
  doc.text(`Customer signature — ${contact?.name || account?.name || ''}`, M, y);
  doc.text(`Date: ${fmtDate(bill?.billDate || bill?.pdfGeneratedAt || Date.now())}`, M, y + 12);
  doc.setTextColor(0);

  // ---- Terms / notes footer ----
  if (profile?.billTerms) {
    line(28);
    if (y > PH - 60) {
      doc.addPage();
      y = M;
    }
    doc.setDrawColor(230).line(M, y, right, y);
    line(12);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110);
    const termLines = doc.splitTextToSize(profile.billTerms, right - M);
    doc.text(termLines, M, y);
    doc.setTextColor(0);
    y += termLines.length * 11;
  }

  // ---- Photos ----
  if (photoBlobs.length) {
    doc.addPage();
    y = M;
    doc.setFont('helvetica', 'bold').setFontSize(14).text('Job Photos', M, y);
    y += 20;
    const maxW = right - M;
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
  }

  return doc.output('blob');
}
