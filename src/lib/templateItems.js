// Template line items on a work type are either a pure catalog reference
// ({ catalogItemId, qty }) or a legacy free-form row ({ description, qty, unitPrice }).
// These helpers resolve a row to concrete display/snapshot values against the catalog.

// catalogById: a Map (or object) keyed by catalog item id.
const lookup = (catalogById, id) =>
  catalogById instanceof Map ? catalogById.get(id) : catalogById?.[id];

export function resolveTemplateItem(item, catalogById) {
  const qty = item.qty ?? 1;
  if (item.catalogItemId) {
    const c = lookup(catalogById, item.catalogItemId);
    if (!c) {
      return { catalogItemId: item.catalogItemId, description: '(deleted item)', unitPrice: 0, qty, missing: true };
    }
    return { catalogItemId: item.catalogItemId, description: c.description, unitPrice: c.unitPrice, qty, missing: false };
  }
  return { description: item.description || '', unitPrice: item.unitPrice ?? 0, qty, missing: false };
}

export function resolveTemplateItems(items = [], catalogById) {
  return items.map((it) => resolveTemplateItem(it, catalogById));
}

// Work types whose template items reference the given catalog item id.
export function workTypesUsing(workTypes = [], catalogItemId) {
  return workTypes.filter((t) => (t.items || []).some((it) => it.catalogItemId === catalogItemId));
}
