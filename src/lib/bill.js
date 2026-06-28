// Keep only meaningful line items (a description or a price), normalized for storage.
export function cleanLineItems(items = []) {
  return items
    .filter((it) => (it.description || '').trim() || Number(it.unitPrice) > 0)
    .map(({ description, qty, unitPrice }) => ({
      description: (description || '').trim(),
      qty: Number(qty) || 0,
      unitPrice: Number(unitPrice) || 0,
    }));
}

// A bill is worth persisting once it has at least one real line item.
export function billHasContent(items = []) {
  return cleanLineItems(items).length > 0;
}
