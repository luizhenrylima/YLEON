export type FinishMarkupRule = {
  id: string;
  brand_id: string;
  finish_label: string;
  finish_key: string;
  markup_percent: number;
  is_active: boolean;
  updated_at: string | null;
};

const STORAGE_KEY = 'price_finish_markup_rules_fallback_v1';

export function normalizeFinishMarkupKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

export function isFinishMarkupRulesTableMissing(error: unknown) {
  const err = error as { code?: string; message?: string } | null | undefined;
  return err?.code === '42P01'
    || err?.code === 'PGRST205'
    || /price_finish_markup_rules/i.test(err?.message || '') && /schema cache|could not find|does not exist/i.test(err?.message || '');
}

function readAllLocalRules() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed as FinishMarkupRule[] : [];
  } catch {
    return [];
  }
}

function writeAllLocalRules(rules: FinishMarkupRule[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // localStorage can be unavailable in private mode.
  }
}

export function getLocalFinishMarkupRules(brandId: string) {
  return readAllLocalRules()
    .filter(rule => rule.brand_id === brandId)
    .sort((a, b) => a.finish_label.localeCompare(b.finish_label));
}

export function upsertLocalFinishMarkupRule(payload: Omit<FinishMarkupRule, 'id' | 'updated_at'> & { id?: string }) {
  const rules = readAllLocalRules();
  const finishKey = payload.finish_key || normalizeFinishMarkupKey(payload.finish_label);
  const existingIndex = rules.findIndex(rule => (
    payload.id ? rule.id === payload.id : rule.brand_id === payload.brand_id && rule.finish_key === finishKey
  ));
  const nextRule: FinishMarkupRule = {
    id: existingIndex >= 0 ? rules[existingIndex].id : crypto.randomUUID(),
    brand_id: payload.brand_id,
    finish_label: payload.finish_label,
    finish_key: finishKey,
    markup_percent: Number(payload.markup_percent || 0),
    is_active: payload.is_active,
    updated_at: new Date().toISOString(),
  };
  if (existingIndex >= 0) rules[existingIndex] = nextRule;
  else rules.push(nextRule);
  writeAllLocalRules(rules);
  return nextRule;
}

export function updateLocalFinishMarkupRule(ruleId: string, patch: Partial<FinishMarkupRule>) {
  const rules = readAllLocalRules();
  const next = rules.map(rule => rule.id === ruleId ? { ...rule, ...patch, updated_at: new Date().toISOString() } : rule);
  writeAllLocalRules(next);
}

export function deleteLocalFinishMarkupRule(ruleId: string) {
  writeAllLocalRules(readAllLocalRules().filter(rule => rule.id !== ruleId));
}
