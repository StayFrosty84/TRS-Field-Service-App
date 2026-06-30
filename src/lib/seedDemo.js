import {
  db,
  PROFILE_ID,
  saveProfile,
  createAccount,
  createContact,
  createWorkOrder,
  saveBill,
  markBillPaid,
  listStages,
} from '../db/db.js';
import { computeTotals } from './format.js';
import { resolveStage } from './stages.js';

// Sample accounts with two contacts each.
const ACCOUNTS = [
  {
    name: 'Acme Bakery LLC',
    address: '12 Main St, Springfield, IL 62701',
    phone: '(555) 010-1234',
    email: 'orders@acmebakery.example',
    contacts: [
      { name: 'Jordan Rivera', role: 'Kitchen Manager', phone: '(555) 222-3301', email: 'jordan@acmebakery.example' },
      { name: 'Sam Okafor', role: 'Owner', phone: '(555) 222-3302', email: 'sam@acmebakery.example' },
    ],
  },
  {
    name: 'Riverside Diner',
    address: '88 River Rd, Springfield, IL 62702',
    phone: '(555) 010-5678',
    email: 'info@riversidediner.example',
    contacts: [
      { name: 'Dana Lee', role: 'Manager', phone: '(555) 333-4401', email: 'dana@riverside.example' },
      { name: 'Chris Patel', role: 'Head Chef', phone: '(555) 333-4402', email: 'chris@riverside.example' },
    ],
  },
  {
    name: 'Summit HVAC Co.',
    address: '450 Hill Ave, Springfield, IL 62703',
    phone: '(555) 010-9012',
    email: 'dispatch@summithvac.example',
    contacts: [
      { name: 'Morgan Yu', role: 'Dispatcher', phone: '(555) 444-5501', email: 'morgan@summit.example' },
      { name: 'Alex Stone', role: 'Owner', phone: '(555) 444-5502', email: 'alex@summit.example' },
    ],
  },
];

// Five jobs per account; first three are paid, last two are left unpaid.
const JOBS = [
  { issue: 'Convection oven not reaching temperature.', items: [
    { description: 'Service call / trip fee', qty: 1, unitPrice: 65 },
    { description: 'Oven thermostat (OEM)', qty: 1, unitPrice: 145 },
    { description: 'Labor', qty: 1.5, unitPrice: 90 },
  ] },
  { issue: 'Walk-in cooler running warm.', items: [
    { description: 'Diagnostic fee', qty: 1, unitPrice: 95 },
    { description: 'Refrigerant recharge', qty: 1, unitPrice: 120 },
  ] },
  { issue: 'Dishwasher not draining.', items: [
    { description: 'Service call / trip fee', qty: 1, unitPrice: 65 },
    { description: 'Drain pump', qty: 1, unitPrice: 110 },
  ] },
  { issue: 'Rooftop AC unit short-cycling.', items: [
    { description: 'Diagnostic fee', qty: 1, unitPrice: 95 },
    { description: 'Run capacitor', qty: 1, unitPrice: 45 },
    { description: 'Labor', qty: 2, unitPrice: 90 },
  ] },
  { issue: 'Ice machine producing low volume.', items: [
    { description: 'Service call / trip fee', qty: 1, unitPrice: 65 },
    { description: 'Water filter', qty: 1, unitPrice: 38 },
    { description: 'Clean & descale', qty: 1, unitPrice: 85 },
  ] },
];

const METHODS = ['Cash', 'Card', 'Check'];
const DAY = 86400000;
const TAX_RATE = 8;

// Seed sample records once on first launch so the app isn't empty on a demo device.
// Skips if data already exists or a test asks to opt out (localStorage 'fs-seed-demo' = 'off').
export async function ensureSeedDemoData() {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('fs-seed-demo') === 'off') return;
  const profile = await db.businessProfile.get(PROFILE_ID);
  if (profile?.demoSeeded) return;
  if ((await db.accounts.count()) > 0) {
    await saveProfile({ demoSeeded: true });
    return;
  }

  // Demo jobs are all completed → place them in the terminal Completed stage so
  // the pipeline reflects them honestly (resolveStage maps a legacy 'completed').
  const stages = await listStages();
  const completedStage = resolveStage({ status: 'completed' }, stages);

  let i = 0; // global job counter to spread dates across ~10 weeks
  for (const acct of ACCOUNTS) {
    const accountId = await createAccount({
      name: acct.name,
      address: acct.address,
      phone: acct.phone,
      email: acct.email,
    });
    const contactIds = [];
    for (const c of acct.contacts) contactIds.push(await createContact({ accountId, ...c }));

    for (let j = 0; j < JOBS.length; j++) {
      const job = JOBS[j];
      const paid = j < 3;
      const ts = Date.now() - (70 - i * 4) * DAY;
      i += 1;
      const woId = await createWorkOrder({
        accountId,
        contactId: contactIds[j % contactIds.length],
        location: { text: acct.address },
        issue: job.issue,
        serviceDate: ts,
        createdAt: ts,
        status: 'completed',
        completedAt: ts,
        ...(completedStage
          ? { stageId: completedStage.id, stageHistory: [{ stageId: completedStage.id, at: ts }] }
          : {}),
      });
      const { subtotal, taxAmount, ccFeeAmount, total } = computeTotals(job.items, TAX_RATE, 0, false);
      const billId = await saveBill(woId, {
        lineItems: job.items,
        taxRate: TAX_RATE,
        subtotal,
        taxAmount,
        ccFeeApplied: false,
        ccFeeRate: 0,
        ccFeeAmount,
        total,
        billDate: ts,
        paymentStatus: 'unpaid',
        signatureBlob: null,
        pdfGeneratedAt: ts,
      });
      if (paid) await markBillPaid(billId, METHODS[j % METHODS.length]);
    }
  }

  await saveProfile({ demoSeeded: true });
}
