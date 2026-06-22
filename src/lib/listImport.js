import { db, createCatalogItem, createWorkType, listWorkTypes } from '../db/db.js';

// Import/export for the two reusable lists: the parts & labor catalog and work
// types (each work type carries its own template line items). Supports CSV
// (spreadsheet-friendly) and JSON (exact round-trip). Importing is additive and
// skips any part/work-type whose name already exists (case-insensitive).

// ---- CSV core ---------------------------------------------------------------
// Small RFC-4180-ish parser: handles quoted fields, embedded commas/newlines,
// "" escapes, CRLF, and a leading BOM (Excel).
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* ignore */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => (c || '').trim() !== ''));
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

const num = (v) => Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));

// ---- CSV: parts -------------------------------------------------------------
export function parsePartsCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const c0 = (rows[0][0] || '').trim().toLowerCase();
  const c1 = (rows[0][1] || '').trim().toLowerCase();
  if (['description', 'desc', 'name', 'part', 'parts'].includes(c0) || ['unit price', 'price', 'unitprice'].includes(c1)) rows.shift();
  return rows
    .map((r) => ({ description: (r[0] || '').trim(), unitPrice: num(r[1]) || 0 }))
    .filter((p) => p.description);
}

// ---- CSV: work types (one row per template line item, grouped by name) ------
export function parseWorkTypesCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const c0 = (rows[0][0] || '').trim().toLowerCase();
  const c1 = (rows[0][1] || '').trim().toLowerCase();
  if (['work type', 'worktype', 'type'].includes(c0) || ['item description', 'description', 'item', 'desc'].includes(c1)) rows.shift();
  const map = new Map(); // name (lowercased) -> { name, items: [] }
  for (const r of rows) {
    const name = (r[0] || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, { name, items: [] });
    const desc = (r[1] || '').trim();
    if (desc) map.get(key).items.push({ description: desc, qty: num(r[2]) || 1, unitPrice: num(r[3]) || 0 });
  }
  return [...map.values()];
}

// ---- Additive importers (skip existing names) -------------------------------
export async function importParts(items) {
  const existing = new Set((await db.catalogItems.toArray()).map((i) => (i.description || '').trim().toLowerCase()));
  let added = 0, skipped = 0;
  for (const p of items) {
    const key = (p.description || '').trim().toLowerCase();
    if (!key || existing.has(key)) { skipped++; continue; }
    await createCatalogItem({ description: p.description.trim(), unitPrice: Number(p.unitPrice) || 0 });
    existing.add(key);
    added++;
  }
  return { added, skipped };
}

export async function importWorkTypes(types) {
  const existing = new Set((await listWorkTypes()).map((t) => (t.name || '').trim().toLowerCase()));
  let added = 0, skipped = 0;
  for (const t of types) {
    const key = (t.name || '').trim().toLowerCase();
    if (!key || existing.has(key)) { skipped++; continue; }
    const items = (t.items || [])
      .map((it) => ({ description: (it.description || '').trim(), qty: Number(it.qty) || 1, unitPrice: Number(it.unitPrice) || 0 }))
      .filter((it) => it.description);
    await createWorkType({ name: t.name.trim(), icon: t.icon || 'wrench', items });
    existing.add(key);
    added++;
  }
  return { added, skipped };
}

// ---- High-level: import from file text --------------------------------------
export const importPartsCsv = (text) => importParts(parsePartsCsv(text));
export const importWorkTypesCsv = (text) => importWorkTypes(parseWorkTypesCsv(text));

export async function importListsJson(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
  // Accept our lists file, a raw {catalogItems, workTypes}, or a full backup bundle.
  const data = obj?.data && (obj.data.catalogItems || obj.data.workTypes) ? obj.data : obj;
  const parts = Array.isArray(data?.catalogItems) ? data.catalogItems : [];
  const wts = Array.isArray(data?.workTypes) ? data.workTypes : [];
  if (!parts.length && !wts.length) throw new Error('No parts or work types found in this file.');
  return { parts: await importParts(parts), workTypes: await importWorkTypes(wts) };
}

// ---- Exports (also serve as correctly-shaped starter templates) -------------
export async function exportPartsCsv() {
  const items = await db.catalogItems.orderBy('description').toArray();
  const rows = [['Description', 'Unit Price'], ...items.map((i) => [i.description, i.unitPrice])];
  return new Blob([toCsv(rows)], { type: 'text/csv' });
}

export async function exportWorkTypesCsv() {
  const types = await listWorkTypes();
  const rows = [['Work Type', 'Item Description', 'Qty', 'Unit Price']];
  for (const t of types) {
    if (!t.items?.length) rows.push([t.name, '', '', '']);
    else for (const it of t.items) rows.push([t.name, it.description, it.qty, it.unitPrice]);
  }
  return new Blob([toCsv(rows)], { type: 'text/csv' });
}

export async function exportListsJson() {
  const catalogItems = (await db.catalogItems.orderBy('description').toArray()).map((i) => ({
    description: i.description,
    unitPrice: i.unitPrice,
  }));
  const workTypes = (await listWorkTypes()).map((t) => ({
    name: t.name,
    icon: t.icon || 'wrench',
    items: (t.items || []).map((it) => ({ description: it.description, qty: it.qty, unitPrice: it.unitPrice })),
  }));
  const bundle = { app: 'field-service-lists', exportedAt: new Date().toISOString(), catalogItems, workTypes };
  return new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
}
