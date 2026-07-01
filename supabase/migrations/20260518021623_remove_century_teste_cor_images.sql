UPDATE public.products
SET images = (
  SELECT COALESCE(array_agg(image_url ORDER BY image_order), ARRAY[]::text[])
  FROM unnest(images) WITH ORDINALITY AS product_image(image_url, image_order)
  WHERE image_url !~* 'teste-cor'
)
WHERE images IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM unnest(images) AS product_image(image_url)
    WHERE image_url ~* 'teste-cor'
  );
