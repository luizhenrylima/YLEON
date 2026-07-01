import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cacheGet, cacheSet } from '@/lib/cache';
import type { Tables } from '@/integrations/supabase/types';
import {
  getLocalHiddenBrandIds,
  getLocalHiddenProductIds,
  isCatalogRecordVisible,
  isHiddenColumnMissing,
  mergeLocalHiddenState,
} from '@/lib/catalogVisibility';

type Brand = Tables<'brands'> & { is_hidden?: boolean | null };
type Product = Tables<'products'> & { is_hidden?: boolean | null };
type Category = Tables<'categories'>;

interface StyleTag { id: string; name: string; }
interface ProductStyleTag { product_id: string; style_tag_id: string; }
interface FeaturedProduct { id: string; product_id: string; display_order: number; }
interface Environment { id: string; name: string; icon: string; }
interface ProductEnvironment { product_id: string; environment_id: string; }
type CategoryProductCount = Record<string, number>;

const PAGE_SIZE = 18;

interface CatalogFilters {
  selectedBrands: string[];
  selectedCategories: string[];
  selectedStyles: string[];
  selectedEnvironments: string[];
  searchQuery: string;
}

export function useCatalog(filters: CatalogFilters) {
  const { selectedBrands, selectedCategories, selectedStyles, selectedEnvironments, searchQuery } = filters;

  // Phase 1: critical data
  const [brands, setBrands] = useState<Brand[]>(() => cacheGet<Brand[]>('catalog_brands') ?? []);
  const [brandsLoaded, setBrandsLoaded] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<FeaturedProduct[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Phase 2: filter metadata (loaded after initial render)
  const [categories, setCategories] = useState<Category[]>(() => cacheGet<Category[]>('catalog_categories') ?? []);
  const [categoryProductCount, setCategoryProductCount] = useState<CategoryProductCount>(() => cacheGet<CategoryProductCount>('catalog_categoryProductCount') ?? {});
  const [styleTags, setStyleTags] = useState<StyleTag[]>(() => cacheGet<StyleTag[]>('catalog_styleTags') ?? []);
  const [productStyleTags, setProductStyleTags] = useState<ProductStyleTag[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>(() => cacheGet<Environment[]>('catalog_environments') ?? []);
  const [productEnvironments, setProductEnvironments] = useState<ProductEnvironment[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);

  const [fetchError, setFetchError] = useState(false);

  const fetchAllProductCategories = useCallback(async () => {
    const rows: { id: string; category: string | null; is_hidden?: boolean | null }[] = [];
    const pageSize = 1000;
    const localHiddenProducts = getLocalHiddenProductIds();
    for (let from = 0; ; from += pageSize) {
      let result = await supabase
        .from('products')
        .select('id, category, is_hidden')
        .eq('is_hidden', false)
        .not('category', 'is', null)
        .range(from, from + pageSize - 1);

      if (result.error && isHiddenColumnMissing(result.error)) {
        result = await supabase
          .from('products')
          .select('id, category')
          .not('category', 'is', null)
          .range(from, from + pageSize - 1);
      }

      const { data, error } = result;
      if (error) throw error;
      rows.push(...(((data ?? []) as { id: string; category: string | null; is_hidden?: boolean | null }[])
        .filter(row => isCatalogRecordVisible(row, localHiddenProducts))));
      if (!data || data.length < pageSize) break;
    }
    return rows;
  }, []);

  const fetchAllProductStyleTags = useCallback(async () => {
    const rows: ProductStyleTag[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('product_style_tags')
        .select('product_id, style_tag_id')
        .range(from, from + pageSize - 1);
      if (error) throw error;
      rows.push(...((data ?? []) as ProductStyleTag[]));
      if (!data || data.length < pageSize) break;
    }
    return rows;
  }, []);

  const fetchAllProductEnvironments = useCallback(async () => {
    const rows: ProductEnvironment[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('product_environments')
        .select('product_id, environment_id')
        .range(from, from + pageSize - 1);
      if (error) throw error;
      rows.push(...((data ?? []) as ProductEnvironment[]));
      if (!data || data.length < pageSize) break;
    }
    return rows;
  }, []);

  // Precompute style/env product ID sets for server-side filtering
  const styleProductIds = useMemo(() => {
    if (selectedStyles.length === 0) return null;
    const stylesSet = new Set(selectedStyles);
    const ids = new Set<string>();
    productStyleTags.forEach(pst => {
      if (stylesSet.has(pst.style_tag_id)) ids.add(pst.product_id);
    });
    return ids;
  }, [selectedStyles, productStyleTags]);

  const envProductIds = useMemo(() => {
    if (selectedEnvironments.length === 0) return null;
    const envsSet = new Set(selectedEnvironments);
    const ids = new Set<string>();
    productEnvironments.forEach(pe => {
      if (envsSet.has(pe.environment_id)) ids.add(pe.product_id);
    });
    return ids;
  }, [selectedEnvironments, productEnvironments]);

  // Combined product IDs to filter by (intersection of style + env filters)
  const filterProductIds = useMemo(() => {
    if (!styleProductIds && !envProductIds) return null;
    if (styleProductIds && !envProductIds) return [...styleProductIds];
    if (!styleProductIds && envProductIds) return [...envProductIds];
    // Intersection
    const intersection: string[] = [];
    styleProductIds!.forEach(id => {
      if (envProductIds!.has(id)) intersection.push(id);
    });
    return intersection;
  }, [styleProductIds, envProductIds]);

  const searchBrandIds = useMemo(() => {
    const query = searchQuery.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!query) return [];
    return brands
      .filter(brand =>
        brand.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query)
      )
      .map(brand => brand.id);
  }, [brands, searchQuery]);

  const visibleBrandIds = useMemo(
    () => brands
      .filter(brand => isCatalogRecordVisible(brand, getLocalHiddenBrandIds()))
      .map(brand => brand.id),
    [brands]
  );

  // Build and execute product query with server-side filters
  const fetchProducts = useCallback(async (page: number, append: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!append) setLoadingProducts(true);
    else setLoadingMore(true);

    try {
      // If style/env filter yields empty set, short-circuit
      if (filterProductIds !== null && filterProductIds.length === 0) {
        if (!controller.signal.aborted) {
          if (!append) setProducts([]);
          setTotalCount(0);
          setHasMore(false);
          if (!append) setCurrentPage(page);
        }
        return;
      }

      if (!brandsLoaded) {
        return;
      }

      if (visibleBrandIds.length === 0) {
        if (!controller.signal.aborted) {
          if (!append) setProducts([]);
          setTotalCount(0);
          setHasMore(false);
          if (!append) setCurrentPage(page);
        }
        return;
      }

      const buildQuery = (withHiddenColumn: boolean) => {
        let query = supabase
          .from('products')
          .select(withHiddenColumn ? 'id, name, brand_id, category, images, is_hidden' : 'id, name, brand_id, category, images', { count: 'exact' })
          .order('name')
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

        if (withHiddenColumn) {
          query = query.eq('is_hidden', false);
        }

        // Server-side filters
        const visibleBrandSet = new Set(visibleBrandIds);
        if (selectedBrands.length > 0) {
          const selectedVisibleBrands = selectedBrands.filter(id => visibleBrandSet.size === 0 || visibleBrandSet.has(id));
          if (selectedVisibleBrands.length === 0) return null;
          query = query.in('brand_id', selectedVisibleBrands);
        } else if (visibleBrandIds.length > 0) {
          query = query.in('brand_id', visibleBrandIds);
        }
        if (selectedCategories.length > 0) {
          query = query.in('category', selectedCategories);
        }
        const searchTerm = searchQuery.trim().replace(/[,%]/g, ' ');
        if (searchTerm) {
          const searchFilters = [
            `name.ilike.%${searchTerm}%`,
            `category.ilike.%${searchTerm}%`,
          ];
          if (searchBrandIds.length > 0) {
            searchFilters.push(`brand_id.in.(${searchBrandIds.join(',')})`);
          }
          query = query.or(searchFilters.join(','));
        }
        // Style/env filter via product IDs (already computed)
        if (filterProductIds !== null) {
          query = query.in('id', filterProductIds);
        }

        return query;
      };

      let query = buildQuery(true);
      if (!query) {
        if (!append) setProducts([]);
        setTotalCount(0);
        setHasMore(false);
        return;
      }

      let { data, count, error } = await query;
      if (error && isHiddenColumnMissing(error)) {
        const fallbackQuery = buildQuery(false);
        if (!fallbackQuery) {
          if (!append) setProducts([]);
          setTotalCount(0);
          setHasMore(false);
          return;
        }
        const fallbackResult = await fallbackQuery;
        data = fallbackResult.data;
        count = fallbackResult.count;
        error = fallbackResult.error;
      }

      if (controller.signal.aborted) return;
      if (error) throw error;

      const localHiddenProducts = getLocalHiddenProductIds();
      const visibleBrandSet = new Set(visibleBrandIds);
      const fetched = ((data as Product[]) ?? [])
        .filter(product => isCatalogRecordVisible(product, localHiddenProducts))
        .filter(product => visibleBrandSet.size === 0 || visibleBrandSet.has(product.brand_id));
      const total = count ?? fetched.length;

      if (append) {
        setProducts(prev => [...prev, ...fetched]);
      } else {
        setProducts(fetched);
        setCurrentPage(page);
      }
      setTotalCount(total);
      setHasMore(page < Math.max(0, Math.ceil(total / PAGE_SIZE) - 1));
    } catch {
      if (!controller.signal.aborted) setHasMore(false);
    } finally {
      if (!controller.signal.aborted) {
        setLoadingProducts(false);
        setLoadingMore(false);
      }
    }
  }, [selectedBrands, selectedCategories, searchQuery, searchBrandIds, filterProductIds, visibleBrandIds, brandsLoaded]);

  // Load brands + featured (once)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let brandsRequest = supabase
          .from('brands')
          .select('id, name, logo_url, segment, is_hidden')
          .eq('is_hidden', false)
          .order('name');
        let brandsRes = await brandsRequest;
        if (brandsRes.error && isHiddenColumnMissing(brandsRes.error)) {
          brandsRes = await supabase.from('brands').select('id, name, logo_url, segment').order('name');
        }

        const [fpRes] = await Promise.all([
          supabase.from('featured_products').select('id, product_id, display_order').order('display_order'),
        ]);
        if (cancelled) return;

        const brandsData = mergeLocalHiddenState((brandsRes.data as Brand[]) ?? [], getLocalHiddenBrandIds())
          .filter(brand => isCatalogRecordVisible(brand, getLocalHiddenBrandIds()));
        cacheSet('catalog_brands', brandsData);
        setBrands(brandsData);
        setBrandsLoaded(true);
        setFeaturedProducts((fpRes.data as FeaturedProduct[]) ?? []);
      } catch {
        if (!cancelled) {
          setFetchError(true);
          setBrandsLoaded(true);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Fetch products when filters change (reset to page 0)
  useEffect(() => {
    pageRef.current = 0;
    setCurrentPage(0);
    fetchProducts(0, false);
  }, [fetchProducts]);

  // Phase 2: Load filter metadata after initial render
  useEffect(() => {
    let cancelled = false;
    const id = (typeof requestIdleCallback !== 'undefined')
      ? requestIdleCallback(() => loadFilters())
      : setTimeout(() => loadFilters(), 50) as unknown as number;

    async function loadFilters() {
      try {
        const cachedCats = cacheGet<Category[]>('catalog_categories');
        const cachedCategoryProductCount = null;
        const cachedTags = cacheGet<StyleTag[]>('catalog_styleTags');
        const cachedEnvs = cacheGet<Environment[]>('catalog_environments');

        const [catsRes, productCategoryRows, tagsRes, pstRes, envRes, peRes] = await Promise.all([
          cachedCats ? Promise.resolve({ data: cachedCats }) : supabase.from('categories').select('id, name').order('name'),
          cachedCategoryProductCount ? Promise.resolve(null) : fetchAllProductCategories(),
          cachedTags ? Promise.resolve({ data: cachedTags }) : supabase.from('design_style_tags').select('id, name').order('name'),
          fetchAllProductStyleTags(),
          cachedEnvs ? Promise.resolve({ data: cachedEnvs }) : supabase.from('environments').select('id, name, icon').order('name'),
          fetchAllProductEnvironments(),
        ]);
        if (cancelled) return;

        const dbCatsData = (catsRes.data as Category[]) ?? [];
        const nextCategoryProductCount: CategoryProductCount = cachedCategoryProductCount ?? {};
        if (!cachedCategoryProductCount && productCategoryRows) {
          productCategoryRows.forEach(row => {
            const name = String(row.category ?? '').trim();
            if (name) nextCategoryProductCount[name] = (nextCategoryProductCount[name] ?? 0) + 1;
          });
        }
        const mergedCategories = new Map<string, Category>();
        dbCatsData.forEach(cat => {
          const name = String(cat.name ?? '').trim();
          if (name) mergedCategories.set(name, { ...cat, name });
        });
        Object.keys(nextCategoryProductCount).forEach(name => {
          if (!mergedCategories.has(name)) {
            mergedCategories.set(name, { id: `product-category-${name}`, name } as Category);
          }
        });
        const catsData = Array.from(mergedCategories.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        const tagsData = (tagsRes.data as StyleTag[]) ?? [];
        const envsData = (envRes.data as Environment[]) ?? [];

        cacheSet('catalog_categories', catsData);
        if (!cachedCategoryProductCount) cacheSet('catalog_categoryProductCount', nextCategoryProductCount);
        if (!cachedTags) cacheSet('catalog_styleTags', tagsData);
        if (!cachedEnvs) cacheSet('catalog_environments', envsData);

        setCategories(catsData);
        setCategoryProductCount(nextCategoryProductCount);
        setStyleTags(tagsData);
        setProductStyleTags(Array.isArray(pstRes) ? pstRes : ((pstRes.data as ProductStyleTag[]) ?? []));
        setEnvironments(envsData);
        setProductEnvironments(Array.isArray(peRes) ? peRes : ((peRes.data as ProductEnvironment[]) ?? []));
      } catch {
        // Non-critical
      } finally {
        if (!cancelled) setLoadingFilters(false);
      }
    }

    return () => {
      cancelled = true;
      if (typeof cancelIdleCallback !== 'undefined') cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, [fetchAllProductCategories, fetchAllProductEnvironments, fetchAllProductStyleTags]);

  // Load more (next page with same filters)
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    const nextPage = pageRef.current + 1;
    pageRef.current = nextPage;
    fetchProducts(nextPage, true);
  }, [loadingMore, hasMore, fetchProducts]);

  const goToPage = useCallback((page: number) => {
    const nextPage = Math.max(0, page);
    pageRef.current = nextPage;
    fetchProducts(nextPage, false);
  }, [fetchProducts]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)), [totalCount]);

  // Memoized lookup maps
  const brandMap = useMemo(() => {
    const map = new Map<string, Brand>();
    brands.forEach(b => map.set(b.id, b));
    return map;
  }, [brands]);

  const productStyleMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    productStyleTags.forEach(pst => {
      (map[pst.product_id] ??= []).push(pst.style_tag_id);
    });
    return map;
  }, [productStyleTags]);

  const productEnvMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    productEnvironments.forEach(pe => {
      (map[pe.product_id] ??= []).push(pe.environment_id);
    });
    return map;
  }, [productEnvironments]);

  const styleTagMap = useMemo(() => {
    const map = new Map<string, StyleTag>();
    styleTags.forEach(t => map.set(t.id, t));
    return map;
  }, [styleTags]);

  const envProductCount = useMemo(() => {
    const count: Record<string, number> = {};
    environments.forEach(e => { count[e.id] = 0; });
    productEnvironments.forEach(pe => {
      if (count[pe.environment_id] !== undefined) count[pe.environment_id]++;
    });
    return count;
  }, [environments, productEnvironments]);

  const featuredProductIds = useMemo(
    () => new Set(featuredProducts.map(fp => fp.product_id)),
    [featuredProducts]
  );

  const featuredOrderMap = useMemo(() => {
    const map = new Map<string, number>();
    featuredProducts.forEach(fp => map.set(fp.product_id, fp.display_order));
    return map;
  }, [featuredProducts]);

  return {
    brands, products, categories, styleTags, environments, featuredProducts,
    totalCount,
    brandMap, productStyleMap, productEnvMap, styleTagMap, envProductCount, categoryProductCount,
    featuredProductIds, featuredOrderMap,
    loadingProducts, loadingFilters, loadingMore, hasMore, fetchError,
    currentPage, totalPages,
    loadMore, goToPage,
  };
}

export { PAGE_SIZE };
export type { StyleTag, ProductStyleTag, FeaturedProduct, Environment, ProductEnvironment };
