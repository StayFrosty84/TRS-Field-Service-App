import { money } from './format.js';

// Default message attached when sharing a bill/estimate PDF via the share sheet.
// The operator can override the template in Settings (profile.shareMessage).
export const DEFAULT_SHARE_TEMPLATE =
  'Hi {accountName} — your {docType} {docNumber} from {businessName} is attached. Total: {total}. Thank you!';

// Fills {token}s the values object knows about (empty values vanish); unknown
// tokens stay visible so a template typo is easy to spot. Collapses the double
// spaces empty values leave behind.
export function fillShareMessage(template, values = {}) {
  const tpl = template && template.trim() ? template : DEFAULT_SHARE_TEMPLATE;
  return tpl
    .replace(/\{(\w+)\}/g, (raw, key) => (key in values ? String(values[key] ?? '') : raw))
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim();
}

export function shareMessageValues({ profile, account, order, bill }) {
  return {
    accountName: account?.name || '',
    businessName: profile?.businessName || '',
    docType: order?.isEstimate ? 'estimate' : 'bill',
    docNumber: bill?.billNumber ? `#${bill.billNumber}` : '',
    total: bill?.total != null ? money(bill.total) : '',
  };
}
