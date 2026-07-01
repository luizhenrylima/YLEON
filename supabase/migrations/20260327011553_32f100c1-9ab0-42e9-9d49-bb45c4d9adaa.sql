
CREATE TABLE public.product_finish_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  finish_category_id uuid NOT NULL REFERENCES public.finish_categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, finish_category_id)
);

ALTER TABLE public.product_finish_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view product_finish_categories"
  ON public.product_finish_categories FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert product_finish_categories"
  ON public.product_finish_categories FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete product_finish_categories"
  ON public.product_finish_categories FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE INDEX idx_product_finish_categories_product ON public.product_finish_categories(product_id);
CREATE INDEX idx_product_finish_categories_category ON public.product_finish_categories(finish_category_id);
