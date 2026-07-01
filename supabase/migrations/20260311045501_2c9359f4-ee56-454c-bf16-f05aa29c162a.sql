
-- Design style tags table
CREATE TABLE public.design_style_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.design_style_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view style tags" ON public.design_style_tags
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert style tags" ON public.design_style_tags
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete style tags" ON public.design_style_tags
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Junction table: product <-> style tag
CREATE TABLE public.product_style_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  style_tag_id uuid NOT NULL REFERENCES public.design_style_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, style_tag_id)
);

ALTER TABLE public.product_style_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view product style tags" ON public.product_style_tags
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert product style tags" ON public.product_style_tags
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete product style tags" ON public.product_style_tags
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Featured products table (max 3, managed by admin)
CREATE TABLE public.featured_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE UNIQUE,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.featured_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view featured products" ON public.featured_products
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert featured products" ON public.featured_products
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete featured products" ON public.featured_products
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update featured products" ON public.featured_products
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Seed default style tags
INSERT INTO public.design_style_tags (name) VALUES
  ('Moderno'),
  ('Contemporâneo'),
  ('Clássico'),
  ('Rústico'),
  ('Industrial'),
  ('Minimalista'),
  ('Escandinavo'),
  ('Art Déco');
