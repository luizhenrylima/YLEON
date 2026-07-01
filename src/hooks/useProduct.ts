import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type Product = Tables<'products'>;

const PRODUCT_FIELDS = 'id, name, brand_id, category, description, images, file_3d, file_2d, tech_sheet, finish_link';
const PRODUCT_LIST_FIELDS = 'id, name, brand_id, category, images';

async function fetchProduct(id: string): Promise<Product | null> {
  const { data } = await supabase
    .from('products')
    .select(PRODUCT_FIELDS)
    .eq('id', id)
    .single();
  return data as Product | null;
}

/**
 * Hook for fetching a single product with React Query cache.
 * Accepts optional initialData (from route state) to render instantly.
 */
export function useProduct(productId: string | undefined, initialData?: Partial<Product> | null) {
  return useQuery({
    queryKey: ['product', productId],
    queryFn: () => fetchProduct(productId!),
    enabled: !!productId,
    initialData: initialData as Product | undefined,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

/**
 * Prefetch a product into the React Query cache (call on hover/focus).
 */
export function usePrefetchProduct() {
  const queryClient = useQueryClient();
  return (productId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['product', productId],
      queryFn: () => fetchProduct(productId),
      staleTime: 1000 * 60 * 5,
    });
  };
}

export { PRODUCT_LIST_FIELDS };
