import { useLiveQuery } from 'dexie-react-hooks';
import { db, PROFILE_ID } from '../db/db.js';

// Feature toggles live on the business profile (so they're consistent and restorable).
// Everything defaults ON until explicitly turned off.
export function useFeatures() {
  const p = useLiveQuery(() => db.businessProfile.get(PROFILE_ID));
  return {
    dashboard: p?.featDashboard !== false,
    billing: p?.featBilling !== false,
    cardFee: p?.featCardFee !== false,
    ready: p !== undefined, // useLiveQuery returns undefined while loading
  };
}
