import { useEffect, useState, useMemo, useCallback } from 'react';
import { Search, X, Sparkles, ChevronDown, ChevronLeft, ChevronRight, SlidersHorizontal, Heart, StickyNote, Sofa, BedDouble, Monitor, Trees, UtensilsCrossed, Bath, Tag, Palette, Building2, Check, RotateCcw } from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables } from '@/integrations/supabase/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useCatalog } from '@/hooks/useCatalog';
import { Helmet } from 'react-helmet-async';

const CatalogHelmet = () => (
  <Helmet>
    <title>Catálogo — YLEON</title>
    <meta name="description" content="Explore o catálogo completo de mobiliário, iluminação e revestimentos das marcas mais exclusivas para arquitetos e designers." />
    <link rel="canonical" href="https://yleon.com.br/catalog" />
    <meta property="og:title" content="Catálogo — YLEON" />
    <meta property="og:description" content="Explore o catálogo completo de mobiliário e revestimentos das marcas mais exclusivas." />
    <meta property="og:url" content="https://yleon.com.br/catalog" />
  </Helmet>
);

type Product = Tables<'products'>;

interface FavoriteNote {
  productId: string;
  note: string;
  date: string;
}

const ENVIRONMENT_ICONS: Record<string, React.ComponentType<any>> = {
  'sofa': Sofa,
  'bed-double': BedDouble,
  'monitor': Monitor,
  'trees': Trees,
  'utensils-crossed': UtensilsCrossed,
  'bath': Bath,
};

// --- localStorage helpers ---
function getFavoriteNotes(userId: string): Record<string, FavoriteNote> {
  try {
    const raw = localStorage.getItem(`fav_notes_${userId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch { return {}; }
}

function saveFavoriteNote(userId: string, productId: string, note: string): void {
  try {
    const notes = getFavoriteNotes(userId);
    notes[productId] = { productId, note, date: new Date().toISOString() };
    localStorage.setItem(`fav_notes_${userId}`, JSON.stringify(notes));
  } catch { /* noop */ }
}

function removeFavoriteNote(userId: string, productId: string): void {
  try {
    const notes = getFavoriteNotes(userId);
    delete notes[productId];
    localStorage.setItem(`fav_notes_${userId}`, JSON.stringify(notes));
  } catch { /* noop */ }
}

function FilterSection({
  id,
  label,
  count,
  icon,
  children,
  loading,
  defaultOpen = false,
}: {
  id: string;
  label: string;
  count: number;
  icon?: React.ReactNode;
  children: React.ReactNode;
  loading?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (count > 0) setOpen(true);
  }, [count]);

  return (
    <div role="group" aria-labelledby={`filter-${id}-label`} className="rounded-xl border border-border/40 bg-card/60 overflow-hidden transition-all duration-300">
      <button
        id={`filter-${id}-label`}
        onClick={() => setOpen(prev => !prev)}
        className={`w-full flex items-center justify-between px-4 py-3.5 group cursor-pointer transition-colors duration-200 ${
          open ? 'bg-accent/5' : 'hover:bg-secondary/50'
        }`}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          {icon && <span className={`transition-colors duration-200 ${open ? 'text-accent' : 'text-muted-foreground group-hover:text-foreground'}`}>{icon}</span>}
          <span className={`text-[11px] uppercase tracking-[0.18em] font-semibold transition-colors duration-200 ${
            open ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
          }`}>
            {label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {count > 0 && (
            <span className="text-[9px] bg-accent text-accent-foreground rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-1 shadow-sm">
              {count}
            </span>
          )}
          <ChevronDown
            size={14}
            className={`text-muted-foreground transition-transform duration-300 ease-out ${open ? 'rotate-180 text-accent' : ''}`}
            aria-hidden="true"
          />
        </div>
      </button>
      <div
        className={`overflow-hidden transition-all duration-400 ease-in-out ${
          open ? 'max-h-[1200px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 pb-4 pt-1 max-h-[55vh] overflow-y-auto">
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
            </div>
          ) : children}
        </div>
      </div>
    </div>
  );
}

function FilterSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative mb-2">
      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-8 pl-8 pr-8 bg-background border border-border/60 rounded-lg text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="Limpar busca do filtro"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X size={11} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function FilterOptionButton({
  active,
  label,
  count,
  icon,
  tone = 'accent',
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  icon?: React.ReactNode;
  tone?: 'accent' | 'primary';
  onClick: () => void;
}) {
  const activeClass = tone === 'primary'
    ? 'bg-primary/10 text-foreground font-medium border-primary/20'
    : 'bg-accent/10 text-foreground font-medium border-accent/20';
  const activeIndicator = tone === 'primary'
    ? 'bg-primary text-primary-foreground border-primary'
    : 'bg-accent text-accent-foreground border-accent';

  return (
    <button
      onClick={onClick}
      role="checkbox"
      aria-checked={active}
      aria-label={`Filtrar por ${label}${count !== undefined ? ` (${count} produtos)` : ''}`}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all duration-200 text-left border ${
        active
          ? activeClass
          : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground border-transparent'
      }`}
    >
      <span
        className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
          active ? activeIndicator : 'border-border bg-background'
        }`}
        aria-hidden="true"
      >
        {active && <Check size={10} />}
      </span>
      {icon}
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {count !== undefined && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-md shrink-0 ${
          active ? 'bg-background/70 text-foreground font-medium' : 'bg-secondary text-muted-foreground/60'
        }`} aria-hidden="true">{count}</span>
      )}
    </button>
  );
}

function PaginationControls({
  currentPage,
  totalPages,
  pageNumbers,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  pageNumbers: number[];
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav className="mt-10 flex flex-col items-center gap-3" aria-label="Paginação dos produtos">
      <p className="text-[11px] text-muted-foreground">
        Página {currentPage + 1} de {totalPages}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 0}
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted-foreground"
          aria-label="Página anterior"
        >
          <ChevronLeft size={15} aria-hidden="true" />
        </button>

        {pageNumbers[0] > 0 && (
          <>
            <button
              onClick={() => onPageChange(0)}
              className="h-9 min-w-9 px-3 rounded-lg border border-border bg-card text-xs text-muted-foreground hover:border-accent/50 hover:text-foreground"
              aria-label="Ir para página 1"
            >
              1
            </button>
            <span className="px-1 text-xs text-muted-foreground" aria-hidden="true">...</span>
          </>
        )}

        {pageNumbers.map(page => {
          const active = page === currentPage;
          return (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              aria-current={active ? 'page' : undefined}
              className={`h-9 min-w-9 px-3 rounded-lg border text-xs font-medium transition-colors ${
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-accent/50 hover:text-foreground'
              }`}
              aria-label={`Ir para página ${page + 1}`}
            >
              {page + 1}
            </button>
          );
        })}

        {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && (
          <>
            <span className="px-1 text-xs text-muted-foreground" aria-hidden="true">...</span>
            <button
              onClick={() => onPageChange(totalPages - 1)}
              className="h-9 min-w-9 px-3 rounded-lg border border-border bg-card text-xs text-muted-foreground hover:border-accent/50 hover:text-foreground"
              aria-label={`Ir para página ${totalPages}`}
            >
              {totalPages}
            </button>
          </>
        )}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages - 1}
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted-foreground"
          aria-label="Próxima página"
        >
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

export default function CatalogPage() {
  const { user } = useAuth();

  const [scrolled, setScrolled] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [selectedEnvironments, setSelectedEnvironments] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [brandFilterQuery, setBrandFilterQuery] = useState('');
  const [categoryFilterQuery, setCategoryFilterQuery] = useState('');
  const [environmentFilterQuery, setEnvironmentFilterQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 1280px)').matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1280px)');
    const syncSidebar = () => setSidebarOpen(mediaQuery.matches);

    syncSidebar();
    mediaQuery.addEventListener('change', syncSidebar);
    return () => mediaQuery.removeEventListener('change', syncSidebar);
  }, []);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const catalog = useCatalog({
    selectedBrands,
    selectedCategories,
    selectedStyles,
    selectedEnvironments,
    searchQuery: debouncedSearch,
  });
  const {
    brands, products, categories, styleTags, environments,
    totalCount,
    brandMap, productStyleMap, productEnvMap, styleTagMap, envProductCount, categoryProductCount,
    featuredProductIds, featuredOrderMap,
    loadingProducts, loadingFilters, fetchError,
    currentPage, totalPages,
    goToPage,
  } = catalog;

  // Favorites
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favNotes, setFavNotes] = useState<Record<string, FavoriteNote>>({});
  const [favModalProduct, setFavModalProduct] = useState<Product | null>(null);
  const [favNoteText, setFavNoteText] = useState('');

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Load favorites
  useEffect(() => {
    if (!user) return;
    setFavNotes(getFavoriteNotes(user.id));
    supabase.from('favorites').select('product_id').eq('user_id', user.id).then(({ data }) => {
      setFavoriteIds(new Set((data ?? []).map(f => f.product_id)));
    });
  }, [user]);

  // Filter sets (used only for UI highlighting, not for filtering)
  const selectedBrandsSet = useMemo(() => new Set(selectedBrands), [selectedBrands]);
  const selectedCategoriesSet = useMemo(() => new Set(selectedCategories), [selectedCategories]);
  const selectedStylesSet = useMemo(() => new Set(selectedStyles), [selectedStyles]);
  const selectedEnvironmentsSet = useMemo(() => new Set(selectedEnvironments), [selectedEnvironments]);

  const normalizeText = useCallback((value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
  []);

  const visibleBrands = useMemo(() => {
    const query = normalizeText(brandFilterQuery.trim());
    return brands
      .filter(brand => !query || normalizeText(brand.name).includes(query))
      .sort((a, b) => {
        const aActive = selectedBrandsSet.has(a.id) ? 0 : 1;
        const bActive = selectedBrandsSet.has(b.id) ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }, [brands, brandFilterQuery, normalizeText, selectedBrandsSet]);

  const visibleCategories = useMemo(() => {
    const query = normalizeText(categoryFilterQuery.trim());
    return categories
      .filter(cat => !query || normalizeText(cat.name).includes(query))
      .sort((a, b) => {
        const aActive = selectedCategoriesSet.has(a.name) ? 0 : 1;
        const bActive = selectedCategoriesSet.has(b.name) ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        const countDiff = (categoryProductCount[b.name] ?? 0) - (categoryProductCount[a.name] ?? 0);
        if (countDiff !== 0) return countDiff;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }, [categories, categoryFilterQuery, categoryProductCount, normalizeText, selectedCategoriesSet]);

  const visibleEnvironments = useMemo(() => {
    const query = normalizeText(environmentFilterQuery.trim());
    return environments
      .filter(env => !query || normalizeText(env.name).includes(query))
      .sort((a, b) => {
        const aActive = selectedEnvironmentsSet.has(a.id) ? 0 : 1;
        const bActive = selectedEnvironmentsSet.has(b.id) ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        const countDiff = (envProductCount[b.id] ?? 0) - (envProductCount[a.id] ?? 0);
        if (countDiff !== 0) return countDiff;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }, [environments, environmentFilterQuery, envProductCount, normalizeText, selectedEnvironmentsSet]);

  const quickCategories = useMemo(() =>
    categories
      .filter(cat => (categoryProductCount[cat.name] ?? 0) > 0)
      .sort((a, b) => (categoryProductCount[b.name] ?? 0) - (categoryProductCount[a.name] ?? 0))
      .slice(0, 8),
  [categories, categoryProductCount]);

  const pageNumbers = useMemo(() => {
    const maxButtons = 5;
    const start = Math.max(0, Math.min(currentPage - 2, totalPages - maxButtons));
    const end = Math.min(totalPages, start + maxButtons);
    return Array.from({ length: end - start }, (_, index) => start + index);
  }, [currentPage, totalPages]);

  const handlePageChange = useCallback((page: number) => {
    if (page < 0 || page >= totalPages || page === currentPage) return;
    goToPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage, goToPage, totalPages]);

  // Products are already filtered server-side, just separate featured vs regular
  const featuredItems = useMemo(() => {
    return products
      .filter(p => featuredProductIds.has(p.id))
      .sort((a, b) => (featuredOrderMap.get(a.id) ?? 0) - (featuredOrderMap.get(b.id) ?? 0));
  }, [products, featuredProductIds, featuredOrderMap]);

  const regularProducts = useMemo(() => {
    return products.filter(p => !featuredProductIds.has(p.id));
  }, [products, featuredProductIds]);

  const hasSearch = searchQuery.trim().length > 0;
  const activeFilterCount = selectedBrands.length + selectedCategories.length + selectedStyles.length + selectedEnvironments.length + (hasSearch ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  const toggleFilter = useCallback((value: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedBrands([]);
    setSelectedCategories([]);
    setSelectedStyles([]);
    setSelectedEnvironments([]);
    setSearchQuery('');
    setBrandFilterQuery('');
    setCategoryFilterQuery('');
    setEnvironmentFilterQuery('');
  }, []);

  // Favorite actions
  const handleFavoriteClick = useCallback(async (e: React.MouseEvent, prod: Product) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    if (favoriteIds.has(prod.id)) {
      setFavNoteText(favNotes[prod.id]?.note ?? '');
      setFavModalProduct(prod);
    } else {
      await supabase.from('favorites').insert({ user_id: user.id, product_id: prod.id });
      setFavoriteIds(prev => new Set([...prev, prod.id]));
      try {
        localStorage.setItem(`onboarding_last_favorite_${user.id}`, prod.id);
        window.dispatchEvent(new CustomEvent('architect-onboarding:favorited', { detail: { productId: prod.id } }));
      } catch { /* noop */ }
      setFavNoteText('');
      setFavModalProduct(prod);
    }
  }, [user, favoriteIds, favNotes]);

  const saveFavNote = useCallback(() => {
    if (!user || !favModalProduct) return;
    if (favNoteText.trim()) {
      saveFavoriteNote(user.id, favModalProduct.id, favNoteText.trim());
    } else {
      removeFavoriteNote(user.id, favModalProduct.id);
    }
    setFavNotes(getFavoriteNotes(user.id));
    setFavModalProduct(null);
  }, [user, favModalProduct, favNoteText]);

  const removeFav = useCallback(async () => {
    if (!user || !favModalProduct) return;
    await supabase.from('favorites').delete().eq('user_id', user.id).eq('product_id', favModalProduct.id);
    setFavoriteIds(prev => {
      const next = new Set(prev);
      next.delete(favModalProduct.id);
      return next;
    });
    removeFavoriteNote(user.id, favModalProduct.id);
    setFavNotes(getFavoriteNotes(user.id));
    setFavModalProduct(null);
  }, [user, favModalProduct]);

  const renderProductCard = useCallback((prod: Product, isFeatured = false) => {
    const isFav = favoriteIds.has(prod.id);
    const hasNote = !!favNotes[prod.id]?.note;
    const brandName = brandMap.get(prod.brand_id)?.name ?? '';
    const tags = (productStyleMap[prod.id] ?? [])
      .map(tagId => styleTagMap.get(tagId))
      .filter(Boolean) as { id: string; name: string }[];

    return (
      <ProductCard
        key={prod.id}
        product={prod}
        brandName={brandName}
        isFeatured={isFeatured}
        isFavorite={isFav}
        hasNote={hasNote}
        styleTags={tags}
        onFavoriteClick={handleFavoriteClick}
        showFavorite={!!user}
      />
    );
  }, [favoriteIds, favNotes, brandMap, productStyleMap, styleTagMap, handleFavoriteClick, user]);

  if (fetchError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="font-serif text-lg text-foreground mb-2">Erro ao carregar catálogo</p>
          <p className="text-xs text-muted-foreground mb-4">Verifique sua conexão e tente novamente.</p>
          <button onClick={() => window.location.reload()} className="text-xs text-accent hover:underline font-medium">
            Recarregar página
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <CatalogHelmet />
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Fechar filtros"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-x-0 bottom-0 top-[var(--app-navbar-total-height)] z-20 bg-black/25 backdrop-blur-[1px] xl:hidden"
        />
      )}
      {/* Sidebar */}
      <aside
        aria-label="Filtros do catálogo"
        className={`${
          sidebarOpen ? 'w-[290px] min-w-[290px]' : 'w-0 min-w-0 overflow-hidden'
        } fixed left-0 top-[var(--app-navbar-total-height)] z-30 transition-all duration-300 ease-in-out border-r border-border/40 bg-gradient-to-b from-background to-secondary/20 shadow-2xl xl:shadow-none flex flex-col h-[calc(100dvh-var(--app-navbar-total-height))] xl:sticky xl:z-auto`}
      >
        <ScrollArea className="flex-1">
          <div className="p-5 space-y-3">
            {/* Sidebar Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                  <SlidersHorizontal size={13} className="text-accent" aria-hidden="true" />
                </div>
                <span className="text-[12px] uppercase tracking-[0.2em] font-semibold text-foreground">Filtros</span>
              </div>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  aria-label={`Limpar ${activeFilterCount} filtros ativos`}
                  className="text-[10px] uppercase tracking-[0.1em] text-accent hover:text-accent/70 transition-colors flex items-center gap-1 font-medium bg-accent/5 px-2.5 py-1 rounded-full"
                >
                  <X size={10} aria-hidden="true" /> Limpar ({activeFilterCount})
                </button>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                type="text"
                placeholder="Buscar produto, marca ou categoria..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                aria-label="Buscar produto por nome, marca ou categoria"
                className="w-full pl-10 pr-8 py-3 bg-card border border-border/60 rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-all shadow-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpar busca"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Category Filter */}
            <FilterSection id="category" label="Categoria" count={selectedCategories.length} icon={<Tag size={14} />} loading={loadingFilters && categories.length === 0} defaultOpen>
              <FilterSearch value={categoryFilterQuery} onChange={setCategoryFilterQuery} placeholder="Filtrar categorias..." />
              <div className="space-y-0.5">
                {visibleCategories.map(cat => {
                  const isActive = selectedCategoriesSet.has(cat.name);
                  const count = categoryProductCount[cat.name] ?? 0;
                  return (
                    <FilterOptionButton
                      key={cat.id}
                      active={isActive}
                      label={cat.name}
                      count={count}
                      tone="primary"
                      onClick={() => toggleFilter(cat.name, setSelectedCategories)}
                    />
                  );
                })}
                {visibleCategories.length === 0 && (
                  <p className="text-[11px] text-muted-foreground py-2 px-1">Nenhuma categoria encontrada.</p>
                )}
              </div>
            </FilterSection>

            {/* Brand Filter */}
            <FilterSection id="brand" label="Marca" count={selectedBrands.length} icon={<Building2 size={14} />} defaultOpen>
              <FilterSearch value={brandFilterQuery} onChange={setBrandFilterQuery} placeholder="Filtrar marcas..." />
              <div className="space-y-0.5">
                {visibleBrands.map(brand => {
                  const isActive = selectedBrandsSet.has(brand.id);
                  return (
                    <FilterOptionButton
                      key={brand.id}
                      active={isActive}
                      label={brand.name}
                      onClick={() => toggleFilter(brand.id, setSelectedBrands)}
                    />
                  );
                })}
                {visibleBrands.length === 0 && (
                  <p className="text-[11px] text-muted-foreground py-2 px-1">Nenhuma marca encontrada.</p>
                )}
              </div>
            </FilterSection>

            {/* Environment Filter */}
            <FilterSection id="env" label="Ambiente" count={selectedEnvironments.length} icon={<Sofa size={14} />} loading={loadingFilters && environments.length === 0} defaultOpen>
              <FilterSearch value={environmentFilterQuery} onChange={setEnvironmentFilterQuery} placeholder="Filtrar ambientes..." />
              <div className="space-y-0.5">
                {visibleEnvironments.map(env => {
                  const isActive = selectedEnvironmentsSet.has(env.id);
                  const IconComp = ENVIRONMENT_ICONS[env.icon] || Sofa;
                  const count = envProductCount[env.id] ?? 0;
                  return (
                    <FilterOptionButton
                      key={env.id}
                      active={isActive}
                      label={env.name}
                      count={count}
                      icon={
                        <span className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                          isActive ? 'bg-accent/20 text-accent' : 'bg-secondary text-muted-foreground'
                        }`}>
                          <IconComp size={13} className="shrink-0" aria-hidden="true" />
                        </span>
                      }
                      onClick={() => toggleFilter(env.id, setSelectedEnvironments)}
                    />
                  );
                })}
                {visibleEnvironments.length === 0 && (
                  <p className="text-[11px] text-muted-foreground py-2 px-1">Nenhum ambiente encontrado.</p>
                )}
              </div>
            </FilterSection>

            {/* Style Tag Filter */}
            <FilterSection id="style" label="Estilo de Design" count={selectedStyles.length} icon={<Palette size={14} />} loading={loadingFilters && styleTags.length === 0}>
              <div className="flex flex-wrap gap-1.5">
                {styleTags.map(tag => {
                  const isActive = selectedStylesSet.has(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleFilter(tag.id, setSelectedStyles)}
                      role="checkbox"
                      aria-checked={isActive}
                      aria-label={`Filtrar por estilo ${tag.name}`}
                      className={`px-3 py-1.5 rounded-full text-[11px] border transition-all duration-200 ${
                        isActive
                          ? 'bg-accent text-accent-foreground border-accent shadow-sm scale-105'
                          : 'bg-card text-muted-foreground border-border hover:border-accent/50 hover:text-foreground hover:shadow-sm'
                      }`}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </FilterSection>
          </div>
        </ScrollArea>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        {/* Top Bar */}
        <div className={`sticky top-[var(--app-navbar-total-height)] z-10 bg-background/90 backdrop-blur-lg border-b border-border/60 transition-all duration-500 ${scrolled ? 'opacity-0 -translate-y-full pointer-events-none' : 'opacity-100 translate-y-0'}`}>
          <div className="px-4 sm:px-5 lg:px-8 py-3.5 sm:py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <button
                onClick={() => setSidebarOpen(prev => !prev)}
                className="p-2 rounded-lg border border-border hover:bg-secondary transition-colors"
                aria-label={sidebarOpen ? 'Ocultar filtros' : 'Mostrar filtros'}
                aria-expanded={sidebarOpen}
              >
                <SlidersHorizontal size={16} className="text-muted-foreground" aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-serif text-foreground leading-tight">Coleção Completa</h1>
                <p className="text-[11px] text-muted-foreground mt-0.5" aria-live="polite">
                  {totalCount} {totalCount === 1 ? 'produto encontrado' : 'produtos encontrados'}
                  {hasActiveFilters && (
                    <span className="ml-2 text-accent">
                      · {activeFilterCount} {activeFilterCount === 1 ? 'filtro ativo' : 'filtros ativos'}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Active filter badges */}
            {hasActiveFilters && (
              <div className="hidden md:flex items-center justify-end gap-1.5 flex-wrap max-w-[42vw]" aria-label="Filtros ativos">
                {hasSearch && (
                  <Badge variant="outline" className="text-[10px] gap-1 cursor-pointer hover:bg-destructive/10 transition-colors"
                    onClick={() => setSearchQuery('')} role="button" aria-label={`Remover busca ${searchQuery}`}>
                    Busca: {searchQuery} <X size={10} aria-hidden="true" />
                  </Badge>
                )}
                {selectedBrands.map(id => {
                  const brand = brandMap.get(id);
                  return brand ? (
                    <Badge key={id} variant="secondary" className="text-[10px] gap-1 cursor-pointer hover:bg-destructive/10 transition-colors"
                      onClick={() => toggleFilter(id, setSelectedBrands)} role="button" aria-label={`Remover filtro ${brand.name}`}>
                      {brand.name} <X size={10} aria-hidden="true" />
                    </Badge>
                  ) : null;
                })}
                {selectedCategories.map(name => (
                  <Badge key={name} variant="secondary" className="text-[10px] gap-1 cursor-pointer hover:bg-destructive/10 transition-colors"
                    onClick={() => toggleFilter(name, setSelectedCategories)} role="button" aria-label={`Remover filtro ${name}`}>
                    {name} <X size={10} aria-hidden="true" />
                  </Badge>
                ))}
                {selectedEnvironments.map(id => {
                  const env = environments.find(e => e.id === id);
                  return env ? (
                    <Badge key={id} variant="secondary" className="text-[10px] gap-1 cursor-pointer hover:bg-destructive/10 transition-colors"
                      onClick={() => toggleFilter(id, setSelectedEnvironments)} role="button" aria-label={`Remover filtro ${env.name}`}>
                      {env.name} <X size={10} aria-hidden="true" />
                    </Badge>
                  ) : null;
                })}
                {selectedStyles.map(id => {
                  const tag = styleTagMap.get(id);
                  return tag ? (
                    <Badge key={id} variant="outline" className="text-[10px] gap-1 cursor-pointer hover:bg-destructive/10 border-accent/30 text-accent transition-colors"
                      onClick={() => toggleFilter(id, setSelectedStyles)} role="button" aria-label={`Remover filtro ${tag.name}`}>
                      {tag.name} <X size={10} aria-hidden="true" />
                    </Badge>
                  ) : null;
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 sm:px-5 lg:px-8 py-6 sm:py-8">
          {(quickCategories.length > 0 || hasActiveFilters) && (
            <div className="mb-8 rounded-2xl border border-border/50 bg-card/50 p-3 md:p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">
                  <Sparkles size={13} className="text-accent" aria-hidden="true" />
                  Atalhos de busca
                </div>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-accent hover:text-accent/70 font-medium"
                  >
                    <RotateCcw size={12} aria-hidden="true" />
                    Limpar tudo
                  </button>
                )}
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {quickCategories.map(cat => {
                  const active = selectedCategoriesSet.has(cat.name);
                  const count = categoryProductCount[cat.name] ?? 0;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => toggleFilter(cat.name, setSelectedCategories)}
                      className={`shrink-0 rounded-full border px-3.5 py-2 text-[11px] transition-all ${
                        active
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-background text-muted-foreground border-border hover:border-accent/50 hover:text-foreground'
                      }`}
                      aria-pressed={active}
                    >
                      {cat.name}
                      <span className={`ml-2 ${active ? 'text-primary-foreground/70' : 'text-muted-foreground/50'}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Featured Products */}
          {!loadingProducts && featuredItems.length > 0 && (
            <section className="mb-12" aria-labelledby="featured-heading">
              <div className="flex items-center gap-3 mb-6">
                <Sparkles size={18} className="text-accent" aria-hidden="true" />
                <h2 id="featured-heading" className="text-lg font-serif text-foreground">Destaques</h2>
                <div className="flex-1 h-px bg-gradient-to-r from-accent/30 to-transparent ml-2" aria-hidden="true" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5 lg:gap-6">
                {featuredItems.slice(0, 4).map(prod => renderProductCard(prod, true))}
              </div>
            </section>
          )}

          {/* All Products */}
          <section aria-labelledby="all-products-heading">
            {featuredItems.length > 0 && regularProducts.length > 0 && (
              <div className="flex items-center gap-3 mb-6">
                <h2 id="all-products-heading" className="text-lg font-serif text-foreground">Todos os Produtos</h2>
                <div className="flex-1 h-px bg-border ml-2" aria-hidden="true" />
              </div>
            )}

            {loadingProducts ? (
              <div className={`grid gap-5 lg:gap-6 ${sidebarOpen ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5'}`}>
                {[...Array(8)].map((_, i) => (
                  <div key={i}>
                    <Skeleton className="aspect-[4/5] w-full rounded-xl mb-4" />
                    <Skeleton className="h-4 w-32 rounded mb-2" />
                    <Skeleton className="h-3 w-20 rounded" />
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="h-[50vh] flex flex-col items-center justify-center text-muted-foreground" role="status">
                <Search size={40} className="mb-4 opacity-20" aria-hidden="true" />
                <p className="font-serif text-lg mb-2">Nenhum produto encontrado</p>
                <p className="text-xs text-muted-foreground mb-4">Tente ajustar os filtros ou a busca.</p>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="text-xs text-accent hover:underline font-medium">
                    Limpar todos os filtros
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className={`grid gap-5 lg:gap-6 ${sidebarOpen ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5'}`}>
                  {regularProducts.map(prod => renderProductCard(prod))}
                </div>

                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  pageNumbers={pageNumbers}
                  onPageChange={handlePageChange}
                />
              </>
            )}
          </section>
        </div>
      </main>

      {/* Favorite Note Modal */}
      <Dialog open={!!favModalProduct} onOpenChange={(open) => { if (!open) setFavModalProduct(null); }}>
        <DialogContent className="sm:max-w-md bg-card border-border shadow-xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg flex items-center gap-2">
              <Heart size={16} className="text-destructive" fill="currentColor" aria-hidden="true" />
              {favModalProduct?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Adicione uma anotação pessoal a este produto favoritado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="fav-note-input" className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">
                Anotação pessoal (opcional)
              </label>
              <Textarea
                id="fav-note-input"
                placeholder="Ex: verificar cor verde, cliente adorou..."
                value={favNoteText}
                onChange={e => setFavNoteText(e.target.value)}
                className="min-h-[80px] text-sm bg-secondary border-border resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveFavNote}
                className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg text-xs uppercase tracking-[0.1em] font-medium hover:opacity-90 transition-opacity"
              >
                Salvar
              </button>
              <button
                onClick={() => setFavModalProduct(null)}
                className="px-4 py-2.5 border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Pular
              </button>
            </div>
            {favoriteIds.has(favModalProduct?.id ?? '') && (
              <button
                onClick={removeFav}
                className="w-full text-[11px] text-destructive hover:underline"
                aria-label="Remover este produto dos favoritos"
              >
                Remover dos favoritos
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
