import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import {
  getLocalHiddenBrandIds,
  getLocalHiddenProductIds,
  isCatalogRecordVisible,
  isHiddenColumnMissing,
  mergeLocalHiddenState,
} from '@/lib/catalogVisibility';

type Product = Tables<'products'> & { ambient_images?: string[] | null; is_hidden?: boolean | null };

interface CuratedCollection {
  id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  display_order: number;
}

interface CuratedCollectionProduct {
  collection_id: string;
  product_id: string;
  display_order: number;
}

interface BrandSummary {
  id: string;
  name: string;
  is_hidden?: boolean | null;
}

const PRODUCT_SELECT = 'id, name, brand_id, category, images, ambient_images';
const PRODUCT_SELECT_WITH_VISIBILITY = `${PRODUCT_SELECT}, is_hidden`;

function getProductImage(product: Product | undefined) {
  return product?.ambient_images?.[0] || product?.images?.[0] || '/placeholder.svg';
}

export default function CuradoriaPage() {
  const [collections, setCollections] = useState<CuratedCollection[]>([]);
  const [collectionProducts, setCollectionProducts] = useState<CuratedCollectionProduct[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchCuradoria = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const collectionsResult = await ((supabase.from('curated_collections' as any) as any)
          .select('id, title, description, cover_image, display_order')
          .eq('is_active', true)
          .order('display_order', { ascending: true })
          .order('created_at', { ascending: true }));

        if (cancelled) return;
        if (collectionsResult.error) {
          setLoadError('Não foi possível carregar as seleções da curadoria.');
          setCollections([]);
          setCollectionProducts([]);
          setProducts([]);
          setBrands([]);
          return;
        }

        const collectionRows = (collectionsResult.data as CuratedCollection[]) ?? [];
        const collectionIds = collectionRows.map(collection => collection.id);
        setCollections(collectionRows);

        if (collectionIds.length === 0) {
          setCollectionProducts([]);
          setProducts([]);
          setBrands([]);
          return;
        }

        const linksResult = await ((supabase.from('curated_collection_products' as any) as any)
          .select('collection_id, product_id, display_order')
          .in('collection_id', collectionIds)
          .order('display_order', { ascending: true }));

        if (cancelled) return;
        if (linksResult.error) {
          setLoadError('Não foi possível carregar os produtos das seleções.');
          setCollectionProducts([]);
          setProducts([]);
          setBrands([]);
          return;
        }

        const linkRows = (linksResult.data as CuratedCollectionProduct[]) ?? [];
        setCollectionProducts(linkRows);

        const productIds = [...new Set(linkRows.map(item => item.product_id))];
        if (productIds.length === 0) {
          setProducts([]);
          setBrands([]);
          return;
        }

        let productsResult = await supabase
          .from('products')
          .select(PRODUCT_SELECT_WITH_VISIBILITY)
          .in('id', productIds)
          .eq('is_hidden', false);
        if (productsResult.error && isHiddenColumnMissing(productsResult.error)) {
          productsResult = await supabase
            .from('products')
            .select(PRODUCT_SELECT)
            .in('id', productIds);
        }

        if (cancelled) return;
        if (productsResult.error) {
          setLoadError('Não foi possível carregar os produtos da curadoria.');
          setProducts([]);
          setBrands([]);
          return;
        }

        const productRows = ((productsResult.data as Product[]) ?? [])
          .filter(product => isCatalogRecordVisible(product, getLocalHiddenProductIds()));
        setProducts(productRows);

        const brandIds = [...new Set(productRows.map(product => product.brand_id).filter(Boolean))];
        if (brandIds.length === 0) {
          setBrands([]);
          return;
        }

        let brandsResult = await supabase
          .from('brands')
          .select('id, name, is_hidden')
          .in('id', brandIds)
          .eq('is_hidden', false);
        if (brandsResult.error && isHiddenColumnMissing(brandsResult.error)) {
          brandsResult = await supabase
            .from('brands')
            .select('id, name')
            .in('id', brandIds);
        }

        if (!cancelled) {
          const visibleBrands = mergeLocalHiddenState((brandsResult.data as BrandSummary[]) ?? [], getLocalHiddenBrandIds())
            .filter(brand => isCatalogRecordVisible(brand, getLocalHiddenBrandIds()));
          const visibleBrandIds = new Set(visibleBrands.map(brand => brand.id));
          setBrands(visibleBrands);
          setProducts(current => current.filter(product => visibleBrandIds.has(product.brand_id)));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchCuradoria();
    return () => { cancelled = true; };
  }, []);

  const brandMap = useMemo(() => new Map(brands.map(brand => [brand.id, brand.name])), [brands]);
  const productMap = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);

  const curatedSections = useMemo(() => collections
    .map(collection => {
      const items = collectionProducts
        .filter(item => item.collection_id === collection.id)
        .sort((a, b) => a.display_order - b.display_order)
        .map(item => productMap.get(item.product_id))
        .filter((product): product is Product => Boolean(product));

      return { collection, products: items };
    })
    .filter(section => section.products.length > 0), [collectionProducts, collections, productMap]);

  const heroSection = curatedSections[0];
  const heroImage = heroSection
    ? heroSection.collection.cover_image || getProductImage(heroSection.products[0])
    : '/placeholder.svg';

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={26} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Curadoria YLEON | YLEON</title>
        <meta name="description" content="Seleções de produtos criadas pela YLEON para projetos de arquitetura e interiores." />
      </Helmet>

      <section className="relative min-h-[72vh] overflow-hidden bg-black text-white">
        <img
          src={heroImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-black/45" />
        <div className="relative mx-auto flex min-h-[72vh] max-w-7xl flex-col justify-end px-6 pb-14 pt-28 md:px-10 lg:px-12">
          <span className="mb-5 text-[10px] uppercase tracking-[0.32em] text-white/70">Curadoria YLEON</span>
          <h1 className="max-w-4xl text-4xl font-serif leading-tight md:text-6xl lg:text-7xl">
            Seleções prontas para projetos com presença.
          </h1>
          <div className="mt-8 flex max-w-3xl flex-col gap-5 border-t border-white/25 pt-6 md:flex-row md:items-end md:justify-between">
            <p className="text-sm leading-7 text-white/78 md:max-w-xl">
              Produtos escolhidos pelo Admin em composições editoriais, usando imagens ambientadas para orientar linguagem, escala e atmosfera.
            </p>
            <span className="text-[10px] uppercase tracking-[0.22em] text-white/65">
              {curatedSections.length} {curatedSections.length === 1 ? 'seleção' : 'seleções'}
            </span>
          </div>
        </div>
      </section>

      {loadError ? (
        <section className="mx-auto flex min-h-[45vh] max-w-4xl items-center justify-center px-6 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-accent">Curadoria indisponível</p>
            <h2 className="mt-3 text-3xl font-serif text-foreground">{loadError}</h2>
          </div>
        </section>
      ) : curatedSections.length === 0 ? (
        <section className="mx-auto flex min-h-[45vh] max-w-4xl items-center justify-center px-6 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-accent">Curadoria em construção</p>
            <h2 className="mt-3 text-3xl font-serif text-foreground">As seleções aparecerão aqui quando o Admin adicionar produtos.</h2>
          </div>
        </section>
      ) : (
        <div className="py-14 md:py-20">
          {curatedSections.map((section, index) => {
            const coverProduct = section.products[0];
            const coverImage = section.collection.cover_image || getProductImage(coverProduct);

            return (
              <section key={section.collection.id} className="border-t border-border/70">
                <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 md:px-10 lg:grid-cols-[0.95fr_1.25fr] lg:px-12 lg:py-16">
                  <Link
                    to={`/product/${coverProduct.id}`}
                    state={{ product: coverProduct }}
                    className="group relative min-h-[420px] overflow-hidden bg-muted"
                    aria-label={`Ver ${coverProduct.name}`}
                  >
                    <img
                      src={coverImage}
                      alt={section.collection.title}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-0 bg-black/20" />
                    <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                      <span className="text-[10px] uppercase tracking-[0.24em] text-white/70">
                        Seleção {String(index + 1).padStart(2, '0')}
                      </span>
                    </div>
                  </Link>

                  <div className="flex flex-col justify-between">
                    <div className="max-w-2xl">
                      <span className="text-[10px] uppercase tracking-[0.25em] text-accent">Curadoria YLEON</span>
                      <h2 className="mt-3 text-3xl font-serif leading-tight md:text-5xl">{section.collection.title}</h2>
                      {section.collection.description && (
                        <p className="mt-5 text-sm leading-7 text-muted-foreground md:max-w-xl">
                          {section.collection.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-9 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {section.products.slice(0, 6).map(product => (
                        <Link
                          key={product.id}
                          to={`/product/${product.id}`}
                          state={{ product }}
                          className="group grid grid-cols-[104px_1fr] gap-4 border-t border-border pt-4"
                        >
                          <div className="aspect-[4/3] overflow-hidden bg-muted">
                            <img
                              src={getProductImage(product)}
                              alt={product.name}
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          </div>
                          <div className="min-w-0 self-center">
                            <p className="truncate text-sm font-medium text-foreground group-hover:text-accent transition-colors">{product.name}</p>
                            <p className="mt-1 truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                              {brandMap.get(product.brand_id) || 'YLEON'}
                            </p>
                            <p className="mt-1 truncate text-xs text-muted-foreground">{product.category}</p>
                          </div>
                          <ArrowUpRight size={14} className="absolute opacity-0" />
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
