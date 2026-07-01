export type HideableCatalogRecord = {
  id: string;
  is_hidden?: boolean | null;
};

const LOCAL_HIDDEN_BRANDS_KEY = 'catalog_hidden_brand_ids_fallback_v1';
const LOCAL_HIDDEN_PRODUCTS_KEY = 'catalog_hidden_product_ids_fallback_v1';

function readLocalHiddenIds(key: string) {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

function writeLocalHiddenIds(key: string, ids: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // Ignore private mode/quota errors. Database persistence is the source of truth.
  }
}

export function getLocalHiddenBrandIds() {
  return readLocalHiddenIds(LOCAL_HIDDEN_BRANDS_KEY);
}

export function getLocalHiddenProductIds() {
  return readLocalHiddenIds(LOCAL_HIDDEN_PRODUCTS_KEY);
}

export function setLocalBrandHidden(id: string, hidden: boolean) {
  const ids = getLocalHiddenBrandIds();
  if (hidden) ids.add(id);
  else ids.delete(id);
  writeLocalHiddenIds(LOCAL_HIDDEN_BRANDS_KEY, ids);
}

export function setLocalProductHidden(id: string, hidden: boolean) {
  const ids = getLocalHiddenProductIds();
  if (hidden) ids.add(id);
  else ids.delete(id);
  writeLocalHiddenIds(LOCAL_HIDDEN_PRODUCTS_KEY, ids);
}

export function isHiddenColumnMissing(error: unknown) {
  const candidate = error as { code?: string; message?: string; details?: string };
  const text = `${candidate?.message || ''} ${candidate?.details || ''}`.toLowerCase();
  return candidate?.code === '42703'
    || candidate?.code === 'PGRST204'
    || (text.includes('is_hidden') && (text.includes('schema cache') || text.includes('column')));
}

export function isCatalogRecordVisible<T extends HideableCatalogRecord>(
  record: T,
  localHiddenIds = new Set<string>(),
) {
  return record.is_hidden !== true && !localHiddenIds.has(record.id);
}

export function mergeLocalHiddenState<T extends HideableCatalogRecord>(
  records: T[],
  localHiddenIds: Set<string>,
) {
  return records.map(record => ({
    ...record,
    is_hidden: record.is_hidden === true || localHiddenIds.has(record.id),
  }));
}
