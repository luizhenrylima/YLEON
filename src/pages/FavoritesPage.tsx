import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Heart, Trash2, StickyNote, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables } from '@/integrations/supabase/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  getLocalHiddenBrandIds,
  getLocalHiddenProductIds,
  isCatalogRecordVisible,
  isHiddenColumnMissing,
  mergeLocalHiddenState,
} from '@/lib/catalogVisibility';

type Product = Tables<'products'> & { is_hidden?: boolean | null };
type Brand = Pick<Tables<'brands'>, 'id' | 'name' | 'logo_url' | 'segment'> & { is_hidden?: boolean | null };
const FAVORITE_PRODUCT_FIELDS = 'id, name, images, is_hidden';

interface FavoriteNote {
  productId: string;
  note: string;
  date: string;
}

function getFavoriteNotes(userId: string): Record<string, FavoriteNote> {
  try {
    const raw = localStorage.getItem(`fav_notes_${userId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveFavoriteNote(userId: string, productId: string, note: string): void {
  try {
    const notes = getFavoriteNotes(userId);
    notes[productId] = { productId, note, date: new Date().toISOString() };
    localStorage.setItem(`fav_notes_${userId}`, JSON.stringify(notes));
  } catch { /* quota / private mode */ }
}

function removeFavoriteNote(userId: string, productId: string): void {
  try {
    const notes = getFavoriteNotes(userId);
    delete notes[productId];
    localStorage.setItem(`fav_notes_${userId}`, JSON.stringify(notes));
  } catch { /* quota / private mode */ }
}

function favoriteBrandErrorMessage(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return 'Tente novamente.';
  if (error.code === '42P01') return 'A tabela de marcas favoritas ainda precisa ser aplicada no Supabase.';
  if (error.code === '42501') return 'Seu perfil nao tem permissao para salvar essa marca.';
  if (error.code === '23503') return 'Essa marca nao foi encontrada no cadastro.';
  return 'Tente novamente.';
}

export default function FavoritesPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [favoriteBrandIds, setFavoriteBrandIds] = useState<Set<string>>(new Set());
  const [savingBrandIds, setSavingBrandIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [favNotes, setFavNotes] = useState<Record<string, FavoriteNote>>({});
  const [editingNote, setEditingNote] = useState<Product | null>(null);
  const [noteText, setNoteText] = useState('');
  const [brandExplorerOpen, setBrandExplorerOpen] = useState(false);
  const [availableBrands, setAvailableBrands] = useState<Brand[]>([]);
  const [loadingAvailableBrands, setLoadingAvailableBrands] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setFavNotes(getFavoriteNotes(user.id));
    const loadFavorites = async () => {
      setLoading(true);
      const [favoriteProductsRes, favoriteBrandsRes] = await Promise.all([
        supabase.from('favorites').select('product_id').eq('user_id', user.id),
        (supabase as any).from('architect_brand_favorites').select('brand_id').eq('user_id', user.id),
      ]);

      if (cancelled) return;

      if (favoriteBrandsRes.error) {
        console.warn('Favorite brands load failed:', favoriteBrandsRes.error);
        setFavoriteBrandIds(new Set());
        setBrands([]);
      } else {
        const brandIds = ((favoriteBrandsRes.data || []) as Array<{ brand_id: string }>).map(item => item.brand_id);
        setFavoriteBrandIds(new Set(brandIds));
        if (brandIds.length > 0) {
          let favoriteBrandsResult = await supabase
            .from('brands')
            .select('id, name, logo_url, segment, is_hidden')
            .in('id', brandIds)
            .eq('is_hidden', false)
            .order('name');
          if (favoriteBrandsResult.error && isHiddenColumnMissing(favoriteBrandsResult.error)) {
            favoriteBrandsResult = await supabase
              .from('brands')
              .select('id, name, logo_url, segment')
              .in('id', brandIds)
              .order('name');
          }
          if (!cancelled) {
            if (favoriteBrandsResult.error) {
              console.warn('Favorite brand details load failed:', favoriteBrandsResult.error);
              setBrands([]);
            } else {
              setBrands(mergeLocalHiddenState((favoriteBrandsResult.data as Brand[]) ?? [], getLocalHiddenBrandIds())
                .filter(brand => isCatalogRecordVisible(brand, getLocalHiddenBrandIds())));
            }
          }
        } else {
          setBrands([]);
        }
      }

      if (favoriteProductsRes.data && favoriteProductsRes.data.length > 0) {
        const ids = favoriteProductsRes.data.map((f) => f.product_id);
        let productsResult = await supabase.from('products').select(FAVORITE_PRODUCT_FIELDS).in('id', ids).eq('is_hidden', false);
        if (productsResult.error && isHiddenColumnMissing(productsResult.error)) {
          productsResult = await supabase.from('products').select('id, name, images').in('id', ids);
        }
        if (!cancelled) {
          setProducts(((productsResult.data as Product[]) ?? [])
            .filter(product => isCatalogRecordVisible(product, getLocalHiddenProductIds())));
        }
      } else {
        setProducts([]);
      }

      if (!cancelled) setLoading(false);
    };
    loadFavorites();
    return () => { cancelled = true; };
  }, [user]);

  const removeFavorite = useCallback(async (productId: string) => {
    if (!user) return;
    await supabase.from('favorites').delete().eq('user_id', user.id).eq('product_id', productId);
    setProducts(prev => prev.filter((p) => p.id !== productId));
    removeFavoriteNote(user.id, productId);
    setFavNotes(getFavoriteNotes(user.id));
  }, [user]);

  const loadAvailableBrands = useCallback(async () => {
    setLoadingAvailableBrands(true);
    let brandsResult = await supabase
      .from('brands')
      .select('id, name, logo_url, segment, is_hidden')
      .eq('is_hidden', false)
      .order('name');
    if (brandsResult.error && isHiddenColumnMissing(brandsResult.error)) {
      brandsResult = await supabase
        .from('brands')
        .select('id, name, logo_url, segment')
        .order('name');
    }
    if (brandsResult.error) {
      toast({ title: 'Erro ao carregar marcas', description: 'Tente novamente.', variant: 'destructive' });
      setAvailableBrands([]);
    } else {
      setAvailableBrands(mergeLocalHiddenState(((brandsResult.data as Brand[]) || []), getLocalHiddenBrandIds())
        .filter(brand => isCatalogRecordVisible(brand, getLocalHiddenBrandIds()))
        .filter(brand => !favoriteBrandIds.has(brand.id)));
    }
    setLoadingAvailableBrands(false);
  }, [favoriteBrandIds]);

  const openBrandExplorer = useCallback(() => {
    setBrandExplorerOpen(true);
    void loadAvailableBrands();
  }, [loadAvailableBrands]);

  const toggleFavoriteBrand = useCallback(async (brandId: string, brandRecord?: Brand) => {
    if (!user) return;
    if (savingBrandIds.has(brandId)) return;
    const isFavorite = favoriteBrandIds.has(brandId);
    const removedBrand = brands.find(brand => brand.id === brandId) || brandRecord || null;

    setSavingBrandIds(current => new Set(current).add(brandId));
    setFavoriteBrandIds(current => {
      const next = new Set(current);
      if (isFavorite) next.delete(brandId);
      else next.add(brandId);
      return next;
    });
    if (isFavorite) {
      setBrands(current => current.filter(brand => brand.id !== brandId));
    } else if (brandRecord) {
      setAvailableBrands(current => current.filter(brand => brand.id !== brandId));
    }

    const result = isFavorite
      ? await (supabase as any).from('architect_brand_favorites').delete().eq('user_id', user.id).eq('brand_id', brandId)
      : await (supabase as any)
        .from('architect_brand_favorites')
        .upsert({ user_id: user.id, brand_id: brandId }, { onConflict: 'user_id,brand_id', ignoreDuplicates: true });

    setSavingBrandIds(current => {
      const next = new Set(current);
      next.delete(brandId);
      return next;
    });

    if (result.error) {
      setFavoriteBrandIds(current => {
        const next = new Set(current);
        if (isFavorite) next.add(brandId);
        else next.delete(brandId);
        return next;
      });
      if (isFavorite && removedBrand) {
        setBrands(current => current.some(brand => brand.id === removedBrand.id)
          ? current
          : [...current, removedBrand].sort((a, b) => a.name.localeCompare(b.name)));
      }
      if (!isFavorite && brandRecord) {
        setAvailableBrands(current => current.some(brand => brand.id === brandRecord.id)
          ? current
          : [...current, brandRecord].sort((a, b) => a.name.localeCompare(b.name)));
      }
      console.warn('Favorite brand save failed:', result.error);
      toast({
        title: 'Erro ao salvar marca favorita',
        description: favoriteBrandErrorMessage(result.error),
        variant: 'destructive',
      });
      return;
    }

    if (!isFavorite && brandRecord) {
      setBrands(current => current.some(brand => brand.id === brandRecord.id)
        ? current
        : [...current, brandRecord].sort((a, b) => a.name.localeCompare(b.name)));
    }
  }, [brands, favoriteBrandIds, savingBrandIds, user]);

  const openEditNote = useCallback((prod: Product) => {
    setNoteText(favNotes[prod.id]?.note ?? '');
    setEditingNote(prod);
  }, [favNotes]);

  const saveNote = useCallback(() => {
    if (!user || !editingNote) return;
    if (noteText.trim()) {
      saveFavoriteNote(user.id, editingNote.id, noteText.trim());
    } else {
      removeFavoriteNote(user.id, editingNote.id);
    }
    setFavNotes(getFavoriteNotes(user.id));
    setEditingNote(null);
  }, [user, editingNote, noteText]);

  return (
    <div className="min-h-screen bg-background py-12 px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-12">
          <Heart size={24} className="text-accent" aria-hidden="true" />
          <h1 className="text-3xl font-serif text-foreground">Meus Favoritos</h1>
        </div>

        {!loading && (
          <section className="mb-12 rounded-[24px] border border-border bg-card p-5 shadow-sm md:p-6">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 size={18} className="text-accent" aria-hidden="true" />
                  <h2 className="font-serif text-2xl text-foreground">Marcas favoritas</h2>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Escolha as marcas que mais fazem sentido para seus projetos. Elas ficam salvas junto dos seus produtos favoritos.
                </p>
              </div>
              <span className="w-fit rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-accent">
                {favoriteBrandIds.size} selecionada(s)
              </span>
            </div>

            {brands.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">Você ainda não favoritou nenhuma marca.</p>
                <Button type="button" className="mt-4 rounded-full" onClick={openBrandExplorer}>
                  Explorar marcas
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {brands.map((brand) => {
                  const isSaving = savingBrandIds.has(brand.id);
                  return (
                    <article
                      key={brand.id}
                      className={`group relative flex min-h-24 items-center gap-4 rounded-2xl border border-accent bg-accent/10 p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${isSaving ? 'opacity-70' : ''}`}
                    >
                      <Link to={`/brand/${brand.id}`} className="flex min-w-0 flex-1 items-center gap-4" aria-label={`Abrir marca ${brand.name}`}>
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border bg-card">
                          {brand.logo_url ? (
                            <img src={brand.logo_url} alt={brand.name} className="max-h-8 max-w-10 object-contain" />
                          ) : (
                            <Building2 size={17} className="text-accent" aria-hidden="true" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{brand.name}</span>
                          <span className="mt-1 block text-xs uppercase tracking-[0.12em] text-muted-foreground">{brand.segment || 'Marca'}</span>
                        </span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => void toggleFavoriteBrand(brand.id)}
                        disabled={isSaving}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-accent/30 bg-card text-accent transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-wait"
                        aria-label={`Remover ${brand.name} das marcas favoritas`}
                      >
                        <Heart size={17} className="fill-current" aria-hidden="true" />
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {loading ? (
          <div className="h-[40vh] flex items-center justify-center" role="status" aria-label="Carregando favoritos">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
          </div>
        ) : products.length === 0 ? (
          <div className="h-[40vh] flex items-center justify-center flex-col gap-4">
            <Heart size={48} className="text-muted-foreground/30" aria-hidden="true" />
            <p className="text-muted-foreground font-light italic">Nenhum produto favoritado ainda.</p>
            <Link to="/catalog" className="text-xs uppercase tracking-[0.15em] text-accent hover:underline">
              Explorar Catálogo
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {products.map((prod) => {
              const note = favNotes[prod.id]?.note;
              return (
                <div key={prod.id} className="group relative">
                  <Link to={`/product/${prod.id}`} aria-label={`Ver detalhes de ${prod.name}`}>
                    <div className="aspect-[4/5] bg-muted/30 mb-4 overflow-hidden rounded-lg flex items-center justify-center border border-border card-hover">
                      <img
                        src={prod.images?.[0] || '/placeholder.svg'}
                        loading="lazy"
                        decoding="async"
                        width={300}
                        height={375}
                        className="max-w-full max-h-full object-contain"
                        alt={`Foto do produto ${prod.name}`}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-medium text-foreground">{prod.name}</h3>
                      {note && <StickyNote size={12} className="text-accent/70 shrink-0" aria-label="Possui anotação" />}
                    </div>
                  </Link>
                  {note && (
                    <p className="text-[11px] text-muted-foreground italic mt-1 line-clamp-2">{note}</p>
                  )}
                  <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEditNote(prod)}
                      aria-label={`Editar anotação de ${prod.name}`}
                      className="p-2 bg-card/80 backdrop-blur-sm rounded-full border border-border text-muted-foreground hover:text-accent transition-colors"
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => removeFavorite(prod.id)}
                      aria-label={`Remover ${prod.name} dos favoritos`}
                      className="p-2 bg-card/80 backdrop-blur-sm rounded-full border border-border text-destructive transition-colors"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Note Modal */}
      <Dialog open={!!editingNote} onOpenChange={(open) => { if (!open) setEditingNote(null); }}>
        <DialogContent className="sm:max-w-md bg-card border-border shadow-xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg flex items-center gap-2">
              <StickyNote size={16} className="text-accent" aria-hidden="true" />
              Anotação — {editingNote?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Edite ou adicione uma anotação pessoal para este produto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Ex: verificar cor verde, cliente adorou..."
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              aria-label="Texto da anotação"
              className="min-h-[80px] text-sm bg-secondary border-border resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={saveNote}
                className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg text-xs uppercase tracking-[0.1em] font-medium hover:opacity-90 transition-opacity"
              >
                Salvar
              </button>
              <button
                onClick={() => setEditingNote(null)}
                className="px-4 py-2.5 border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={brandExplorerOpen} onOpenChange={setBrandExplorerOpen}>
        <DialogContent className="sm:max-w-3xl bg-card border-border shadow-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl flex items-center gap-2">
              <Building2 size={18} className="text-accent" aria-hidden="true" />
              Explorar marcas
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Escolha as marcas que deseja salvar nos favoritos.
            </DialogDescription>
          </DialogHeader>
          {loadingAvailableBrands ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Carregando marcas...</div>
          ) : availableBrands.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">Todas as marcas disponíveis já estão nos seus favoritos.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {availableBrands.map(brand => {
                const isSaving = savingBrandIds.has(brand.id);
                return (
                  <div key={brand.id} className="flex min-h-20 items-center gap-4 rounded-2xl border border-border bg-background p-4">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border bg-card">
                      {brand.logo_url ? (
                        <img src={brand.logo_url} alt={brand.name} className="max-h-8 max-w-10 object-contain" />
                      ) : (
                        <Building2 size={17} className="text-accent" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{brand.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">{brand.segment || 'Marca'}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      disabled={isSaving}
                      onClick={() => void toggleFavoriteBrand(brand.id, brand)}
                    >
                      <Heart size={14} className="mr-2" />
                      Favoritar
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
