import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ChevronLeft, Search, X, Loader2 } from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import { useBrandCatalog } from '@/hooks/useBrandCatalog';

// Debounce hook for search
function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function BrandCatalogPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const { brand, categories, products, totalCount, loading, loadingMore, hasMore, loadMore } =
    useBrandCatalog({ brandId, selectedCategory, searchQuery: debouncedSearch });

  // Infinite scroll via Intersection Observer
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const handleCategoryChange = useCallback((cat: string | null) => {
    setSelectedCategory(cat);
  }, []);

  // Skeleton for initial load
  if (loading && products.length === 0) {
    return (
      <div className="min-h-screen flex">
        <div className="w-64 border-r border-border p-8 hidden md:block bg-card">
          <div className="h-4 w-20 bg-muted animate-pulse rounded mb-12" />
          <div className="h-10 w-full bg-muted animate-pulse rounded mb-12" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-4 w-24 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-8 md:p-12">
          <div className="h-8 w-48 bg-muted animate-pulse rounded mb-8" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[...Array(6)].map((_, i) => (
              <div key={i}>
                <div className="aspect-[4/5] bg-muted animate-pulse rounded-lg mb-4" />
                <div className="h-4 w-32 bg-muted animate-pulse rounded mb-2" />
                <div className="h-3 w-20 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {brand && (
        <Helmet>
          <title>{`${brand.name} — Catálogo | YLEON`}</title>
          <meta name="description" content={`Coleção ${brand.name}: produtos, acabamentos e fichas técnicas para arquitetos e designers.`} />
          <link rel="canonical" href={`https://yleon.com.br/brand/${brand.id}`} />
          <meta property="og:title" content={`${brand.name} — YLEON`} />
          <meta property="og:url" content={`https://yleon.com.br/brand/${brand.id}`} />
        </Helmet>
      )}
      {/* Sidebar */}
      <div className="w-64 border-r border-border/60 p-8 hidden md:block bg-background">
        <Link
          to={`/brands/${brand?.segment || 'high'}`}
          className="inline-flex items-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-12 hover:text-foreground transition-colors"
        >
          <ChevronLeft size={14} /> Marcas
        </Link>

        {brand?.logo_url ? (
          <img src={brand.logo_url} alt={brand.name} className="w-full mb-12 opacity-80" />
        ) : (
          <h3 className="text-xl font-serif mb-12 text-foreground">{brand?.name}</h3>
        )}

        <div className="space-y-3">
          <button
            onClick={() => handleCategoryChange(null)}
            className={`block w-full text-left text-xs uppercase tracking-[0.15em] transition-colors ${
              !selectedCategory ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Todos
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryChange(cat.name)}
              className={`block w-full text-left text-xs uppercase tracking-[0.15em] transition-colors ${
                selectedCategory === cat.name ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile category selector */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border p-3 z-40 overflow-x-auto flex gap-2">
        <button
          onClick={() => handleCategoryChange(null)}
          className={`shrink-0 px-4 py-2 rounded-full text-[10px] uppercase tracking-[0.1em] border transition-colors ${
            !selectedCategory ? 'bg-foreground text-background border-foreground' : 'bg-background text-muted-foreground border-border'
          }`}
        >
          Todos
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => handleCategoryChange(cat.name)}
            className={`shrink-0 px-4 py-2 rounded-full text-[10px] uppercase tracking-[0.1em] border transition-colors ${
              selectedCategory === cat.name ? 'bg-foreground text-background border-foreground' : 'bg-background text-muted-foreground border-border'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Products Grid */}
      <div className="flex-1 p-8 md:p-12 pb-24 md:pb-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-serif text-foreground">
            {selectedCategory || brand?.name || 'Produtos'}
          </h2>
          <span className="text-xs text-muted-foreground">
            {totalCount} {totalCount === 1 ? 'produto' : 'produtos'}
          </span>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Pesquisar produto pelo nome..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-11 pr-10 py-3 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {searchInput && (
            <button onClick={() => setSearchInput('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          )}
        </div>

        {!loading && products.length === 0 ? (
          <div className="h-[50vh] flex items-center justify-center text-muted-foreground font-light italic">
            {debouncedSearch ? 'Nenhum produto encontrado.' : selectedCategory ? 'Nenhum produto nesta categoria.' : 'Nenhum produto cadastrado.'}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {products.map((prod) => (
                <ProductCard
                  key={prod.id}
                  product={prod}
                  brandName={brand?.name || ''}
                />
              ))}
            </div>

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-1" />

            {loadingMore && (
              <div className="flex justify-center py-8">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
