import { useMemo, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  BadgeDollarSign,
  Calculator,
  Archive,
  Check,
  Clipboard,
  Copy,
  Eraser,
  FileDown,
  Loader2,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  emptyPriceConsultationState,
  formatCurrencyBRL,
  getPriceHighlight,
  resetPriceConsultationState,
  summarizeProductPrices,
  type PriceConsultationState,
} from '@/lib/priceConsultant';
import {
  getLocalFinishMarkupRules,
  isFinishMarkupRulesTableMissing,
  normalizeFinishMarkupKey,
  type FinishMarkupRule,
} from '@/lib/finishMarkupRules';
import logoYleon from '@/assets/logo-yleon.png';

type TenantInfo = {
  id: string;
  name: string;
  logo_url?: string | null;
};

const DEFAULT_PRICE_TENANT_SLUG = 'acervo-1055';

type Brand = {
  id: string;
  name: string;
};

type Category = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  brand_id: string;
  category_id: string;
  name: string;
  reference_code: string | null;
};

type Variation = {
  id: string;
  product_id: string;
  variation_name: string;
  variation_code: string;
  dimensions: string | null;
};

type FinishPrice = {
  price_id: string;
  brand_id?: string;
  finish_id: string;
  finish_name: string;
  finish_type: string | null;
  finish_code: string;
  base_price?: number | null;
  price: number;
  currency: string;
};

type SearchResult = {
  price_id: string;
  brand_id: string;
  brand_name: string;
  category_id: string;
  category_name: string;
  product_id: string;
  product_name: string;
  reference_code: string | null;
  variation_id: string;
  variation_name: string;
  variation_code: string;
  finish_id: string;
  finish_name: string;
  finish_code: string;
  price: number;
  currency: string;
};

type ProductSummaryRow = {
  price: number;
  variation_id: string;
  finish_id: string;
};

type ProjectOption = {
  id: string;
  name: string;
  client_name: string | null;
  architect_name: string | null;
  consultant_name: string | null;
  crm_customer_id: string | null;
  seller_user_id: string | null;
  user_id: string;
  created_at: string;
};

type QuoteStatus = 'rascunho' | 'enviada' | 'em_negociacao' | 'aprovada' | 'recusada' | 'cancelada';
type DiscountType = 'none' | 'percent' | 'amount';

type SavedQuote = {
  id: string;
  quote_number: string;
  project_id: string;
  customer_id: string | null;
  tenant_id: string | null;
  responsible_user_id: string;
  status: QuoteStatus;
  internal_notes: string | null;
  commercial_terms: string | null;
  general_discount_type: DiscountType;
  general_discount_value: number;
  subtotal_gross: number;
  item_discount_total: number;
  general_discount_total: number;
  discount_total: number;
  total_final: number;
  created_at: string;
  updated_at: string;
};

type SavedQuoteItem = {
  id: string;
  quote_id: string;
  project_id: string;
  tenant_id: string | null;
  price_id: string | null;
  price_product_id: string | null;
  price_brand_id: string | null;
  price_category_id: string | null;
  price_variation_id: string | null;
  price_finish_id: string | null;
  product_name: string;
  brand_name: string | null;
  sku: string | null;
  image_url: string | null;
  category_name: string | null;
  finish_name: string | null;
  variation_name: string | null;
  unit_price: number;
  quantity: number;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  subtotal_before_discount: number;
  subtotal_after_discount: number;
  item_notes: string | null;
  sort_order: number;
};

type QuoteItem = {
  id: string;
  savedItemId?: string | null;
  priceId: string;
  brandId: string | null;
  brandName: string;
  categoryId: string | null;
  categoryName: string;
  productId: string;
  productName: string;
  referenceCode: string | null;
  variationId: string;
  variationCode: string;
  variationName: string;
  finishId: string;
  finishCode: string;
  finishName: string;
  baseUnitPrice: number;
  unitPrice: number;
  quantity: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  subtotalBeforeDiscount: number;
  subtotalAfterDiscount: number;
  itemNotes: string;
  finishMarkupLabel: string | null;
  finishMarkupPercent: number | null;
  areaM2: number | null;
  widthCm: number | null;
  depthCm: number | null;
};

const QUOTE_STATUS_OPTIONS: { value: QuoteStatus; label: string }[] = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'enviada', label: 'Enviada' },
  { value: 'em_negociacao', label: 'Em negociacao' },
  { value: 'aprovada', label: 'Aprovada' },
  { value: 'recusada', label: 'Recusada' },
  { value: 'cancelada', label: 'Cancelada' },
];

const DISCOUNT_OPTIONS: { value: DiscountType; label: string }[] = [
  { value: 'none', label: 'Sem desconto' },
  { value: 'percent', label: '%' },
  { value: 'amount', label: 'R$' },
];

function numberValue(value: string | number | null | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function discountAmount(base: number, type: DiscountType, value: number) {
  if (type === 'percent') return roundCurrency(base * Math.min(Math.max(value, 0), 100) / 100);
  if (type === 'amount') return Math.min(roundCurrency(Math.max(value, 0)), base);
  return 0;
}

function recalculateQuoteItem(item: QuoteItem): QuoteItem {
  const quantity = Math.max(Number(item.quantity) || 1, 0.01);
  const unitPrice = Math.max(Number(item.unitPrice) || 0, 0);
  const subtotalBeforeDiscount = roundCurrency(unitPrice * quantity);
  const discount = discountAmount(subtotalBeforeDiscount, item.discountType, item.discountValue);

  return {
    ...item,
    quantity,
    unitPrice,
    discountAmount: discount,
    subtotalBeforeDiscount,
    subtotalAfterDiscount: Math.max(roundCurrency(subtotalBeforeDiscount - discount), 0),
  };
}

function calculateQuoteTotals(items: QuoteItem[], generalType: DiscountType, generalValue: number) {
  const subtotalGross = roundCurrency(items.reduce((total, item) => total + item.subtotalBeforeDiscount, 0));
  const itemDiscountTotal = roundCurrency(items.reduce((total, item) => total + item.discountAmount, 0));
  const afterItems = Math.max(roundCurrency(subtotalGross - itemDiscountTotal), 0);
  const generalDiscountTotal = discountAmount(afterItems, generalType, generalValue);
  const discountTotal = roundCurrency(itemDiscountTotal + generalDiscountTotal);
  const totalFinal = Math.max(roundCurrency(afterItems - generalDiscountTotal), 0);

  return {
    subtotalGross,
    itemDiscountTotal,
    generalDiscountTotal,
    discountTotal,
    totalFinal,
  };
}

function parseDbNumber(value: unknown) {
  return Number(value ?? 0) || 0;
}

function normalizeFinishKey(value: string | null | undefined) {
  return normalizeFinishMarkupKey(value || '');
}

function isStructuralMarkupEligible(categoryName?: string | null, productName?: string | null) {
  const text = normalizeFinishKey(`${categoryName || ''} ${productName || ''}`);
  return /\b(cadeira|cadeiras|banqueta|banquetas|cama|camas)\b/.test(text);
}

function applyStructuralMarkup(item: FinishPrice, rule: FinishMarkupRule | null) {
  const basePrice = Number(item.price || 0);
  const percent = rule?.is_active ? Number(rule.markup_percent || 0) : 0;
  const finalPrice = percent > 0 ? Number((basePrice * (1 + percent / 100)).toFixed(2)) : basePrice;
  return {
    basePrice,
    finalPrice,
    markupPercent: percent > 0 ? percent : null,
    markupLabel: percent > 0 ? rule?.finish_label || null : null,
  };
}

function useDebouncedValue(value: string, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 px-5 py-8 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function LoadingLine() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-5/6" />
    </div>
  );
}

export default function PriceConsultantPage() {
  const { user, isAdmin, isManager, isCeo, isSeller, isFinance, loading } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<PriceConsultationState>(emptyPriceConsultationState);
  const [globalSearch, setGlobalSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>('rascunho');
  const [internalNotes, setInternalNotes] = useState('');
  const [commercialTerms, setCommercialTerms] = useState('');
  const [generalDiscountType, setGeneralDiscountType] = useState<DiscountType>('none');
  const [generalDiscountValue, setGeneralDiscountValue] = useState('');
  const [isSavingQuote, setIsSavingQuote] = useState(false);
  const [isGeneratingQuotePdf, setIsGeneratingQuotePdf] = useState(false);
  const [topWidthCm, setTopWidthCm] = useState('');
  const [topDepthCm, setTopDepthCm] = useState('');
  const [selectedStructuralMarkupRuleId, setSelectedStructuralMarkupRuleId] = useState('none');
  const debouncedGlobalSearch = useDebouncedValue(globalSearch.trim(), 300);
  const debouncedProductSearch = useDebouncedValue(productSearch.trim(), 300);
  const projectParam = searchParams.get('project') || '';

  const tenantQuery = useQuery({
    queryKey: ['price-tenant', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<TenantInfo | null> => {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (profileError) throw profileError;

      const tenantQueryBuilder = supabase
        .from('tenants')
        .select('id, name, logo_url');
      const { data: tenant, error: tenantError } = profile?.tenant_id
        ? await tenantQueryBuilder.eq('id', profile.tenant_id).maybeSingle()
        : await tenantQueryBuilder.eq('slug', DEFAULT_PRICE_TENANT_SLUG).maybeSingle();

      if (tenantError) throw tenantError;
      return tenant as TenantInfo | null;
    },
  });

  const tenantId = tenantQuery.data?.id ?? null;
  const canManageAllQuotes = isAdmin || isManager || isCeo;

  const projectsQuery = useQuery({
    queryKey: ['quote-projects', user?.id, isAdmin, isManager, isCeo, isSeller],
    enabled: !!user?.id,
    queryFn: async (): Promise<ProjectOption[]> => {
      let query = (supabase as any)
        .from('projects')
        .select('id, name, client_name, architect_name, consultant_name, crm_customer_id, seller_user_id, user_id, created_at')
        .is('archived_at', null)
        .order('created_at', { ascending: false });

      if (!canManageAllQuotes) {
        query = query.or(`seller_user_id.eq.${user!.id},user_id.eq.${user!.id}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ProjectOption[];
    },
  });

  const selectedProject = projectsQuery.data?.find(project => project.id === selectedProjectId) ?? null;

  const savedQuotesQuery = useQuery({
    queryKey: ['project-quotes', selectedProjectId],
    enabled: !!selectedProjectId,
    queryFn: async (): Promise<SavedQuote[]> => {
      const { data, error } = await (supabase as any)
        .from('quotes')
        .select('id, quote_number, project_id, customer_id, tenant_id, responsible_user_id, status, internal_notes, commercial_terms, general_discount_type, general_discount_value, subtotal_gross, item_discount_total, general_discount_total, discount_total, total_final, created_at, updated_at')
        .eq('project_id', selectedProjectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return ((data ?? []) as SavedQuote[]).map(quote => ({
        ...quote,
        general_discount_value: parseDbNumber(quote.general_discount_value),
        subtotal_gross: parseDbNumber(quote.subtotal_gross),
        item_discount_total: parseDbNumber(quote.item_discount_total),
        general_discount_total: parseDbNumber(quote.general_discount_total),
        discount_total: parseDbNumber(quote.discount_total),
        total_final: parseDbNumber(quote.total_final),
      }));
    },
  });
  const selectedSavedQuote = savedQuotesQuery.data?.find(quote => quote.id === selectedQuoteId) ?? null;

  useEffect(() => {
    if (!projectParam || selectedProjectId || !projectsQuery.data?.some(project => project.id === projectParam)) return;
    setSelectedProjectId(projectParam);
  }, [projectParam, projectsQuery.data, selectedProjectId]);

  const brandsQuery = useQuery({
    queryKey: ['price-brands', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Brand[]> => {
      const { data, error } = await supabase
        .from('price_brands')
        .select('id, name')
        .eq('tenant_id', tenantId!)
        .order('name');

      if (error) throw error;
      return (data ?? []) as Brand[];
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ['price-categories', tenantId, state.brandId],
    enabled: !!tenantId && !!state.brandId,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('price_categories')
        .select('id, name')
        .eq('tenant_id', tenantId!)
        .eq('brand_id', state.brandId!)
        .order('name');

      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  const productsQuery = useQuery({
    queryKey: ['price-products', tenantId, state.brandId, state.categoryId, debouncedProductSearch],
    enabled: !!tenantId && !!state.brandId && !!state.categoryId,
    queryFn: async (): Promise<Product[]> => {
      let query = supabase
        .from('price_products')
        .select('id, brand_id, category_id, name, reference_code')
        .eq('tenant_id', tenantId!)
        .eq('brand_id', state.brandId!)
        .eq('category_id', state.categoryId!)
        .order('name')
        .limit(80);

      if (debouncedProductSearch.length >= 2) {
        const term = debouncedProductSearch.replace(/[%_,]/g, '');
        query = query.or(`name.ilike.%${term}%,reference_code.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const selectedProductQuery = useQuery({
    queryKey: ['price-product', tenantId, state.productId],
    enabled: !!tenantId && !!state.productId,
    queryFn: async (): Promise<Product | null> => {
      const { data, error } = await supabase
        .from('price_products')
        .select('id, brand_id, category_id, name, reference_code')
        .eq('tenant_id', tenantId!)
        .eq('id', state.productId!)
        .maybeSingle();

      if (error) throw error;
      return data as Product | null;
    },
  });

  const productSummaryQuery = useQuery({
    queryKey: ['price-product-summary', tenantId, state.productId],
    enabled: !!tenantId && !!state.productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('price_search_index')
        .select('price, variation_id, finish_id')
        .eq('tenant_id', tenantId!)
        .eq('product_id', state.productId!);

      if (error) throw error;
      return summarizeProductPrices((data ?? []) as ProductSummaryRow[]);
    },
  });

  const variationsQuery = useQuery({
    queryKey: ['price-variations', tenantId, state.productId],
    enabled: !!tenantId && !!state.productId,
    queryFn: async (): Promise<Variation[]> => {
      const { data, error } = await supabase
        .from('price_product_variations')
        .select('id, product_id, variation_name, variation_code, dimensions')
        .eq('tenant_id', tenantId!)
        .eq('product_id', state.productId!)
        .order('variation_code');

      if (error) throw error;
      return (data ?? []) as Variation[];
    },
  });

  const finishesQuery = useQuery({
    queryKey: ['price-finishes', tenantId, state.variationId],
    enabled: !!tenantId && !!state.variationId,
    queryFn: async (): Promise<FinishPrice[]> => {
      const { data, error } = await supabase
        .from('price_search_index')
        .select('price_id, brand_id, finish_id, finish_name, finish_type, finish_code, base_price, price, currency')
        .eq('tenant_id', tenantId!)
        .eq('variation_id', state.variationId!)
        .order('price');

      if (error) throw error;
      return (data ?? []) as FinishPrice[];
    },
  });

  const searchQuery = useQuery({
    queryKey: ['price-search', tenantId, debouncedGlobalSearch],
    enabled: !!tenantId && debouncedGlobalSearch.length >= 2,
    queryFn: async (): Promise<SearchResult[]> => {
      const term = debouncedGlobalSearch.replace(/[%_,]/g, '');
      const { data, error } = await supabase
        .from('price_search_index')
        .select('price_id, brand_id, brand_name, category_id, category_name, product_id, product_name, reference_code, variation_id, variation_name, variation_code, finish_id, finish_name, finish_code, price, currency')
        .eq('tenant_id', tenantId!)
        .or(`product_name.ilike.%${term}%,reference_code.ilike.%${term}%,variation_name.ilike.%${term}%,variation_code.ilike.%${term}%,finish_name.ilike.%${term}%,finish_code.ilike.%${term}%`)
        .order('product_name')
        .limit(12);

      if (error) throw error;
      return (data ?? []) as SearchResult[];
    },
  });

  const selectedBrand = brandsQuery.data?.find(brand => brand.id === state.brandId);
  const selectedCategory = categoriesQuery.data?.find(category => category.id === state.categoryId);
  const selectedProduct = selectedProductQuery.data ?? productsQuery.data?.find(product => product.id === state.productId);
  const selectedVariation = variationsQuery.data?.find(variation => variation.id === state.variationId);
  const productSummary = productSummaryQuery.data;
  const finishPrices = finishesQuery.data ?? [];

  const finishMarkupRulesQuery = useQuery({
    queryKey: ['price-finish-markup-rules', state.brandId],
    enabled: !!state.brandId,
    queryFn: async (): Promise<FinishMarkupRule[]> => {
      const { data, error } = await (supabase as any)
        .from('price_finish_markup_rules')
        .select('id, brand_id, finish_label, finish_key, markup_percent, is_active, updated_at')
        .eq('brand_id', state.brandId!)
        .order('finish_label');

      if (error) {
        if (isFinishMarkupRulesTableMissing(error)) return getLocalFinishMarkupRules(state.brandId!);
        throw error;
      }
      return (data ?? []) as FinishMarkupRule[];
    },
  });
  const finishMarkupRules = finishMarkupRulesQuery.data ?? [];
  const activeFinishMarkupRules = finishMarkupRules.filter(rule => rule.is_active);
  const selectedStructuralMarkupRule = activeFinishMarkupRules.find(rule => rule.id === selectedStructuralMarkupRuleId) || null;
  const canUseStructuralMarkup = true;
  const showInactiveMarkupWarning = false;

  useEffect(() => {
    const refreshRules = () => {
      if (state.brandId) void finishMarkupRulesQuery.refetch();
    };
    window.addEventListener('focus', refreshRules);
    window.addEventListener('price-finish-markup-rules-updated', refreshRules);
    return () => {
      window.removeEventListener('focus', refreshRules);
      window.removeEventListener('price-finish-markup-rules-updated', refreshRules);
    };
  }, [finishMarkupRulesQuery, state.brandId]);

  useEffect(() => {
    setSelectedStructuralMarkupRuleId('none');
  }, [state.brandId, state.categoryId, state.productId, state.variationId]);

  useEffect(() => {
    if (!canUseStructuralMarkup || !activeFinishMarkupRules.some(rule => rule.id === selectedStructuralMarkupRuleId)) {
      setSelectedStructuralMarkupRuleId('none');
    }
  }, [activeFinishMarkupRules, canUseStructuralMarkup, selectedStructuralMarkupRuleId]);

  const priceExtremes = useMemo(() => {
    if (finishPrices.length === 0) return { min: null as number | null, max: null as number | null };
    const values = finishPrices.map(item => applyStructuralMarkup(item, canUseStructuralMarkup ? selectedStructuralMarkupRule : null).finalPrice);
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [finishPrices, selectedStructuralMarkupRule, canUseStructuralMarkup]);

  const quoteTotals = useMemo(
    () => calculateQuoteTotals(quoteItems, generalDiscountType, numberValue(generalDiscountValue)),
    [generalDiscountType, generalDiscountValue, quoteItems]
  );

  const topAreaM2 = useMemo(() => {
    const width = Number(topWidthCm.replace(',', '.'));
    const depth = Number(topDepthCm.replace(',', '.'));
    if (!Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0) return null;
    return (width * depth) / 10000;
  }, [topWidthCm, topDepthCm]);

  const applySearchResult = (result: SearchResult) => {
    setState({
      brandId: result.brand_id,
      categoryId: result.category_id,
      productId: result.product_id,
      variationId: result.variation_id,
      selectedPriceId: result.price_id,
    });
    setProductSearch('');
    setGlobalSearch('');
  };

  const clearConsultation = () => {
    setState(resetPriceConsultationState());
    setProductSearch('');
    setGlobalSearch('');
  };

  const copyPrice = async (item: FinishPrice) => {
    const priced = applyStructuralMarkup(item, canUseStructuralMarkup ? selectedStructuralMarkupRule : null);
    const extra = priced.markupPercent ? ` (base ${formatCurrencyBRL(priced.basePrice)} + ${priced.markupPercent}%)` : '';
    const text = `${item.finish_name}: ${formatCurrencyBRL(priced.finalPrice)}${extra}`;
    await navigator.clipboard.writeText(text);
    toast.success('Valor copiado');
  };

  const isSquareMeterTop = (item: FinishPrice) => {
    const text = `${item.finish_name} ${selectedVariation?.variation_name ?? ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    return (text.includes('TAMPO') || text.includes('VIDRO FUSING')) && (text.includes('METRO QUADRADO') || text.includes('M2'));
  };

  const addQuoteItem = (item: FinishPrice) => {
    if (!selectedProduct || !selectedVariation) return;
    const squareMeter = isSquareMeterTop(item);
    if (squareMeter && !topAreaM2) {
      toast.error('Informe largura e profundidade do tampo em centimetros.');
      return;
    }

    const width = squareMeter ? Number(topWidthCm.replace(',', '.')) : null;
    const depth = squareMeter ? Number(topDepthCm.replace(',', '.')) : null;
    const area = squareMeter ? topAreaM2 : null;
    const priced = applyStructuralMarkup(item, canUseStructuralMarkup ? selectedStructuralMarkupRule : null);
    const unitPrice = squareMeter && area ? priced.finalPrice * area : priced.finalPrice;

    setQuoteItems(prev => {
      const nextItem = recalculateQuoteItem({
        id: crypto.randomUUID(),
        savedItemId: null,
        priceId: item.price_id,
        brandId: item.brand_id || state.brandId,
        brandName: selectedBrand?.name || '',
        categoryId: state.categoryId,
        categoryName: selectedCategory?.name || '',
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        referenceCode: selectedProduct.reference_code,
        variationId: selectedVariation.id,
        variationCode: selectedVariation.variation_code,
        variationName: selectedVariation.variation_name,
        finishId: item.finish_id,
        finishCode: item.finish_code,
        finishName: item.finish_name,
        baseUnitPrice: priced.basePrice,
        unitPrice,
        quantity: 1,
        discountType: 'none',
        discountValue: 0,
        discountAmount: 0,
        subtotalBeforeDiscount: 0,
        subtotalAfterDiscount: 0,
        itemNotes: '',
        finishMarkupLabel: priced.markupLabel,
        finishMarkupPercent: priced.markupPercent,
        areaM2: area,
        widthCm: width,
        depthCm: depth,
      });
      return [...prev, nextItem];
    });
    toast.success(squareMeter ? 'Tampo adicionado a cotacao.' : 'Item adicionado a cotacao.');
  };

  const updateQuoteItem = (itemId: string, changes: Partial<QuoteItem>) => {
    setQuoteItems(prev => prev.map(item => (
      item.id === itemId ? recalculateQuoteItem({ ...item, ...changes }) : item
    )));
  };

  const startNewQuote = () => {
    setSelectedQuoteId(null);
    setQuoteItems([]);
    setQuoteStatus('rascunho');
    setInternalNotes('');
    setCommercialTerms('');
    setGeneralDiscountType('none');
    setGeneralDiscountValue('');
  };

  const quoteItemFromDb = (item: SavedQuoteItem): QuoteItem => recalculateQuoteItem({
    id: item.id,
    savedItemId: item.id,
    priceId: item.price_id || '',
    brandId: item.price_brand_id,
    brandName: item.brand_name || '',
    categoryId: item.price_category_id,
    categoryName: item.category_name || '',
    productId: item.price_product_id || '',
    productName: item.product_name,
    referenceCode: item.sku,
    variationId: item.price_variation_id || '',
    variationCode: item.sku || '',
    variationName: item.variation_name || '',
    finishId: item.price_finish_id || '',
    finishCode: '',
    finishName: item.finish_name || '',
    baseUnitPrice: parseDbNumber(item.unit_price),
    unitPrice: parseDbNumber(item.unit_price),
    quantity: parseDbNumber(item.quantity) || 1,
    discountType: item.discount_type || 'none',
    discountValue: parseDbNumber(item.discount_value),
    discountAmount: parseDbNumber(item.discount_amount),
    subtotalBeforeDiscount: parseDbNumber(item.subtotal_before_discount),
    subtotalAfterDiscount: parseDbNumber(item.subtotal_after_discount),
    itemNotes: item.item_notes || '',
    finishMarkupLabel: null,
    finishMarkupPercent: null,
    areaM2: null,
    widthCm: null,
    depthCm: null,
  });

  const loadSavedQuote = async (quote: SavedQuote) => {
    const { data, error } = await (supabase as any)
      .from('quote_items')
      .select('*')
      .eq('quote_id', quote.id)
      .order('sort_order', { ascending: true });

    if (error) {
      toast.error('Nao foi possivel carregar a cotacao.');
      return;
    }

    setSelectedProjectId(quote.project_id);
    setSelectedQuoteId(quote.id);
    setQuoteStatus(quote.status);
    setInternalNotes(quote.internal_notes || '');
    setCommercialTerms(quote.commercial_terms || '');
    setGeneralDiscountType(quote.general_discount_type || 'none');
    setGeneralDiscountValue(quote.general_discount_type === 'none' ? '' : String(parseDbNumber(quote.general_discount_value)));
    setQuoteItems(((data ?? []) as SavedQuoteItem[]).map(quoteItemFromDb));
  };

  const buildQuoteItemPayload = (quoteId: string, item: QuoteItem, index: number) => ({
    quote_id: quoteId,
    project_id: selectedProjectId,
    tenant_id: tenantId,
    price_id: item.priceId || null,
    price_product_id: item.productId || null,
    price_brand_id: item.brandId || null,
    price_category_id: item.categoryId || null,
    price_variation_id: item.variationId || null,
    price_finish_id: item.finishId || null,
    product_name: item.productName,
    brand_name: item.brandName || null,
    sku: item.referenceCode || item.variationCode || null,
    image_url: null,
    category_name: item.categoryName || null,
    finish_name: item.finishName || null,
    variation_name: item.variationName || null,
    unit_price: item.unitPrice,
    quantity: item.quantity,
    discount_type: item.discountType,
    discount_value: item.discountValue,
    item_notes: item.itemNotes || null,
    sort_order: index,
  });

  const saveQuote = async () => {
    if (!user || !tenantId) return;
    if (!selectedProjectId || !selectedProject) {
      toast.error('Selecione um projeto para salvar a cotacao.');
      return;
    }
    if (quoteItems.length === 0) {
      toast.error('Adicione pelo menos um item antes de salvar.');
      return;
    }

    setIsSavingQuote(true);
    try {
      const headerPayload = {
        project_id: selectedProjectId,
        customer_id: selectedProject.crm_customer_id || null,
        tenant_id: tenantId,
        responsible_user_id: selectedQuoteId && selectedSavedQuote ? selectedSavedQuote.responsible_user_id : user.id,
        status: quoteStatus,
        internal_notes: internalNotes.trim() || null,
        commercial_terms: commercialTerms.trim() || null,
        general_discount_type: generalDiscountType,
        general_discount_value: generalDiscountType === 'none' ? 0 : numberValue(generalDiscountValue),
        subtotal_gross: quoteTotals.subtotalGross,
        item_discount_total: quoteTotals.itemDiscountTotal,
        general_discount_total: quoteTotals.generalDiscountTotal,
        discount_total: quoteTotals.discountTotal,
        total_final: quoteTotals.totalFinal,
      };

      const quoteRequest = selectedQuoteId
        ? (supabase as any).from('quotes').update(headerPayload).eq('id', selectedQuoteId).select('id, quote_number').single()
        : (supabase as any).from('quotes').insert(headerPayload).select('id, quote_number').single();
      const { data: savedQuote, error: quoteError } = await quoteRequest;
      if (quoteError) throw quoteError;

      const quoteId = savedQuote.id as string;
      const { error: deleteError } = await (supabase as any).from('quote_items').delete().eq('quote_id', quoteId);
      if (deleteError) throw deleteError;

      const itemPayloads = quoteItems.map((item, index) => buildQuoteItemPayload(quoteId, item, index));
      const { error: itemError } = await (supabase as any).from('quote_items').insert(itemPayloads);
      if (itemError) throw itemError;

      setSelectedQuoteId(quoteId);
      await queryClient.invalidateQueries({ queryKey: ['project-quotes', selectedProjectId] });
      toast.success(`Cotacao ${savedQuote.quote_number || ''} salva.`);
    } catch (error) {
      console.error('Quote save error:', error);
      toast.error('Nao foi possivel salvar a cotacao.');
    } finally {
      setIsSavingQuote(false);
    }
  };

  const duplicateQuote = async (quote: SavedQuote) => {
    await loadSavedQuote(quote);
    setSelectedQuoteId(null);
    setQuoteStatus('rascunho');
    toast.success('Cotacao duplicada. Revise e clique em Salvar para gravar a copia.');
  };

  const archiveQuote = async (quote: SavedQuote) => {
    if (!window.confirm('Arquivar esta cotacao?')) return;
    const { error } = await (supabase as any)
      .from('quotes')
      .update({ archived_at: new Date().toISOString(), archived_by: user?.id })
      .eq('id', quote.id);
    if (error) {
      toast.error('Nao foi possivel arquivar.');
      return;
    }
    if (selectedQuoteId === quote.id) startNewQuote();
    await queryClient.invalidateQueries({ queryKey: ['project-quotes', quote.project_id] });
    toast.success('Cotacao arquivada.');
  };

  const deleteQuote = async (quote: SavedQuote) => {
    if (!window.confirm('Excluir definitivamente esta cotacao?')) return;
    const { error } = await (supabase as any).from('quotes').delete().eq('id', quote.id);
    if (error) {
      toast.error('Nao foi possivel excluir.');
      return;
    }
    if (selectedQuoteId === quote.id) startNewQuote();
    await queryClient.invalidateQueries({ queryKey: ['project-quotes', quote.project_id] });
    toast.success('Cotacao excluida.');
  };

  const generateQuotePdf = async () => {
    if (!selectedProject || quoteItems.length === 0) {
      toast.error('Selecione um projeto e adicione itens para gerar o PDF.');
      return;
    }

    setIsGeneratingQuotePdf(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'px', format: [794, 1123] });
      const pageW = 794;
      const pageH = 1123;
      const marginX = 58;
      const contentW = 678;
      const footerY = 1048;
      const colors = {
        paper: [246, 245, 242] as const,
        surface: [255, 255, 255] as const,
        black: [23, 23, 23] as const,
        primary: [21, 21, 21] as const,
        secondary: [111, 106, 96] as const,
        muted: [154, 147, 136] as const,
        gold: [184, 137, 59] as const,
        border: [230, 225, 216] as const,
        softGold: [216, 200, 170] as const,
      };

      type PdfImage = { dataUrl: string; width: number; height: number };

      const loadImage = (url: string): Promise<PdfImage | null> => new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0);
          resolve({
            dataUrl: canvas.toDataURL('image/png'),
            width: img.naturalWidth || canvas.width,
            height: img.naturalHeight || canvas.height,
          });
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });

      const tenantLogo = tenantQuery.data?.logo_url ? await loadImage(tenantQuery.data.logo_url) : null;
      const logo = tenantLogo ?? await loadImage(logoYleon);
      const quoteNumber = selectedSavedQuote?.quote_number || 'Nova cotacao';
      const quoteDate = new Date(selectedSavedQuote?.created_at || Date.now()).toLocaleDateString('pt-BR');

      const setFill = (color: readonly [number, number, number]) => doc.setFillColor(color[0], color[1], color[2]);
      const setDraw = (color: readonly [number, number, number]) => doc.setDrawColor(color[0], color[1], color[2]);
      const setText = (color: readonly [number, number, number]) => doc.setTextColor(color[0], color[1], color[2]);
      const safeText = (value?: string | null) => value?.trim() || '-';
      const splitText = (value: string, width: number): string[] => {
        const lines = doc.splitTextToSize(value, width);
        return Array.isArray(lines) ? lines : [String(lines)];
      };

      const drawContainedImage = (image: PdfImage, x: number, y: number, width: number, height: number) => {
        const ratio = Math.min(width / image.width, height / image.height);
        const drawW = image.width * ratio;
        const drawH = image.height * ratio;
        const drawX = x + (width - drawW) / 2;
        const drawY = y + (height - drawH) / 2;
        doc.addImage(image.dataUrl, 'PNG', drawX, drawY, drawW, drawH);
      };

      const drawBackground = () => {
        setFill(colors.paper);
        doc.rect(0, 0, pageW, pageH, 'F');
      };

      const drawHeader = (withInfoCard: boolean) => {
        drawBackground();
        setDraw(colors.gold);
        doc.setLineWidth(1);
        doc.line(marginX, 42, marginX + contentW, 42);

        if (logo) drawContainedImage(logo, marginX, 74, 120, 62);

        doc.setFont('times', 'bold');
        doc.setFontSize(24);
        setText(colors.primary);
        doc.text('ORCAMENTO COMERCIAL', marginX + contentW, 95, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        setText(colors.secondary);
        doc.text(quoteNumber, marginX + contentW, 120, { align: 'right' });

        if (!withInfoCard) return 170;

        const cardY = 174;
        setFill(colors.surface);
        setDraw(colors.border);
        doc.roundedRect(marginX, cardY, contentW, 136, 8, 8, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        setText(colors.gold);
        doc.text('LOJA', marginX + 20, cardY + 30);
        doc.text('CLIENTE / PROJETO', marginX + 360, cardY + 30);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        setText(colors.primary);
        doc.text(splitText(safeText(tenantQuery.data?.name || 'YLEON'), 280), marginX + 20, cardY + 50);
        doc.text(splitText(safeText(selectedProject.client_name || 'Cliente nao informado'), 280), marginX + 360, cardY + 50);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        setText(colors.secondary);
        doc.text(`Data: ${quoteDate}`, marginX + 20, cardY + 76);
        doc.text(`Vendedor: ${safeText(selectedProject.consultant_name)}`, marginX + 20, cardY + 98);
        doc.text(splitText(`Projeto: ${safeText(selectedProject.name)}`, 280), marginX + 360, cardY + 76);
        doc.text(splitText(`Arquiteto: ${safeText(selectedProject.architect_name)}`, 280), marginX + 360, cardY + 98);

        return 346;
      };

      let y = drawHeader(true);

      const columns = {
        item: { x: marginX, w: 380 },
        qty: { x: marginX + 380, w: 54 },
        unit: { x: marginX + 434, w: 84 },
        discount: { x: marginX + 518, w: 64 },
        total: { x: marginX + 582, w: 96 },
      };

      const drawTableHeader = () => {
        setFill(colors.black);
        doc.rect(marginX, y, contentW, 34, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text('ITEM', columns.item.x + 12, y + 21);
        doc.text('QTD', columns.qty.x + columns.qty.w / 2, y + 21, { align: 'center' });
        doc.text('UNIT.', columns.unit.x + columns.unit.w - 12, y + 21, { align: 'right' });
        doc.text('DESC.', columns.discount.x + columns.discount.w - 12, y + 21, { align: 'right' });
        doc.text('TOTAL', columns.total.x + columns.total.w - 12, y + 21, { align: 'right' });
        y += 40;
      };

      drawTableHeader();

      quoteItems.forEach((item, index) => {
        const titleLines = splitText(`${index + 1}. ${item.productName}`, columns.item.w - 24).slice(0, 2);
        const meta = [item.brandName, item.categoryName, item.variationName, item.finishName].filter(Boolean).join(' / ');
        const metaLines = splitText(meta || '-', columns.item.w - 24).slice(0, 2);
        const noteLines = item.itemNotes ? splitText(`Obs.: ${item.itemNotes}`, columns.item.w - 24).slice(0, 1) : [];
        const rowH = Math.max(64, 24 + (titleLines.length * 12) + (metaLines.length * 10) + (noteLines.length * 10));

        if (y + rowH > footerY - 18) {
          doc.addPage();
          y = drawHeader(false);
          drawTableHeader();
        }

        setFill(colors.surface);
        setDraw(colors.border);
        doc.roundedRect(marginX, y, contentW, rowH, 6, 6, 'FD');

        let textY = y + 20;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        setText(colors.primary);
        doc.text(titleLines, columns.item.x + 12, textY);
        textY += titleLines.length * 12 + 5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        setText(colors.secondary);
        doc.text(metaLines, columns.item.x + 12, textY);
        textY += metaLines.length * 10 + 4;

        if (noteLines.length > 0) {
          doc.setFontSize(7.5);
          setText(colors.muted);
          doc.text(noteLines, columns.item.x + 12, textY);
        }

        const numberY = y + 24;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        setText(colors.primary);
        doc.text(String(item.quantity), columns.qty.x + columns.qty.w / 2, numberY, { align: 'center' });
        doc.text(formatCurrencyBRL(item.unitPrice), columns.unit.x + columns.unit.w - 12, numberY, { align: 'right' });
        doc.text(formatCurrencyBRL(item.discountAmount), columns.discount.x + columns.discount.w - 12, numberY, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(formatCurrencyBRL(item.subtotalAfterDiscount), columns.total.x + columns.total.w - 12, numberY, { align: 'right' });

        y += rowH + 3;
      });

      if (y + 190 > footerY) {
        doc.addPage();
        y = drawHeader(false);
      }

      y += 14;
      const summaryX = 458;
      setFill(colors.surface);
      setDraw(colors.border);
      doc.roundedRect(summaryX, y, 278, 160, 8, 8, 'FD');
      const summaryRows = [
        ['Subtotal bruto', quoteTotals.subtotalGross],
        ['Descontos itens', quoteTotals.itemDiscountTotal],
        ['Desconto geral', quoteTotals.generalDiscountTotal],
        ['Total final', quoteTotals.totalFinal],
      ] as const;
      summaryRows.forEach(([label, value], index) => {
        const lineY = y + 34 + index * 30;
        doc.setFont('helvetica', index === summaryRows.length - 1 ? 'bold' : 'normal');
        doc.setFontSize(index === summaryRows.length - 1 ? 13 : 9);
        setText(index === summaryRows.length - 1 ? colors.gold : colors.primary);
        doc.text(label, summaryX + 20, lineY);
        doc.text(formatCurrencyBRL(value), summaryX + 258, lineY, { align: 'right' });
      });

      if (commercialTerms) {
        const conditionsY = y + 184;
        if (conditionsY + 110 > footerY) {
          doc.addPage();
          y = drawHeader(false);
        } else {
          y = conditionsY;
        }
        const conditionLines = splitText(commercialTerms, contentW - 36);
        const cardH = Math.min(180, Math.max(76, 46 + conditionLines.length * 12));
        setFill(colors.surface);
        setDraw(colors.border);
        doc.roundedRect(marginX, y, contentW, cardH, 8, 8, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        setText(colors.gold);
        doc.text('CONDICOES COMERCIAIS', marginX + 18, y + 26);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        setText(colors.primary);
        doc.text(conditionLines.slice(0, 10), marginX + 18, y + 50, { lineHeightFactor: 1.4 });
      }

      const totalPages = doc.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        doc.setPage(page);
        setDraw(colors.softGold);
        doc.setLineWidth(1);
        doc.line(marginX, footerY, marginX + contentW, footerY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        setText(colors.secondary);
        doc.text(tenantQuery.data?.name || 'YLEON', marginX, footerY + 24);
        doc.text(`Pagina ${page} de ${totalPages}`, marginX + contentW, footerY + 24, { align: 'right' });
      }

      doc.save(`${selectedProject.name.replace(/\s+/g, '_')}_${quoteNumber.replace(/\s+/g, '_')}.pdf`);
      toast.success('PDF da cotacao gerado.');
    } catch (error) {
      console.error('Quote PDF error:', error);
      toast.error('Nao foi possivel gerar o PDF.');
    } finally {
      setIsGeneratingQuotePdf(false);
    }
  };

  const copyQuoteTotal = async () => {
    const lines = quoteItems.map(item => {
      const measure = item.areaM2 ? ` (${item.widthCm}x${item.depthCm} cm / ${item.areaM2.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m2)` : '';
      const markup = item.finishMarkupPercent ? ` | Estrutura ${item.finishMarkupLabel}: Base ${formatCurrencyBRL(item.baseUnitPrice)} + ${item.finishMarkupPercent}%` : '';
      return `${item.productName} - ${item.finishName}${measure}${markup}: ${formatCurrencyBRL(item.subtotalAfterDiscount)}`;
    });
    lines.push(`Subtotal bruto: ${formatCurrencyBRL(quoteTotals.subtotalGross)}`);
    lines.push(`Descontos: ${formatCurrencyBRL(quoteTotals.discountTotal)}`);
    lines.push(`Total: ${formatCurrencyBRL(quoteTotals.totalFinal)}`);
    await navigator.clipboard.writeText(lines.join('\n'));
    toast.success('Cotacao copiada.');
  };

  const handleBrandChange = (brandId: string) => {
    setState({ brandId, categoryId: null, productId: null, variationId: null, selectedPriceId: null });
    setProductSearch('');
  };

  const handleCategoryChange = (categoryId: string) => {
    setState(prev => ({ ...prev, categoryId, productId: null, variationId: null, selectedPriceId: null }));
    setProductSearch('');
  };

  const handleProductChange = (productId: string) => {
    setState(prev => ({ ...prev, productId, variationId: null, selectedPriceId: null }));
  };

  const handleVariationChange = (variationId: string) => {
    setState(prev => ({ ...prev, variationId, selectedPriceId: null }));
  };

  const canAccessQuote = isAdmin || isManager || isSeller || isFinance;
  if (!loading && !canAccessQuote) return <Navigate to="/catalog" replace />;

  if (tenantQuery.isLoading) {
    return (
      <main className="min-h-screen bg-background px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <LoadingLine />
        </div>
      </main>
    );
  }

  if (!tenantId) {
    return (
      <main className="min-h-screen bg-background px-6 py-8">
        <div className="mx-auto max-w-3xl">
          <EmptyState
            title="Cotacao sem dados"
            description="Nao encontramos a tabela de precos da YLEON. Peca para um administrador importar ou revisar os dados de cotacao."
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{tenantQuery.data?.name}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground sm:text-3xl">Cota&ccedil;&atilde;o</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Consulte produtos, variacoes e acabamentos com valores prontos para apresentar ao cliente.
            </p>
          </div>
          <Button variant="outline" onClick={clearConsultation} className="w-full gap-2 sm:w-auto">
            <Eraser size={16} />
            Limpar consulta
          </Button>
        </section>

        <section className="relative">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={globalSearch}
              onChange={event => setGlobalSearch(event.target.value)}
              placeholder="Buscar por produto, referencia, variacao ou acabamento"
              className="h-12 pl-10"
            />
            {searchQuery.isFetching && (
              <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {debouncedGlobalSearch.length >= 2 && (
            <div className="absolute left-0 right-0 top-14 z-30 overflow-hidden rounded-md border bg-popover shadow-lg">
              {searchQuery.isLoading ? (
                <div className="p-4">
                  <LoadingLine />
                </div>
              ) : searchQuery.data && searchQuery.data.length > 0 ? (
                <div className="max-h-96 divide-y overflow-auto">
                  {searchQuery.data.map(result => (
                    <button
                      key={result.price_id}
                      type="button"
                      onClick={() => applySearchResult(result)}
                      className="flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted"
                    >
                      <span className="text-sm font-medium text-foreground">{result.product_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {result.brand_name} / {result.category_name} / {result.variation_code} / {result.finish_name}
                      </span>
                      <span className="text-xs font-semibold text-foreground">{formatCurrencyBRL(result.price)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-4">
                  <EmptyState title="Nenhum resultado encontrado" description="Tente buscar por outro nome, referencia ou acabamento." />
                </div>
              )}
            </div>
          )}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Projeto e cotações salvas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <select
                  value={selectedProjectId}
                  onChange={event => {
                    setSelectedProjectId(event.target.value);
                    startNewQuote();
                  }}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  <option value="">Selecione um projeto</option>
                  {projectsQuery.data?.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name}{project.client_name ? ` - ${project.client_name}` : ''}
                    </option>
                  ))}
                </select>
                <Button type="button" variant="outline" onClick={startNewQuote} disabled={!selectedProjectId}>
                  <Plus size={16} />
                  Nova cotação
                </Button>
              </div>

              {projectsQuery.isLoading ? (
                <LoadingLine />
              ) : !selectedProjectId ? (
                <EmptyState title="Escolha um projeto" description="A cotação ficará salva dentro do projeto selecionado, sem entrar na apresentação." />
              ) : savedQuotesQuery.isLoading ? (
                <LoadingLine />
              ) : savedQuotesQuery.data?.length === 0 ? (
                <EmptyState title="Nenhuma cotação salva" description="Monte os itens e clique em Salvar cotação para registrar o orçamento." />
              ) : (
                <div className="max-h-52 space-y-2 overflow-auto pr-1">
                  {savedQuotesQuery.data?.map(quote => (
                    <div key={quote.id} className={`rounded-md border p-3 ${selectedQuoteId === quote.id ? 'border-primary bg-primary/5' : 'bg-muted/20'}`}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <button type="button" className="text-left" onClick={() => void loadSavedQuote(quote)}>
                          <p className="text-sm font-medium text-foreground">{quote.quote_number}</p>
                          <p className="text-xs text-muted-foreground">
                            {QUOTE_STATUS_OPTIONS.find(option => option.value === quote.status)?.label || quote.status} / {formatCurrencyBRL(quote.total_final)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(quote.created_at).toLocaleDateString('pt-BR')}
                          </p>
                        </button>
                        <div className="flex gap-1">
                          <Button type="button" variant="ghost" size="icon" onClick={() => void duplicateQuote(quote)} title="Duplicar">
                            <Copy size={15} />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => void archiveQuote(quote)} title="Arquivar">
                            <Archive size={15} />
                          </Button>
                          {canManageAllQuotes && (
                            <Button type="button" variant="ghost" size="icon" onClick={() => void deleteQuote(quote)} title="Excluir">
                              <Trash2 size={15} />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{selectedSavedQuote?.quote_number || 'Cotação em edição'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-muted-foreground">
                  Status
                  <select
                    value={quoteStatus}
                    onChange={event => setQuoteStatus(event.target.value as QuoteStatus)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    {QUOTE_STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  Desconto geral
                  <div className="grid grid-cols-[96px_1fr] gap-2">
                    <select
                      value={generalDiscountType}
                      onChange={event => setGeneralDiscountType(event.target.value as DiscountType)}
                      className="h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                    >
                      {DISCOUNT_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <Input
                      value={generalDiscountValue}
                      onChange={event => setGeneralDiscountValue(event.target.value)}
                      disabled={generalDiscountType === 'none'}
                      inputMode="decimal"
                      placeholder="0"
                    />
                  </div>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Textarea
                  value={internalNotes}
                  onChange={event => setInternalNotes(event.target.value)}
                  placeholder="Observações internas"
                  className="min-h-20"
                />
                <Textarea
                  value={commercialTerms}
                  onChange={event => setCommercialTerms(event.target.value)}
                  placeholder="Condições comerciais"
                  className="min-h-20"
                />
              </div>

              <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal bruto</span><strong>{formatCurrencyBRL(quoteTotals.subtotalGross)}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Descontos por item</span><strong>{formatCurrencyBRL(quoteTotals.itemDiscountTotal)}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Desconto geral</span><strong>{formatCurrencyBRL(quoteTotals.generalDiscountTotal)}</strong></div>
                <div className="flex justify-between border-t pt-2 text-base"><span>Total final</span><strong>{formatCurrencyBRL(quoteTotals.totalFinal)}</strong></div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" className="flex-1 gap-2" onClick={() => void saveQuote()} disabled={isSavingQuote || !selectedProjectId || quoteItems.length === 0}>
                  {isSavingQuote ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Salvar cotação
                </Button>
                <Button type="button" variant="outline" className="gap-2" onClick={() => void generateQuotePdf()} disabled={isGeneratingQuotePdf || quoteItems.length === 0}>
                  {isGeneratingQuotePdf ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                  PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Marca</CardTitle>
            </CardHeader>
            <CardContent>
              {brandsQuery.isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : brandsQuery.data?.length === 0 ? (
                <EmptyState title="Nenhuma marca cadastrada" description="Importe uma tabela de precos para iniciar a consulta." />
              ) : (
                <Select value={state.brandId ?? ''} onValueChange={handleBrandChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha a marca" />
                  </SelectTrigger>
                  <SelectContent>
                    {brandsQuery.data?.map(brand => (
                      <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Categoria</CardTitle>
            </CardHeader>
            <CardContent>
              {categoriesQuery.isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select value={state.categoryId ?? ''} onValueChange={handleCategoryChange} disabled={!state.brandId || categoriesQuery.data?.length === 0}>
                  <SelectTrigger>
                    <SelectValue placeholder={state.brandId ? 'Escolha a categoria' : 'Selecione uma marca'} />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriesQuery.data?.map(category => (
                      <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Produto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                value={productSearch}
                onChange={event => setProductSearch(event.target.value)}
                placeholder="Filtrar produto"
                disabled={!state.categoryId}
              />
              {productsQuery.isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select value={state.productId ?? ''} onValueChange={handleProductChange} disabled={!state.categoryId || productsQuery.data?.length === 0}>
                  <SelectTrigger>
                    <SelectValue placeholder={state.categoryId ? 'Escolha o produto' : 'Selecione uma categoria'} />
                  </SelectTrigger>
                  <SelectContent>
                    {productsQuery.data?.map(product => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.reference_code ? `${product.reference_code} - ${product.name}` : product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {state.categoryId && productsQuery.data?.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum produto encontrado.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Variacao</CardTitle>
            </CardHeader>
            <CardContent>
              {variationsQuery.isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select value={state.variationId ?? ''} onValueChange={handleVariationChange} disabled={!state.productId || variationsQuery.data?.length === 0}>
                  <SelectTrigger>
                    <SelectValue placeholder={state.productId ? 'Escolha a variacao' : 'Selecione um produto'} />
                  </SelectTrigger>
                  <SelectContent>
                    {variationsQuery.data?.map(variation => (
                      <SelectItem key={variation.id} value={variation.id}>
                        {variation.variation_code} - {variation.variation_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {state.productId && variationsQuery.data?.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">Nenhuma variacao disponivel.</p>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calculator size={18} />
                Composicao da cotacao
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {quoteItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Selecione acabamentos e adicione itens para somar tampo, base e outros componentes no valor final.
                </p>
              ) : (
                <div className="space-y-3">
                  {quoteItems.map(item => (
                    <div key={item.id} className="flex items-start justify-between gap-3 rounded-md border bg-muted/20 p-3">
                      <div className="min-w-0 flex-1 space-y-3">
                        <p className="text-sm font-medium text-foreground">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">{item.variationName}</p>
                        <p className="text-xs text-muted-foreground">{[item.brandName, item.categoryName, item.finishName].filter(Boolean).join(' / ')}</p>
                        <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                          <span>Valor base: <strong className="text-foreground">{formatCurrencyBRL(item.baseUnitPrice)}</strong></span>
                          <span>
                            Acréscimo: <strong className="text-foreground">
                              {item.finishMarkupPercent ? `${item.finishMarkupPercent}% (${item.finishMarkupLabel})` : 'Sem acréscimo'}
                            </strong>
                          </span>
                          <span>Valor final: <strong className="text-foreground">{formatCurrencyBRL(item.unitPrice)}</strong></span>
                        </div>
                        {item.areaM2 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.widthCm}x{item.depthCm} cm / {item.areaM2.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m2
                          </p>
                        )}
                        <div className="grid gap-2 sm:grid-cols-[0.7fr_1.4fr_1fr]">
                          <label className="space-y-1 text-xs text-muted-foreground">
                            Quantidade
                            <Input
                              value={String(item.quantity)}
                              onChange={event => updateQuoteItem(item.id, { quantity: numberValue(event.target.value) || 1 })}
                              inputMode="decimal"
                              className="h-9"
                            />
                          </label>
                          <label className="space-y-1 text-xs text-muted-foreground">
                            Desconto do item
                            <div className="grid grid-cols-[88px_1fr] gap-2">
                              <select
                                value={item.discountType}
                                onChange={event => updateQuoteItem(item.id, { discountType: event.target.value as DiscountType, discountValue: event.target.value === 'none' ? 0 : item.discountValue })}
                                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                              >
                                {DISCOUNT_OPTIONS.map(option => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                              <Input
                                value={item.discountType === 'none' ? '' : String(item.discountValue)}
                                onChange={event => updateQuoteItem(item.id, { discountValue: numberValue(event.target.value) })}
                                disabled={item.discountType === 'none'}
                                inputMode="decimal"
                                className="h-9"
                                placeholder="0"
                              />
                            </div>
                          </label>
                          <label className="space-y-1 text-xs text-muted-foreground">
                            Observação
                            <Input
                              value={item.itemNotes}
                              onChange={event => updateQuoteItem(item.id, { itemNotes: event.target.value })}
                              className="h-9"
                              placeholder="Opcional"
                            />
                          </label>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-start gap-2">
                        <div className="text-right">
                          <p className="text-[11px] text-muted-foreground">Subtotal</p>
                          <strong className="text-sm">{formatCurrencyBRL(item.subtotalAfterDiscount)}</strong>
                          {item.discountAmount > 0 && (
                            <p className="text-[11px] text-muted-foreground">-{formatCurrencyBRL(item.discountAmount)}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setQuoteItems(prev => prev.filter(next => next.id !== item.id))}
                          title="Remover item"
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="text-sm text-muted-foreground">Valor final</span>
                    <strong className="text-xl">{formatCurrencyBRL(quoteTotals.totalFinal)}</strong>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button className="flex-1 gap-2" onClick={copyQuoteTotal}>
                      <Clipboard size={16} />
                      Copiar cotacao
                    </Button>
                    <Button variant="outline" onClick={() => setQuoteItems([])}>
                      Limpar composicao
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Tampo por metro quadrado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Para itens identificados como tampo por m2, informe a medida em centimetros. O sistema multiplica o valor por m2 pela area e permite somar com a base.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  value={topWidthCm}
                  onChange={event => setTopWidthCm(event.target.value)}
                  placeholder="Largura cm"
                  inputMode="decimal"
                />
                <Input
                  value={topDepthCm}
                  onChange={event => setTopDepthCm(event.target.value)}
                  placeholder="Profundidade cm"
                  inputMode="decimal"
                />
              </div>
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                Area calculada: <strong>{topAreaM2 ? `${topAreaM2.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m2` : '-'}</strong>
              </div>
            </CardContent>
          </Card>
        </section>

        {selectedProduct && (
          <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">{selectedProduct.name}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[selectedBrand?.name, selectedCategory?.name, selectedProduct.reference_code].filter(Boolean).join(' / ')}
                    </p>
                  </div>
                  <Badge variant="outline" className="gap-1">
                    <Sparkles size={13} />
                    Resumo
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Faixa de preco</p>
                  <p className="mt-1 text-sm font-semibold">
                    {productSummary?.minPrice == null
                      ? 'Sem preco'
                      : `${formatCurrencyBRL(productSummary.minPrice)} a ${formatCurrencyBRL(productSummary.maxPrice ?? productSummary.minPrice)}`}
                  </p>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Variacoes</p>
                  <p className="mt-1 text-sm font-semibold">{productSummary?.variationCount ?? 0}</p>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Acabamentos</p>
                  <p className="mt-1 text-sm font-semibold">{productSummary?.finishCount ?? 0}</p>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Referencia</p>
                  <p className="mt-1 text-sm font-semibold">{selectedProduct.reference_code || 'Sem referencia'}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Leitura rapida</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Menor preco</span>
                  <strong>{productSummary?.minPrice == null ? '-' : formatCurrencyBRL(productSummary.minPrice)}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Maior preco</span>
                  <strong>{productSummary?.maxPrice == null ? '-' : formatCurrencyBRL(productSummary.maxPrice)}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Referencia</span>
                  <strong className="text-right">{selectedProduct.reference_code || '-'}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Variacao atual</span>
                  <strong className="text-right">{selectedVariation?.variation_code ?? '-'}</strong>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <span className="text-muted-foreground">Acrescimos estruturais da marca</span>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {activeFinishMarkupRules.length
                      ? activeFinishMarkupRules.map(rule => `${rule.finish_label} +${Number(rule.markup_percent).toLocaleString('pt-BR')}%`).join(', ')
                      : 'Nenhuma regra ativa para esta marca'}
                  </p>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <span className="text-muted-foreground">Aplicacao</span>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    Escolha manual do vendedor na cotacao
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        <section>
          {!state.productId ? (
            <EmptyState title="Escolha um produto" description="Use a busca global ou os filtros para iniciar a consulta." />
          ) : variationsQuery.data?.length === 0 ? (
            <EmptyState title="Nenhuma variacao disponivel" description="Este produto ainda nao possui variacoes cadastradas na tabela de precos." />
          ) : !state.variationId ? (
            <EmptyState title="Escolha uma variacao" description="Os acabamentos com preco aparecem em cards depois da selecao da variacao." />
          ) : finishesQuery.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-40 w-full" />
              ))}
            </div>
          ) : finishPrices.length === 0 ? (
            <EmptyState title="Nenhum acabamento com preco cadastrado" description="A variacao escolhida ainda nao tem valores publicados." />
          ) : (
            <div className="space-y-4">
              {showInactiveMarkupWarning && activeFinishMarkupRules.length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
                  Existe regra ativa para esta marca, mas nenhum acabamento desta variação bateu com ela. Confira se o acabamento importado contém termos como Laca, Laqueado, Couro ou Tecido.
                </div>
              )}
              {canUseStructuralMarkup && activeFinishMarkupRules.length > 0 && (
                <div className="rounded-md border border-border bg-card p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Acabamento estrutural do produto</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Os valores de tecido/categoria abaixo sao a base em laminado. Escolha Laca apenas quando o cliente quiser a estrutura em laca.
                      </p>
                    </div>
                    <Select value={selectedStructuralMarkupRuleId} onValueChange={setSelectedStructuralMarkupRuleId}>
                      <SelectTrigger className="w-full lg:w-72">
                        <SelectValue placeholder="Estrutura" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Laminado / base sem acrescimo</SelectItem>
                        {activeFinishMarkupRules.map(rule => (
                          <SelectItem key={rule.id} value={rule.id}>
                            {rule.finish_label} +{Number(rule.markup_percent).toLocaleString('pt-BR')}%
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              {showInactiveMarkupWarning && !canUseStructuralMarkup && activeFinishMarkupRules.length > 0 && (
                <div className="rounded-md border border-muted bg-muted/20 p-3 text-sm text-muted-foreground" />
              )}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {finishPrices.map(item => {
                  const priced = applyStructuralMarkup(item, canUseStructuralMarkup ? selectedStructuralMarkupRule : null);
                  const highlight = getPriceHighlight(priced.finalPrice, priceExtremes.min, priceExtremes.max);
                  const selected = item.price_id === state.selectedPriceId;
                  return (
                    <Card
                      key={item.price_id}
                      className={
                        selected
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : highlight === 'min'
                            ? 'border-emerald-500/60 bg-emerald-500/5'
                            : highlight === 'max'
                              ? 'border-amber-500/60 bg-amber-500/5'
                              : ''
                      }
                    >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-base">{item.finish_name}</CardTitle>
                          {item.finish_type && <p className="mt-1 text-xs text-muted-foreground">{item.finish_type}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {selected && <Badge className="gap-1"><Check size={12} /> Selecionado</Badge>}
                          {!selected && highlight === 'min' && <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Menor preco</Badge>}
                          {!selected && highlight === 'max' && <Badge className="bg-amber-600 text-white hover:bg-amber-600">Maior preco</Badge>}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <BadgeDollarSign size={18} className="text-muted-foreground" />
                          <span className="text-2xl font-semibold">{formatCurrencyBRL(priced.finalPrice)}</span>
                        </div>
                        <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
                          <p>Valor base: <span className="font-medium text-foreground">{formatCurrencyBRL(priced.basePrice)}</span></p>
                          <p>
                            Acréscimo: <span className="font-medium text-foreground">
                              {priced.markupPercent ? `${priced.markupPercent}% (${priced.markupLabel})` : 'Sem regra ativa'}
                            </span>
                          </p>
                          <p>Valor final: <span className="font-medium text-foreground">{formatCurrencyBRL(priced.finalPrice)}</span></p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          className="flex-1 gap-2"
                          variant={selected ? 'default' : 'outline'}
                          onClick={() => setState(prev => ({ ...prev, selectedPriceId: item.price_id }))}
                        >
                          <Check size={16} />
                          Selecionar
                        </Button>
                        <Button type="button" variant="outline" size="icon" onClick={() => addQuoteItem(item)} title="Adicionar a cotacao">
                          <Plus size={16} />
                        </Button>
                        <Button type="button" variant="outline" size="icon" onClick={() => copyPrice(item)} title="Copiar valor">
                          <Clipboard size={16} />
                        </Button>
                      </div>
                    </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
