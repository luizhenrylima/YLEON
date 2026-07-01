CREATE TABLE IF NOT EXISTS public.product_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  download_type text NOT NULL CHECK (download_type IN ('tech_sheet', '2d', '3d')),
  label text NOT NULL,
  url text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (product_id, download_type, label, url)
);

ALTER TABLE public.product_downloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved or admin can view product downloads" ON public.product_downloads;
DROP POLICY IF EXISTS "Admins can insert product downloads" ON public.product_downloads;
DROP POLICY IF EXISTS "Admins can update product downloads" ON public.product_downloads;
DROP POLICY IF EXISTS "Admins can delete product downloads" ON public.product_downloads;
DROP POLICY IF EXISTS "Anon can view shared project product downloads" ON public.product_downloads;

CREATE POLICY "Approved or admin can view product downloads"
ON public.product_downloads
FOR SELECT
TO authenticated
USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can insert product downloads"
ON public.product_downloads
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update product downloads"
ON public.product_downloads
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete product downloads"
ON public.product_downloads
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Anon can view shared project product downloads"
ON public.product_downloads
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.project_items pi
    JOIN public.projects p ON p.id = pi.project_id
    WHERE pi.product_id = product_downloads.product_id
      AND p.share_token IS NOT NULL
      AND p.share_token = current_setting('request.headers', true)::json->>'x-share-token'
  )
);

CREATE INDEX IF NOT EXISTS idx_product_downloads_product_id
ON public.product_downloads(product_id);

CREATE INDEX IF NOT EXISTS idx_product_downloads_product_type_order
ON public.product_downloads(product_id, download_type, display_order);
