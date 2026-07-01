-- Relationship area between the single store operation and architects.
-- No tenant/store structure is introduced.

CREATE TABLE IF NOT EXISTS public.architect_brand_favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, brand_id)
);

CREATE TABLE IF NOT EXISTS public.relationship_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_type text NOT NULL,
  title text NOT NULL,
  summary text,
  body text,
  event_date timestamp with time zone,
  cta_label text,
  cta_url text,
  cover_image_url text,
  is_published boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT relationship_posts_type_check CHECK (
    post_type IN (
      'lancamento',
      'treinamento',
      'campanha',
      'beneficio',
      'condicao_especial',
      'evento',
      'tendencia_acabamentos'
    )
  ),
  CONSTRAINT relationship_posts_title_len CHECK (char_length(title) BETWEEN 2 AND 140),
  CONSTRAINT relationship_posts_summary_len CHECK (summary IS NULL OR char_length(summary) <= 260),
  CONSTRAINT relationship_posts_body_len CHECK (body IS NULL OR char_length(body) <= 2500),
  CONSTRAINT relationship_posts_cta_label_len CHECK (cta_label IS NULL OR char_length(cta_label) <= 80),
  CONSTRAINT relationship_posts_cta_url_len CHECK (cta_url IS NULL OR char_length(cta_url) <= 500),
  CONSTRAINT relationship_posts_cover_image_url_len CHECK (cover_image_url IS NULL OR char_length(cover_image_url) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_architect_brand_favorites_user
ON public.architect_brand_favorites(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_architect_brand_favorites_brand
ON public.architect_brand_favorites(brand_id);

CREATE INDEX IF NOT EXISTS idx_relationship_posts_published_date
ON public.relationship_posts(is_published, event_date DESC NULLS LAST, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_relationship_posts_type_date
ON public.relationship_posts(post_type, event_date DESC NULLS LAST, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_relationship_posts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_relationship_posts_updated_at ON public.relationship_posts;
CREATE TRIGGER trg_relationship_posts_updated_at
BEFORE UPDATE ON public.relationship_posts
FOR EACH ROW
EXECUTE FUNCTION public.set_relationship_posts_updated_at();

ALTER TABLE public.architect_brand_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own favorite brands" ON public.architect_brand_favorites;
CREATE POLICY "Users manage own favorite brands"
ON public.architect_brand_favorites
FOR ALL TO authenticated
USING (user_id = auth.uid() OR public.is_staff(auth.uid()))
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated can read published relationship posts" ON public.relationship_posts;
CREATE POLICY "Authenticated can read published relationship posts"
ON public.relationship_posts
FOR SELECT TO authenticated
USING (is_published = true OR public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can manage relationship posts" ON public.relationship_posts;
CREATE POLICY "Staff can manage relationship posts"
ON public.relationship_posts
FOR ALL TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.architect_brand_favorites, public.relationship_posts
TO authenticated;
