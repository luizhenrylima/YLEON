-- Make architect favorite brands resilient and explicit.
-- Single-store operation: no tenant/store columns.

CREATE TABLE IF NOT EXISTS public.architect_brand_favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_architect_brand_favorites_user
ON public.architect_brand_favorites(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_architect_brand_favorites_brand
ON public.architect_brand_favorites(brand_id);

ALTER TABLE public.architect_brand_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own favorite brands" ON public.architect_brand_favorites;
DROP POLICY IF EXISTS "Users read own favorite brands" ON public.architect_brand_favorites;
DROP POLICY IF EXISTS "Users insert own favorite brands" ON public.architect_brand_favorites;
DROP POLICY IF EXISTS "Users delete own favorite brands" ON public.architect_brand_favorites;

CREATE POLICY "Users read own favorite brands"
ON public.architect_brand_favorites
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR public.is_staff((SELECT auth.uid())));

CREATE POLICY "Users insert own favorite brands"
ON public.architect_brand_favorites
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users delete own favorite brands"
ON public.architect_brand_favorites
FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()) OR public.is_staff((SELECT auth.uid())));

GRANT SELECT, INSERT, DELETE
ON public.architect_brand_favorites
TO authenticated;
