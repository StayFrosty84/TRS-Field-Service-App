// Pure asset helpers (node-testable; no DOM).

// Human label for pickers and list rows: "Unit 12 — 2019 Ford F-350".
export function assetLabel(asset) {
  if (!asset) return '';
  const name = [asset.year, asset.make, asset.model].filter(Boolean).join(' ');
  const unit = asset.unitNumber ? `Unit ${asset.unitNumber}` : '';
  return [unit, name].filter(Boolean).join(' — ') || 'Asset';
}

// Clean a scanned/typed VIN: uppercase alphanumerics only. Door-jamb Code 39
// barcodes often prepend an import character 'I' — strip it when the result
// is 18 chars (a VIN is 17).
export function normalizeVin(raw) {
  if (!raw) return '';
  let vin = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (vin.length === 18 && vin.startsWith('I')) vin = vin.slice(1);
  return vin;
}
