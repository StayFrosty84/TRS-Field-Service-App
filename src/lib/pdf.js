import { jsPDF } from 'jspdf';
import { money, fmtDate } from './format.js';

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
  if (profile?.logoBlob) {
    try {
      const url = await blobToDataURL(profile.logoBlob);
      const { w, h } = await imageSize(url);
      const lw = 64;
      const lh = (h / w) * lw || 64;
      doc.addImage(url, fmtForJsPDF(profile.logoBlob.type), right - lw, y, lw, lh);
    } catch {
      /* ignore logo errors */
    }
  }
  doc.setFont('helvetica', 'bold').setFontSize(18);
  doc.text(profile?.businessName || 'My Business', M, y + 6);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(90);
  const sellerLines = [
    profile?.ownerName,
    profile?.address,
    [profile?.phone, profile?.email].filter(Boolean).join('  •  '),
  ].filter(Boolean);
  sellerLines.forEach((t, i) => doc.text(String(t), M, y + 24 + i * 13));
  doc.setTextColor(0);
  y += 24 + sellerLines.length * 13;

  // ---- Title ----
  line(22);
  doc.setDrawColor(220).line(M, y, right, y);
  line(10);
  doc.setFont('helvetica', 'bold').setFontSize(20);
  doc.text('BILL OF SALE', M, y + 8);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(90);
  doc.text(`Date: ${fmtDate(bill?.pdfGeneratedAt || Date.now())}`, right, y - 4, { align: 'right' });
  doc.text(`Service: ${fmtDate(workOrder?.serviceDate)}`, right, y + 9, { align: 'right' });
  doc.setTextColor(0);
  line(26);

  // ---- Bill To + Service ----
  const colW = (right - M - 16) / 2;
  const startY = y;
  doc.setFont('helvetica', 'bold').setFontSize(11).text('Bill To', M, y);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(60);
  const billTo = [
    account?.name,
    account?.address,
    account?.phone,
    contact ? `Attn: ${contact.name}` : null,
    [contact?.phone, contact?.email].filter(Boolean).join('  •  ') || null,
  ].filter(Boolean);
  billTo.forEach((t, i) => doc.text(String(t), M, y + 16 + i * 13, { maxWidth: colW }));

  doc.setTextColor(0).setFont('helvetica', 'bold').setFontSize(11).text('Service Details', M + colW + 16, startY);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(60);
  const svc = [
    workOrder?.location?.text ? `Location: ${workOrder.location.text}` : null,
    workOrder?.location?.lat ? `GPS: ${workOrder.location.lat.toFixed(5)}, ${workOrder.location.lng.toFixed(5)}` : null,
  ].filter(Boolean);
  svc.forEach((t, i) => doc.text(String(t), M + colW + 16, startY + 16 + i * 13, { maxWidth: colW }));
  doc.setTextColor(0);

  y = startY + 16 + Math.max(billTo.length, svc.length) * 13;
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
  doc.text(`Date: ${fmtDate(bill?.pdfGeneratedAt || Date.now())}`, M, y + 12);
  doc.setTextColor(0);

  // ---- Photos ----
  if (photoBlobs.length) {
    doc.addPage();
    y = M;
    doc.setFont('helvetica', 'bold').setFontSize(14).text('Job Photos', M, y);
    y += 20;
    const maxW = right - M;
    for (const pb of photoBlobs) {
      try {
        const url = await blobToDataURL(pb);
        const { w, h } = await imageSize(url);
        const dispW = Math.min(maxW, 360);
        const dispH = (h / w) * dispW;
        if (y + dispH > PH - M) {
          doc.addPage();
          y = M;
        }
        doc.addImage(url, fmtForJsPDF(pb.type), M, y, dispW, dispH);
        y += dispH + 14;
      } catch {
        /* skip bad image */
      }
    }
  }

  return doc.output('blob');
}
