CREATE TABLE IF NOT EXISTS public.product_composition_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  suggested_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0 AND display_order < 4),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_composition_suggestions_not_self CHECK (product_id <> suggested_product_id),
  CONSTRAINT product_composition_suggestions_unique_product_order UNIQUE (product_id, display_order),
  CONSTRAINT product_composition_suggestions_unique_suggestion UNIQUE (product_id, suggested_product_id)
);

ALTER TABLE public.product_composition_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved or admin can view product composition suggestions" ON public.product_composition_suggestions;
DROP POLICY IF EXISTS "Admins can insert product composition suggestions" ON public.product_composition_suggestions;
DROP POLICY IF EXISTS "Admins can update product composition suggestions" ON public.product_composition_suggestions;
DROP POLICY IF EXISTS "Admins can delete product composition suggestions" ON public.product_composition_suggestions;

CREATE POLICY "Approved or admin can view product composition suggestions"
ON public.product_composition_suggestions
FOR SELECT
TO authenticated
USING (
  public.is_approved((SELECT auth.uid()))
  OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
);

CREATE POLICY "Admins can insert product composition suggestions"
ON public.product_composition_suggestions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

CREATE POLICY "Admins can update product composition suggestions"
ON public.product_composition_suggestions
FOR UPDATE
TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

CREATE POLICY "Admins can delete product composition suggestions"
ON public.product_composition_suggestions
FOR DELETE
TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_product_composition_suggestions_product_id
ON public.product_composition_suggestions(product_id, display_order);

CREATE INDEX IF NOT EXISTS idx_product_composition_suggestions_suggested_product_id
ON public.product_composition_suggestions(suggested_product_id);
