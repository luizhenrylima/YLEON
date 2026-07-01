
-- Composite index for filtered product queries (brand + category + name)
CREATE INDEX IF NOT EXISTS idx_products_brand_category_name 
ON public.products (brand_id, category, name);

-- Index for name search (ilike) using pg_trgm
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_products_name_trgm 
ON public.products USING gin (name gin_trgm_ops);

-- Index for featured products lookup
CREATE INDEX IF NOT EXISTS idx_featured_products_product_id 
ON public.featured_products (product_id);

-- Index for product_style_tags lookup
CREATE INDEX IF NOT EXISTS idx_product_style_tags_product_id 
ON public.product_style_tags (product_id);

-- Index for product_environments lookup
CREATE INDEX IF NOT EXISTS idx_product_environments_product_id 
ON public.product_environments (product_id);

-- Index for brand_categories lookup
CREATE INDEX IF NOT EXISTS idx_brand_categories_brand_id 
ON public.brand_categories (brand_id);

-- Index for finish_categories by brand
CREATE INDEX IF NOT EXISTS idx_finish_categories_brand_id 
ON public.finish_categories (brand_id);

-- Index for finishes by category
CREATE INDEX IF NOT EXISTS idx_finishes_finish_category_id 
ON public.finishes (finish_category_id);

-- Index for product_finish_categories lookup
CREATE INDEX IF NOT EXISTS idx_product_finish_categories_product_id 
ON public.product_finish_categories (product_id);

-- Index for favorites lookup
CREATE INDEX IF NOT EXISTS idx_favorites_user_product 
ON public.favorites (user_id, product_id);
