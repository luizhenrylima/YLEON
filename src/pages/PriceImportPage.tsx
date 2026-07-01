import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ParsedPriceWorkbook, NormalizedPriceRow, parsePriceWorkbook } from '@/lib/priceImport';
import { slugify } from '@/lib/priceConsultant';

const DEFAULT_TENANT_SLUG = 'acervo-1055';

function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const map = new Map<string, T>();
  items.forEach(item => map.set(getKey(item), item));
  return Array.from(map.values());
}

async function upsertChunks<T extends Record<string, unknown>>(table: string, rows: T[], onConflict: string, chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table as any).upsert(chunk as any, { onConflict });
    if (error) throw error;
  }
}

async function fetchAll<T>(table: string, columns: string, tenantId: string) {
  const result: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table as any)
      .select(columns)
      .eq('tenant_id', tenantId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    result.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return result;
}

async function importParsedWorkbook(tenantId: string, parsed: ParsedPriceWorkbook) {
  const rows = parsed.rows;
  const brandRows = uniqueBy(rows, row => slugify(row.brandName)).map(row => ({
    tenant_id: tenantId,
    name: row.brandName,
    slug: slugify(row.brandName),
    source_brand_name: row.brandName,
  }));
  await upsertChunks('price_brands', brandRows, 'tenant_id,slug');
  const brands = await fetchAll<{ id: string; slug: string }>('price_brands', 'id, slug', tenantId);
  const brandMap = new Map(brands.map(brand => [brand.slug, brand.id]));

  const categoryRows = uniqueBy(rows, row => `${row.brandName}|${row.categorySourceId}`).map(row => ({
    tenant_id: tenantId,
    brand_id: brandMap.get(slugify(row.brandName)),
    name: row.categoryName,
    slug: slugify(row.categorySourceId),
    source_category_id: row.categorySourceId,
  })).filter(row => row.brand_id);
  await upsertChunks('price_categories', categoryRows, 'tenant_id,brand_id,slug');
  const categories = await fetchAll<{ id: string; brand_id: string; slug: string }>('price_categories', 'id, brand_id, slug', tenantId);
  const categoryMap = new Map(categories.map(category => [`${category.brand_id}|${category.slug}`, category.id]));

  const productRows = uniqueBy(rows, row => row.productSourceId).map(row => {
    const brandId = brandMap.get(slugify(row.brandName))!;
    return {
      tenant_id: tenantId,
      brand_id: brandId,
      category_id: categoryMap.get(`${brandId}|${slugify(row.categorySourceId)}`),
      name: row.productName,
      slug: row.productSlug,
      reference_code: row.referenceCode,
      description: null,
      designer: row.designer,
      source_product_id: row.productSourceId,
    };
  }).filter(row => row.category_id);
  await upsertChunks('price_products', productRows, 'tenant_id,brand_id,source_product_id');
  const products = await fetchAll<{ id: string; source_product_id: string }>('price_products', 'id, source_product_id', tenantId);
  const productMap = new Map(products.map(product => [product.source_product_id, product.id]));

  const variationRows = uniqueBy(rows, row => row.variationSourceId).map(row => {
    const brandId = brandMap.get(slugify(row.brandName))!;
    return {
      tenant_id: tenantId,
      brand_id: brandId,
      category_id: categoryMap.get(`${brandId}|${slugify(row.categorySourceId)}`),
      product_id: productMap.get(row.productSourceId),
      variation_code: row.variationCode,
      variation_name: row.variationName,
      dimensions: row.variationDimensions,
      module: null,
      description: row.variationDescription,
      source_variation_id: row.variationSourceId,
    };
  }).filter(row => row.category_id && row.product_id);
  await upsertChunks('price_product_variations', variationRows, 'tenant_id,product_id,source_variation_id');
  const variations = await fetchAll<{ id: string; source_variation_id: string }>('price_product_variations', 'id, source_variation_id', tenantId);
  const variationMap = new Map(variations.map(variation => [variation.source_variation_id, variation.id]));

  const finishRows = uniqueBy(rows, row => `${row.brandName}|${row.finishCode}`).map(row => ({
    tenant_id: tenantId,
    brand_id: brandMap.get(slugify(row.brandName)),
    name: row.finishName,
    finish_type: row.finishType,
    code: row.finishCode,
    slug: row.finishSlug,
    source_finish_id: row.finishCode,
  })).filter(row => row.brand_id);
  await upsertChunks('price_finishes', finishRows, 'tenant_id,brand_id,code');
  const finishes = await fetchAll<{ id: string; brand_id: string; code: string }>('price_finishes', 'id, brand_id, code', tenantId);
  const finishMap = new Map(finishes.map(finish => [`${finish.brand_id}|${finish.code}`, finish.id]));

  const priceRows = uniqueBy(rows.map(row => {
    const brandId = brandMap.get(slugify(row.brandName))!;
    return {
      tenant_id: tenantId,
      brand_id: brandId,
      category_id: categoryMap.get(`${brandId}|${slugify(row.categorySourceId)}`),
      product_id: productMap.get(row.productSourceId),
      variation_id: variationMap.get(row.variationSourceId),
      finish_id: finishMap.get(`${brandId}|${row.finishCode}`),
      price: row.price,
      currency: 'BRL',
      source_reference: row.sourceReference,
      source_price_id: row.priceId,
    };
  }).filter(row => row.category_id && row.product_id && row.variation_id && row.finish_id), row =>
    `${row.tenant_id}|${row.brand_id}|${row.category_id}|${row.product_id}|${row.variation_id}|${row.finish_id}`
  );
  await upsertChunks('price_table', priceRows, 'tenant_id,brand_id,category_id,product_id,variation_id,finish_id');

  return {
    brands: brandRows.length,
    categories: categoryRows.length,
    products: productRows.length,
    variations: variationRows.length,
    finishes: finishRows.length,
    prices: priceRows.length,
  };
}

export function PriceImportTools({
  tenantId: providedTenantId,
  showHeading = true,
  redirectNonAdmin = false,
}: {
  tenantId?: string | null;
  showHeading?: boolean;
  redirectNonAdmin?: boolean;
}) {
  const { user, isAdmin, loading } = useAuth();
  const queryClient = useQueryClient();
  const [parsed, setParsed] = useState<ParsedPriceWorkbook | null>(null);
  const [fileName, setFileName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<Record<string, number> | null>(null);

  const tenantQuery = useQuery({
    queryKey: ['price-import-tenant', user?.id],
    enabled: !!user?.id && !providedTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      if (data?.tenant_id) return data.tenant_id as string;
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants' as any)
        .select('id')
        .eq('slug', DEFAULT_TENANT_SLUG)
        .maybeSingle();
      if (tenantError) throw tenantError;
      return (tenant as { id: string } | null)?.id ?? '';
    },
  });

  const tenantId = providedTenantId ?? tenantQuery.data ?? '';
  const previewRows = useMemo(() => parsed?.rows.slice(0, 8) ?? [], [parsed]);

  if (!loading && !isAdmin) return redirectNonAdmin ? <Navigate to="/" replace /> : null;

  const handleFile = async (file?: File) => {
    if (!file) return;
    setIsParsing(true);
    setParsed(null);
    setResult(null);
    setFileName(file.name);
    try {
      const nextParsed = await parsePriceWorkbook(file);
      setParsed(nextParsed);
      toast.success('Planilha lida com sucesso.');
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel ler a planilha.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    if (!parsed || !tenantId) return;
    setIsImporting(true);
    try {
      const summary = await importParsedWorkbook(tenantId, parsed);
      setResult(summary);
      await queryClient.invalidateQueries({
        predicate: query => typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('price-'),
      });
      toast.success('Tabela de precos importada.');
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel importar os precos.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <>
      {showHeading && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Admin</p>
          <h1 className="font-serif text-3xl text-foreground">Importacao de precos</h1>
          <p className="text-sm text-muted-foreground">Carregue a planilha normalizada da Tissot e atualize o Consultor de Valores.</p>
        </div>
      )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Planilha XLSX</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input type="file" accept=".xlsx,.xls" onChange={event => handleFile(event.target.files?.[0])} />
              <Button onClick={handleImport} disabled={!parsed || !tenantId || isImporting || isParsing}>
                {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Importar precos
              </Button>
            </div>
            {fileName && <p className="text-xs text-muted-foreground">Arquivo selecionado: {fileName}</p>}
            {isParsing && <p className="text-sm text-muted-foreground">Lendo planilha e preparando preview...</p>}
            {!tenantId && !tenantQuery.isLoading && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Usuario sem tenant configurado. Defina um tenant antes de importar.
              </div>
            )}
          </CardContent>
        </Card>

        {parsed && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Preview da importacao</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {Object.entries(parsed.counts).map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{key}</p>
                    <p className="text-xl font-semibold text-foreground">{value.toLocaleString('pt-BR')}</p>
                  </div>
                ))}
              </div>
              {parsed.invalidRows > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
                  <AlertCircle className="h-4 w-4" />
                  {parsed.invalidRows} linha(s) ignorada(s) por falta de campos obrigatorios.
                </div>
              )}
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead>Variacao</TableHead>
                      <TableHead>Acabamento</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map(row => (
                      <TableRow key={row.priceId}>
                        <TableCell>{row.productName}</TableCell>
                        <TableCell>{row.variationCode}</TableCell>
                        <TableCell>{row.finishName}</TableCell>
                        <TableCell className="text-right">R$ {row.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {result && (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="flex items-start gap-3 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
              <div>
                <p className="font-medium text-foreground">Importacao concluida</p>
                <p className="text-sm text-muted-foreground">
                  {result.prices?.toLocaleString('pt-BR')} precos processados para o tenant atual.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
    </>
  );
}

export default function PriceImportPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <PriceImportTools redirectNonAdmin />
      </div>
    </main>
  );
}
