
-- Indexes for faster catalog queries
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON public.products (brand_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products (name);
CREATE INDEX IF NOT EXISTS idx_product_style_tags_product_id ON public.product_style_tags (product_id);
CREATE INDEX IF NOT EXISTS idx_product_style_tags_style_tag_id ON public.product_style_tags (style_tag_id);
CREATE INDEX IF NOT EXISTS idx_product_environments_product_id ON public.product_environments (product_id);
CREATE INDEX IF NOT EXISTS idx_product_environments_environment_id ON public.product_environments (environment_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_product ON public.favorites (user_id, product_id);
CREATE INDEX IF NOT EXISTS idx_project_items_project_id ON public.project_items (project_id);
CREATE INDEX IF NOT EXISTS idx_project_items_product_id ON public.project_items (product_id);
CREATE INDEX IF NOT EXISTS idx_finish_categories_brand_id ON public.finish_categories (brand_id);
CREATE INDEX IF NOT EXISTS idx_finishes_category_id ON public.finishes (finish_category_id);
CREATE INDEX IF NOT EXISTS idx_brand_categories_brand_id ON public.brand_categories (brand_id);
CREATE INDEX IF NOT EXISTS idx_featured_products_product_id ON public.featured_products (product_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects (user_id);
