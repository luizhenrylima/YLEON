
-- Environments table
CREATE TABLE public.environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'home',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.environments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view environments" ON public.environments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert environments" ON public.environments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete environments" ON public.environments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Product-Environment junction
CREATE TABLE public.product_environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  environment_id uuid NOT NULL REFERENCES public.environments(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(product_id, environment_id)
);

ALTER TABLE public.product_environments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view product_environments" ON public.product_environments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert product_environments" ON public.product_environments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete product_environments" ON public.product_environments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Seed default environments
INSERT INTO public.environments (name, icon) VALUES
  ('Sala de Estar', 'sofa'),
  ('Quarto', 'bed-double'),
  ('Home Office', 'monitor'),
  ('Área Externa', 'trees'),
  ('Sala de Jantar', 'utensils-crossed'),
  ('Banheiro / Lavabo', 'bath');
