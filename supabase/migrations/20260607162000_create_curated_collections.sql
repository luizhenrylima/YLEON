CREATE TABLE IF NOT EXISTS public.curated_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  cover_image text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.curated_collection_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.curated_collections(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(collection_id, product_id)
);

ALTER TABLE public.curated_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curated_collection_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved or admin can view curated collections" ON public.curated_collections;
DROP POLICY IF EXISTS "Admins can insert curated collections" ON public.curated_collections;
DROP POLICY IF EXISTS "Admins can update curated collections" ON public.curated_collections;
DROP POLICY IF EXISTS "Admins can delete curated collections" ON public.curated_collections;

CREATE POLICY "Approved or admin can view curated collections"
ON public.curated_collections
FOR SELECT
TO authenticated
USING (
  public.is_approved((SELECT auth.uid()))
  OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
);

CREATE POLICY "Admins can insert curated collections"
ON public.curated_collections
FOR INSERT
TO authenticated
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

CREATE POLICY "Admins can update curated collections"
ON public.curated_collections
FOR UPDATE
TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

CREATE POLICY "Admins can delete curated collections"
ON public.curated_collections
FOR DELETE
TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Approved or admin can view curated collection products" ON public.curated_collection_products;
DROP POLICY IF EXISTS "Admins can insert curated collection products" ON public.curated_collection_products;
DROP POLICY IF EXISTS "Admins can update curated collection products" ON public.curated_collection_products;
DROP POLICY IF EXISTS "Admins can delete curated collection products" ON public.curated_collection_products;

CREATE POLICY "Approved or admin can view curated collection products"
ON public.curated_collection_products
FOR SELECT
TO authenticated
USING (
  public.is_approved((SELECT auth.uid()))
  OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
);

CREATE POLICY "Admins can insert curated collection products"
ON public.curated_collection_products
FOR INSERT
TO authenticated
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

CREATE POLICY "Admins can update curated collection products"
ON public.curated_collection_products
FOR UPDATE
TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

CREATE POLICY "Admins can delete curated collection products"
ON public.curated_collection_products
FOR DELETE
TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_curated_collections_active_order
ON public.curated_collections(is_active, display_order, created_at);

CREATE INDEX IF NOT EXISTS idx_curated_collection_products_collection_order
ON public.curated_collection_products(collection_id, display_order);

INSERT INTO public.curated_collections (title, description, display_order, is_active)
VALUES
  ('Linha alto padrão', 'Uma seleção de peças com presença, acabamento superior e leitura sofisticada para projetos de maior valor percebido.', 0, true),
  ('Peças assinadas', 'Produtos com autoria e desenho marcante para composições que pedem identidade.', 1, true),
  ('Design brasileiro', 'Curadoria de mobiliário com linguagem nacional, materiais quentes e proporções contemporâneas.', 2, true),
  ('Suíte master premium', 'Camas, apoios, poltronas e complementos para suítes de alto padrão.', 3, true),
  ('Produtos para pronta entrega', 'Sugestões para projetos com prazo curto e tomada de decisão objetiva.', 4, true)
ON CONFLICT DO NOTHING;
