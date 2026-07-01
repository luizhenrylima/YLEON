
-- Fix 1: brand_categories SELECT policy - restrict to authenticated only
DROP POLICY IF EXISTS "Anyone authenticated can view brand_categories" ON public.brand_categories;
CREATE POLICY "Anyone authenticated can view brand_categories"
  ON public.brand_categories FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'));

-- Also fix INSERT/DELETE on brand_categories to require authenticated
DROP POLICY IF EXISTS "Admins can insert brand_categories" ON public.brand_categories;
CREATE POLICY "Admins can insert brand_categories"
  ON public.brand_categories FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete brand_categories" ON public.brand_categories;
CREATE POLICY "Admins can delete brand_categories"
  ON public.brand_categories FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Fix 2: Add is_approved() to all catalog SELECT policies

-- brands
DROP POLICY IF EXISTS "Anyone authenticated can view brands" ON public.brands;
CREATE POLICY "Anyone authenticated can view brands"
  ON public.brands FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'));

-- products
DROP POLICY IF EXISTS "Anyone authenticated can view products" ON public.products;
CREATE POLICY "Anyone authenticated can view products"
  ON public.products FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'));

-- categories
DROP POLICY IF EXISTS "Anyone authenticated can view categories" ON public.categories;
CREATE POLICY "Anyone authenticated can view categories"
  ON public.categories FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'));

-- finishes
DROP POLICY IF EXISTS "Anyone authenticated can view finishes" ON public.finishes;
CREATE POLICY "Anyone authenticated can view finishes"
  ON public.finishes FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'));

-- finish_categories
DROP POLICY IF EXISTS "Anyone authenticated can view finish_categories" ON public.finish_categories;
CREATE POLICY "Anyone authenticated can view finish_categories"
  ON public.finish_categories FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'));

-- environments
DROP POLICY IF EXISTS "Anyone authenticated can view environments" ON public.environments;
CREATE POLICY "Anyone authenticated can view environments"
  ON public.environments FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'));

-- product_environments
DROP POLICY IF EXISTS "Anyone authenticated can view product_environments" ON public.product_environments;
CREATE POLICY "Anyone authenticated can view product_environments"
  ON public.product_environments FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'));

-- product_style_tags
DROP POLICY IF EXISTS "Anyone authenticated can view product style tags" ON public.product_style_tags;
CREATE POLICY "Anyone authenticated can view product style tags"
  ON public.product_style_tags FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'));

-- design_style_tags
DROP POLICY IF EXISTS "Anyone authenticated can view style tags" ON public.design_style_tags;
CREATE POLICY "Anyone authenticated can view style tags"
  ON public.design_style_tags FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'));

-- featured_products
DROP POLICY IF EXISTS "Anyone authenticated can view featured products" ON public.featured_products;
CREATE POLICY "Anyone authenticated can view featured products"
  ON public.featured_products FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'));

-- featured_designers
DROP POLICY IF EXISTS "Anyone authenticated can view featured_designers" ON public.featured_designers;
CREATE POLICY "Anyone authenticated can view featured_designers"
  ON public.featured_designers FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'));

-- landing_images
DROP POLICY IF EXISTS "Anyone authenticated can view landing_images" ON public.landing_images;
CREATE POLICY "Anyone authenticated can view landing_images"
  ON public.landing_images FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'));
