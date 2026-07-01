DROP POLICY IF EXISTS "Approved or admin can view product downloads" ON public.product_downloads;
DROP POLICY IF EXISTS "Admins can insert product downloads" ON public.product_downloads;
DROP POLICY IF EXISTS "Admins can update product downloads" ON public.product_downloads;
DROP POLICY IF EXISTS "Admins can delete product downloads" ON public.product_downloads;
DROP POLICY IF EXISTS "Anon can view shared project product downloads" ON public.product_downloads;

CREATE POLICY "Approved or admin can view product downloads"
ON public.product_downloads
FOR SELECT
TO authenticated
USING (
  public.is_approved((SELECT auth.uid()))
  OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
);

CREATE POLICY "Admins can insert product downloads"
ON public.product_downloads
FOR INSERT
TO authenticated
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

CREATE POLICY "Admins can update product downloads"
ON public.product_downloads
FOR UPDATE
TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

CREATE POLICY "Admins can delete product downloads"
ON public.product_downloads
FOR DELETE
TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

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
      AND p.share_token = (SELECT current_setting('request.headers', true)::json->>'x-share-token')
  )
);
