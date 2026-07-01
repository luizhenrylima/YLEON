import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Percent, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  deleteLocalFinishMarkupRule,
  getLocalFinishMarkupRules,
  isFinishMarkupRulesTableMissing,
  normalizeFinishMarkupKey,
  updateLocalFinishMarkupRule,
  upsertLocalFinishMarkupRule,
  type FinishMarkupRule,
} from '@/lib/finishMarkupRules';

type TenantInfo = {
  id: string;
  name: string;
};

type PriceBrand = {
  id: string;
  name: string;
  default_markup_percent: number;
};

type PriceProduct = {
  id: string;
  name: string;
  reference_code: string | null;
  markup_percent: number | null;
};

export default function PriceMarkupTools({ tenantId: providedTenantId }: { tenantId?: string | null }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [globalMarkupValue, setGlobalMarkupValue] = useState('');
  const [brandMarkupValue, setBrandMarkupValue] = useState('');
  const [productMarkupValue, setProductMarkupValue] = useState('');
  const [finishRuleDraft, setFinishRuleDraft] = useState({ finishLabel: '', markupPercent: '', isActive: true });
  const [editingFinishRuleId, setEditingFinishRuleId] = useState<string | null>(null);
  const [isSavingMarkup, setIsSavingMarkup] = useState(false);
  const [usingLocalFinishRules, setUsingLocalFinishRules] = useState(false);

  const tenantQuery = useQuery({
    queryKey: ['price-admin-tenant', user?.id],
    enabled: !!user?.id && !providedTenantId,
    queryFn: async (): Promise<TenantInfo | null> => {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile?.tenant_id) return null;

      const { data, error } = await supabase
        .from('tenants')
        .select('id, name')
        .eq('id', profile.tenant_id)
        .maybeSingle();

      if (error) throw error;
      return data as TenantInfo | null;
    },
  });

  const tenantId = providedTenantId ?? tenantQuery.data?.id ?? null;

  const brandsQuery = useQuery({
    queryKey: ['price-admin-brands', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<PriceBrand[]> => {
      const { data, error } = await supabase
        .from('price_brands')
        .select('id, name, default_markup_percent')
        .eq('tenant_id', tenantId!)
        .order('name');
      if (error) throw error;
      return (data ?? []) as PriceBrand[];
    },
  });

  const productsQuery = useQuery({
    queryKey: ['price-admin-products', tenantId, selectedBrandId],
    enabled: !!tenantId && !!selectedBrandId,
    queryFn: async (): Promise<PriceProduct[]> => {
      const { data, error } = await supabase
        .from('price_products')
        .select('id, name, reference_code, markup_percent')
        .eq('tenant_id', tenantId!)
        .eq('brand_id', selectedBrandId)
        .order('name')
        .limit(300);
      if (error) throw error;
      return (data ?? []) as PriceProduct[];
    },
  });

  const finishRulesQuery = useQuery({
    queryKey: ['price-admin-finish-rules', selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async (): Promise<FinishMarkupRule[]> => {
      const { data, error } = await (supabase as any)
        .from('price_finish_markup_rules')
        .select('id, brand_id, finish_label, finish_key, markup_percent, is_active, updated_at')
        .eq('brand_id', selectedBrandId)
        .order('finish_label');
      if (error) {
        if (isFinishMarkupRulesTableMissing(error)) {
          setUsingLocalFinishRules(true);
          return getLocalFinishMarkupRules(selectedBrandId);
        }
        throw error;
      }
      setUsingLocalFinishRules(false);
      return (data ?? []) as FinishMarkupRule[];
    },
  });

  const selectedBrand = brandsQuery.data?.find(brand => brand.id === selectedBrandId);
  const selectedProduct = productsQuery.data?.find(product => product.id === selectedProductId);

  useEffect(() => {
    setBrandMarkupValue(selectedBrand ? String(Number(selectedBrand.default_markup_percent ?? 0)) : '');
    setSelectedProductId('');
    setFinishRuleDraft({ finishLabel: '', markupPercent: '', isActive: true });
    setEditingFinishRuleId(null);
  }, [selectedBrand?.id, selectedBrand?.default_markup_percent]);

  useEffect(() => {
    setProductMarkupValue(selectedProduct?.markup_percent == null ? '' : String(Number(selectedProduct.markup_percent)));
  }, [selectedProduct?.id, selectedProduct?.markup_percent]);

  const invalidatePriceQueries = async () => {
    await queryClient.invalidateQueries({
      predicate: query => typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('price-'),
    });
    window.dispatchEvent(new CustomEvent('price-finish-markup-rules-updated'));
  };

  const parseMarkup = (value: string, allowEmpty = false) => {
    const trimmed = value.trim();
    if (allowEmpty && !trimmed) return null;
    const parsed = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Informe um markup valido.');
    return parsed;
  };

  const saveGlobalMarkup = async () => {
    if (!tenantId) return;
    setIsSavingMarkup(true);
    try {
      const markup = parseMarkup(globalMarkupValue);
      const { error: brandError } = await supabase
        .from('price_brands')
        .update({ default_markup_percent: markup } as any)
        .eq('tenant_id', tenantId);
      if (brandError) throw brandError;

      const { error: productError } = await supabase
        .from('price_products')
        .update({ markup_percent: null } as any)
        .eq('tenant_id', tenantId);
      if (productError) throw productError;

      await invalidatePriceQueries();
      toast.success('Markup aplicado em todas as marcas e produtos.');
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel salvar o markup.');
    } finally {
      setIsSavingMarkup(false);
    }
  };

  const saveBrandMarkup = async () => {
    if (!tenantId || !selectedBrandId) return;
    setIsSavingMarkup(true);
    try {
      const markup = parseMarkup(brandMarkupValue);
      const { error } = await supabase
        .from('price_brands')
        .update({ default_markup_percent: markup } as any)
        .eq('tenant_id', tenantId)
        .eq('id', selectedBrandId);
      if (error) throw error;

      await invalidatePriceQueries();
      toast.success('Markup da marca salvo.');
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel salvar o markup da marca.');
    } finally {
      setIsSavingMarkup(false);
    }
  };

  const saveProductMarkup = async (useBrandDefault = false) => {
    if (!tenantId || !selectedProductId) return;
    setIsSavingMarkup(true);
    try {
      const markup = useBrandDefault ? null : parseMarkup(productMarkupValue, true);
      const { error } = await supabase
        .from('price_products')
        .update({ markup_percent: markup } as any)
        .eq('tenant_id', tenantId)
        .eq('id', selectedProductId);
      if (error) throw error;

      await invalidatePriceQueries();
      toast.success(useBrandDefault ? 'Produto usando markup da marca.' : 'Markup do produto salvo.');
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel salvar o markup do produto.');
    } finally {
      setIsSavingMarkup(false);
    }
  };

  const editFinishRule = (rule: FinishMarkupRule) => {
    setEditingFinishRuleId(rule.id);
    setFinishRuleDraft({
      finishLabel: rule.finish_label,
      markupPercent: String(Number(rule.markup_percent || 0)),
      isActive: rule.is_active,
    });
  };

  const resetFinishRuleDraft = () => {
    setEditingFinishRuleId(null);
    setFinishRuleDraft({ finishLabel: '', markupPercent: '', isActive: true });
  };

  const saveFinishRule = async () => {
    if (!selectedBrandId) return;
    setIsSavingMarkup(true);
    try {
      const finishLabel = finishRuleDraft.finishLabel.trim();
      const finishKey = normalizeFinishMarkupKey(finishLabel);
      if (!finishKey) throw new Error('Informe o tipo de acabamento.');
      const markup = parseMarkup(finishRuleDraft.markupPercent);
      const payload = {
        brand_id: selectedBrandId,
        finish_label: finishLabel,
        finish_key: finishKey,
        markup_percent: markup,
        is_active: finishRuleDraft.isActive,
      };

      const request = editingFinishRuleId
        ? (supabase as any).from('price_finish_markup_rules').update(payload).eq('id', editingFinishRuleId)
        : (supabase as any).from('price_finish_markup_rules').upsert(payload, { onConflict: 'brand_id,finish_key' });
      const { error } = await request;
      if (error) {
        if (!isFinishMarkupRulesTableMissing(error)) throw error;
        setUsingLocalFinishRules(true);
        upsertLocalFinishMarkupRule({ ...payload, id: editingFinishRuleId || undefined });
      }

      await invalidatePriceQueries();
      await queryClient.invalidateQueries({ queryKey: ['price-admin-finish-rules', selectedBrandId] });
      resetFinishRuleDraft();
      toast.success('Acréscimo por acabamento salvo.');
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel salvar o acrescimo.');
    } finally {
      setIsSavingMarkup(false);
    }
  };

  const toggleFinishRule = async (rule: FinishMarkupRule) => {
    setIsSavingMarkup(true);
    try {
      const { error } = await (supabase as any)
        .from('price_finish_markup_rules')
        .update({ is_active: !rule.is_active })
        .eq('id', rule.id);
      if (error) {
        if (!isFinishMarkupRulesTableMissing(error)) throw error;
        setUsingLocalFinishRules(true);
        updateLocalFinishMarkupRule(rule.id, { is_active: !rule.is_active });
      }
      await invalidatePriceQueries();
      await queryClient.invalidateQueries({ queryKey: ['price-admin-finish-rules', selectedBrandId] });
      toast.success(rule.is_active ? 'Regra desativada.' : 'Regra ativada.');
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel alterar a regra.');
    } finally {
      setIsSavingMarkup(false);
    }
  };

  const deleteFinishRule = async (rule: FinishMarkupRule) => {
    if (!window.confirm(`Excluir acréscimo de ${rule.finish_label}?`)) return;
    setIsSavingMarkup(true);
    try {
      const { error } = await (supabase as any)
        .from('price_finish_markup_rules')
        .delete()
        .eq('id', rule.id);
      if (error) {
        if (!isFinishMarkupRulesTableMissing(error)) throw error;
        setUsingLocalFinishRules(true);
        deleteLocalFinishMarkupRule(rule.id);
      }
      await invalidatePriceQueries();
      await queryClient.invalidateQueries({ queryKey: ['price-admin-finish-rules', selectedBrandId] });
      if (editingFinishRuleId === rule.id) resetFinishRuleDraft();
      toast.success('Regra excluida.');
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel excluir a regra.');
    } finally {
      setIsSavingMarkup(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Cotacao</p>
          <h3 className="text-xl font-serif text-foreground">Markup de precos</h3>
        </div>
        <Badge variant="outline">Visivel apenas no Admin</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Percent size={16} />
              Todas as marcas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={globalMarkupValue}
              onChange={event => setGlobalMarkupValue(event.target.value)}
              placeholder="Ex.: 35"
              inputMode="decimal"
            />
            <Button className="w-full gap-2" onClick={saveGlobalMarkup} disabled={isSavingMarkup || !globalMarkupValue.trim()}>
              <Save size={16} />
              Aplicar em tudo
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Percent size={16} />
              Marca
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma marca" />
              </SelectTrigger>
              <SelectContent>
                {brandsQuery.data?.map(brand => (
                  <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={brandMarkupValue}
              onChange={event => setBrandMarkupValue(event.target.value)}
              placeholder="Markup da marca"
              inputMode="decimal"
              disabled={!selectedBrandId}
            />
            <Button className="w-full gap-2" variant="outline" onClick={saveBrandMarkup} disabled={isSavingMarkup || !selectedBrandId}>
              <Save size={16} />
              Salvar marca
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Percent size={16} />
              Produto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={selectedProductId} onValueChange={setSelectedProductId} disabled={!selectedBrandId || productsQuery.data?.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={selectedBrandId ? 'Selecione um produto' : 'Selecione uma marca'} />
              </SelectTrigger>
              <SelectContent>
                {productsQuery.data?.map(product => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.reference_code ? `${product.reference_code} - ${product.name}` : product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={productMarkupValue}
              onChange={event => setProductMarkupValue(event.target.value)}
              placeholder="Em branco usa a marca"
              inputMode="decimal"
              disabled={!selectedProductId}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button className="gap-2" variant="outline" onClick={() => saveProductMarkup(false)} disabled={isSavingMarkup || !selectedProductId}>
                <Save size={16} />
                Salvar
              </Button>
              <Button variant="ghost" onClick={() => saveProductMarkup(true)} disabled={isSavingMarkup || !selectedProductId}>
                Usar marca
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-accent/20 bg-accent/5">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Percent size={16} />
                Acréscimo por acabamento
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Regra aplicada automaticamente na cotação quando o acabamento selecionado tiver nome ou tipo correspondente.
              </p>
            </div>
            <Badge variant="outline">{selectedBrand?.name || 'Selecione uma marca'}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_160px_130px_auto]">
            <Input
              value={finishRuleDraft.finishLabel}
              onChange={event => setFinishRuleDraft(current => ({ ...current, finishLabel: event.target.value }))}
              placeholder="Acabamento. Ex.: Laca, Couro, Tecido especial"
              disabled={!selectedBrandId}
            />
            <Input
              value={finishRuleDraft.markupPercent}
              onChange={event => setFinishRuleDraft(current => ({ ...current, markupPercent: event.target.value }))}
              placeholder="Acréscimo %"
              inputMode="decimal"
              disabled={!selectedBrandId}
            />
            <Select
              value={finishRuleDraft.isActive ? 'active' : 'inactive'}
              onValueChange={value => setFinishRuleDraft(current => ({ ...current, isActive: value === 'active' }))}
              disabled={!selectedBrandId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
              </SelectContent>
            </Select>
            <Button className="gap-2" onClick={saveFinishRule} disabled={isSavingMarkup || !selectedBrandId || !finishRuleDraft.finishLabel.trim() || !finishRuleDraft.markupPercent.trim()}>
              <Save size={16} />
              {editingFinishRuleId ? 'Atualizar' : 'Adicionar'}
            </Button>
          </div>
          {editingFinishRuleId && (
            <Button type="button" variant="ghost" size="sm" onClick={resetFinishRuleDraft}>
              Cancelar edição
            </Button>
          )}

          {usingLocalFinishRules && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
              A tabela de acréscimos ainda não está no Supabase. As regras estão salvas temporariamente neste navegador até a migration ser aplicada.
            </p>
          )}

          {!selectedBrandId ? (
            <p className="rounded-md border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
              Selecione uma marca acima para configurar os acréscimos.
            </p>
          ) : finishRulesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando regras...</p>
          ) : finishRulesQuery.data?.length ? (
            <div className="grid gap-2">
              {finishRulesQuery.data.map(rule => (
                <div key={rule.id} className="grid gap-3 rounded-lg border border-border bg-background p-3 md:grid-cols-[minmax(0,1fr)_120px_100px_120px_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{rule.finish_label}</p>
                    <p className="text-xs text-muted-foreground">Chave: {rule.finish_key}</p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">+{Number(rule.markup_percent).toLocaleString('pt-BR')}%</p>
                  <Badge variant={rule.is_active ? 'default' : 'secondary'}>{rule.is_active ? 'Ativo' : 'Inativo'}</Badge>
                  <p className="text-xs text-muted-foreground">{rule.updated_at ? new Date(rule.updated_at).toLocaleDateString('pt-BR') : '-'}</p>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Button size="sm" variant="outline" onClick={() => editFinishRule(rule)}>Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleFinishRule(rule)}>{rule.is_active ? 'Desativar' : 'Ativar'}</Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteFinishRule(rule)} title="Excluir configuração">
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
              Nenhum acréscimo de acabamento configurado para esta marca.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
