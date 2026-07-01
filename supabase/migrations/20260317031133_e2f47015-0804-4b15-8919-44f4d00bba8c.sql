
-- Finish categories per brand (e.g. "Laminados de Madeira", "Laqueados", "Tecidos")
CREATE TABLE public.finish_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Individual finish items
CREATE TABLE public.finishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finish_category_id uuid NOT NULL REFERENCES public.finish_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  image_url text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.finish_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finishes ENABLE ROW LEVEL SECURITY;

-- Select policies (authenticated users)
CREATE POLICY "Anyone authenticated can view finish_categories" ON public.finish_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone authenticated can view finishes" ON public.finishes FOR SELECT TO authenticated USING (true);

-- Admin insert/update/delete for finish_categories
CREATE POLICY "Admins can insert finish_categories" ON public.finish_categories FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update finish_categories" ON public.finish_categories FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete finish_categories" ON public.finish_categories FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Admin insert/update/delete for finishes
CREATE POLICY "Admins can insert finishes" ON public.finishes FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update finishes" ON public.finishes FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete finishes" ON public.finishes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
