import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import {
  BadgeDollarSign,
  Calculator,
  Check,
  Clipboard,
  Eraser,
  Loader2,
  Plus,
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

type TenantInfo = {
  id: string;
  name: string;
};

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

type QuoteItem = {
  id: string;
  productName: string;
  variationName: string;
  finishName: string;
  baseUnitPrice: number;
  unitPrice: number;
  totalPrice: number;
  finishMarkupLabel: string | null;
  finishMarkupPercent: number | null;
  areaM2: number | null;
  widthCm: number | null;
  depthCm: number | null;
};

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
  const { user, isStaff, loading } = useAuth();
  const [state, setState] = useState<PriceConsultationState>(emptyPriceConsultationState);
  const [globalSearch, setGlobalSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [topWidthCm, setTopWidthCm] = useState('');
  const [topDepthCm, setTopDepthCm] = useState('');
  const [selectedStructuralMarkupRuleId, setSelectedStructuralMarkupRuleId] = useState('none');
  const debouncedGlobalSearch = useDebouncedValue(globalSearch.trim(), 300);
  const debouncedProductSearch = useDebouncedValue(productSearch.trim(), 300);

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
        .select('id, name');
      const { data: tenant, error: tenantError } = profile?.tenant_id
        ? await tenantQueryBuilder.eq('id', profile.tenant_id).maybeSingle()
        : await tenantQueryBuilder.eq('slug', 'acervo-1055').maybeSingle();

      if (tenantError) throw tenantError;
      return tenant as TenantInfo | null;
    },
  });

  const tenantId = tenantQuery.data?.id ?? null;

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

  const quoteTotal = useMemo(
    () => quoteItems.reduce((total, item) => total + item.totalPrice, 0),
    [quoteItems]
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
    const totalPrice = squareMeter && area ? priced.finalPrice * area : priced.finalPrice;

    setQuoteItems(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        productName: selectedProduct.name,
        variationName: selectedVariation.variation_name,
        finishName: item.finish_name,
        baseUnitPrice: priced.basePrice,
        unitPrice: priced.finalPrice,
        totalPrice,
        finishMarkupLabel: priced.markupLabel,
        finishMarkupPercent: priced.markupPercent,
        areaM2: area,
        widthCm: width,
        depthCm: depth,
      },
    ]);
    toast.success(squareMeter ? 'Tampo adicionado a cotacao.' : 'Item adicionado a cotacao.');
  };

  const copyQuoteTotal = async () => {
    const lines = quoteItems.map(item => {
      const measure = item.areaM2 ? ` (${item.widthCm}x${item.depthCm} cm / ${item.areaM2.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m2)` : '';
      const markup = item.finishMarkupPercent ? ` | Estrutura ${item.finishMarkupLabel}: Base ${formatCurrencyBRL(item.baseUnitPrice)} + ${item.finishMarkupPercent}%` : '';
      return `${item.productName} - ${item.finishName}${measure}${markup}: ${formatCurrencyBRL(item.totalPrice)}`;
    });
    lines.push(`Total: ${formatCurrencyBRL(quoteTotal)}`);
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

  if (!loading && !isStaff) return <Navigate to="/catalog" replace />;

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
            title="Cotacao nao configurada"
            description="Peça para um administrador associar seu cadastro a um tenant antes de consultar valores."
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
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">{item.variationName}</p>
                        <p className="text-xs text-muted-foreground">{item.finishName}</p>
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
                      </div>
                      <div className="flex shrink-0 items-start gap-2">
                        <strong className="text-sm">{formatCurrencyBRL(item.totalPrice)}</strong>
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
                    <strong className="text-xl">{formatCurrencyBRL(quoteTotal)}</strong>
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
