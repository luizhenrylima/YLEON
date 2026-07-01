
CREATE TABLE public.brand_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(brand_id, category_id)
);

ALTER TABLE public.brand_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view brand_categories"
  ON public.brand_categories FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert brand_categories"
  ON public.brand_categories FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete brand_categories"
  ON public.brand_categories FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
