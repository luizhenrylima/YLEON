export interface ProductPriceMetric {
  price: number;
  variationId: string;
  finishId: string;
}

export interface ProductPriceSummary {
  variationCount: number;
  finishCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  priceCount: number;
}

export interface PriceConsultationState {
  brandId: string | null;
  categoryId: string | null;
  productId: string | null;
  variationId: string | null;
  selectedPriceId: string | null;
  productSearch: string;
  globalSearch: string;
}

export const emptyPriceConsultationState: PriceConsultationState = {
  brandId: null,
  categoryId: null,
  productId: null,
  variationId: null,
  selectedPriceId: null,
  productSearch: '',
  globalSearch: '',
};

export function resetPriceConsultationState(): PriceConsultationState {
  return { ...emptyPriceConsultationState };
}

export function formatCurrencyBRL(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return 'Valor indisponivel';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(Number(value)).replace(/\u00a0/g, ' ');
}

export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(value: unknown): string {
  const normalized = normalizeText(value).toLowerCase().replace(/[_\s]+/g, '-').replace(/-+/g, '-');
  return normalized || 'sem-identificacao';
}

export function summarizeProductPrices(rows: ProductPriceMetric[]): ProductPriceSummary {
  const prices = rows.map(row => Number(row.price)).filter(price => Number.isFinite(price));
  return {
    variationCount: new Set(rows.map(row => row.variationId).filter(Boolean)).size,
    finishCount: new Set(rows.map(row => row.finishId).filter(Boolean)).size,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    priceCount: prices.length,
  };
}

export function getPriceHighlight(price: number, minPrice: number | null, maxPrice: number | null) {
  if (minPrice != null && price === minPrice) return 'min';
  if (maxPrice != null && price === maxPrice) return 'max';
  return 'none';
}
