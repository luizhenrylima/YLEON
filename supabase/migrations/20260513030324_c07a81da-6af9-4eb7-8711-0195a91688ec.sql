
CREATE TABLE public.designers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  photo_url text,
  bio text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.designers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved or admin can view designers" ON public.designers
  FOR SELECT TO authenticated
  USING (is_approved(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert designers" ON public.designers
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update designers" ON public.designers
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete designers" ON public.designers
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.products ADD COLUMN designer_id uuid REFERENCES public.designers(id) ON DELETE SET NULL;
CREATE INDEX idx_products_designer_id ON public.products(designer_id);
