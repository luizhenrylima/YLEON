-- Lock marketing writes to admins and allow shared-project public links
-- to read only the catalog rows referenced by the share token.

DROP POLICY IF EXISTS "Public can view marketing events" ON public.marketing_events;
DROP POLICY IF EXISTS "Public can insert marketing events" ON public.marketing_events;
DROP POLICY IF EXISTS "Public can update marketing events" ON public.marketing_events;
DROP POLICY IF EXISTS "Public can delete marketing events" ON public.marketing_events;
DROP POLICY IF EXISTS "Admins can view marketing events" ON public.marketing_events;
DROP POLICY IF EXISTS "Admins can insert marketing events" ON public.marketing_events;
DROP POLICY IF EXISTS "Admins can update marketing events" ON public.marketing_events;
DROP POLICY IF EXISTS "Admins can delete marketing events" ON public.marketing_events;

CREATE POLICY "Admins can view marketing events"
ON public.marketing_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can insert marketing events"
ON public.marketing_events
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update marketing events"
ON public.marketing_events
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete marketing events"
ON public.marketing_events
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Public read marketing-previews" ON storage.objects;
DROP POLICY IF EXISTS "Public insert marketing-previews" ON storage.objects;
DROP POLICY IF EXISTS "Public update marketing-previews" ON storage.objects;
DROP POLICY IF EXISTS "Public delete marketing-previews" ON storage.objects;
DROP POLICY IF EXISTS "Admins can insert marketing-previews" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update marketing-previews" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete marketing-previews" ON storage.objects;

CREATE POLICY "Public read marketing-previews"
ON storage.objects
FOR SELECT
USING (bucket_id = 'marketing-previews');

CREATE POLICY "Admins can insert marketing-previews"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'marketing-previews'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can update marketing-previews"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'marketing-previews'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'marketing-previews'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can delete marketing-previews"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'marketing-previews'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Anon can view shared project products" ON public.products;
DROP POLICY IF EXISTS "Anon can view shared project brands" ON public.brands;
DROP POLICY IF EXISTS "Anon can view shared project finishes" ON public.finishes;

CREATE POLICY "Anon can view shared project products"
ON public.products
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.project_items pi
    JOIN public.projects p ON p.id = pi.project_id
    WHERE pi.product_id = products.id
      AND p.share_token IS NOT NULL
      AND p.share_token = current_setting('request.headers', true)::json->>'x-share-token'
  )
);

CREATE POLICY "Anon can view shared project brands"
ON public.brands
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.products pr
    JOIN public.project_items pi ON pi.product_id = pr.id
    JOIN public.projects p ON p.id = pi.project_id
    WHERE pr.brand_id = brands.id
      AND p.share_token IS NOT NULL
      AND p.share_token = current_setting('request.headers', true)::json->>'x-share-token'
  )
);

CREATE POLICY "Anon can view shared project finishes"
ON public.finishes
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.project_items pi
    JOIN public.projects p ON p.id = pi.project_id
    WHERE (pi.selected_finish_id = finishes.id OR pi.selected_finish_id_2 = finishes.id)
      AND p.share_token IS NOT NULL
      AND p.share_token = current_setting('request.headers', true)::json->>'x-share-token'
  )
);
