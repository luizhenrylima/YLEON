import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
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

const PAGE_SIZE = 40;

interface UseBrandCatalogOptions {
  brandId: string | undefined;
  selectedCategory: string | null;
  searchQuery: string;
}

export function useBrandCatalog({ brandId, selectedCategory, searchQuery }: UseBrandCatalogOptions) {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [brandChecked, setBrandChecked] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Load brand + categories once
  useEffect(() => {
    if (!brandId) return;
    setBrandChecked(false);
    const load = async () => {
      let brandRes = await supabase
        .from('brands')
        .select('id, name, logo_url, segment, is_hidden')
        .eq('id', brandId)
        .eq('is_hidden', false)
        .maybeSingle();
      if (brandRes.error && isHiddenColumnMissing(brandRes.error)) {
        brandRes = await supabase.from('brands').select('id, name, logo_url, segment').eq('id', brandId).maybeSingle();
      }

      const [catsRes, bcRes] = await Promise.all([
        supabase.from('categories').select('id, name').order('name'),
        supabase.from('brand_categories').select('category_id').eq('brand_id', brandId),
      ]);
      const brandData = mergeLocalHiddenState(brandRes.data ? [brandRes.data as Brand] : [], getLocalHiddenBrandIds())
        .filter(item => isCatalogRecordVisible(item, getLocalHiddenBrandIds()))[0] ?? null;
      setBrand(brandData);
      setBrandChecked(true);
      const allowedCatIds = (bcRes.data || []).map((bc: any) => bc.category_id);
      if (allowedCatIds.length > 0) {
        setCategories((catsRes.data as Category[] || []).filter(c => allowedCatIds.includes(c.id)));
      } else {
        setCategories(catsRes.data as Category[] || []);
      }
    };
    load();
  }, [brandId]);

  // Build and execute product query
  const fetchProducts = useCallback(async (page: number, append: boolean) => {
    if (!brandId || !brandChecked) return;
    if (!brand) {
      setProducts([]);
      setTotalCount(0);
      setHasMore(false);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    // Cancel previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!append) setLoading(true);
    else setLoadingMore(true);

    try {
      const buildQuery = (withHiddenColumn: boolean) => {
        let query = supabase
          .from('products')
          .select(withHiddenColumn ? 'id, name, brand_id, category, images, is_hidden' : 'id, name, brand_id, category, images', { count: 'exact' })
          .eq('brand_id', brandId)
          .order('name')
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

        if (withHiddenColumn) {
          query = query.eq('is_hidden', false);
        }

        if (selectedCategory) {
          query = query.eq('category', selectedCategory);
        }
        if (searchQuery) {
          query = query.ilike('name', `%${searchQuery}%`);
        }

        return query;
      };

      let { data, count, error } = await buildQuery(true);
      if (error && isHiddenColumnMissing(error)) {
        const fallbackResult = await buildQuery(false);
        data = fallbackResult.data;
        count = fallbackResult.count;
        error = fallbackResult.error;
      }

      if (controller.signal.aborted) return;
      if (error) throw error;

      const fetched = ((data as Product[]) || [])
        .filter(product => isCatalogRecordVisible(product, getLocalHiddenProductIds()));
      const total = count ?? 0;

      if (append) {
        setProducts(prev => [...prev, ...fetched]);
      } else {
        setProducts(fetched);
      }
      setTotalCount(total);
      setHasMore(fetched.length === PAGE_SIZE);
    } catch {
      if (!controller.signal.aborted) {
        setHasMore(false);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [brandId, brand, brandChecked, selectedCategory, searchQuery]);

  // Reset and fetch page 0 when filters change
  useEffect(() => {
    pageRef.current = 0;
    fetchProducts(0, false);
  }, [fetchProducts]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    const nextPage = pageRef.current + 1;
    pageRef.current = nextPage;
    fetchProducts(nextPage, true);
  }, [loadingMore, hasMore, fetchProducts]);

  return { brand, categories, products, totalCount, loading, loadingMore, hasMore, loadMore };
}
