ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ambient_images text[] DEFAULT ARRAY[]::text[];

UPDATE public.products
SET
  ambient_images = images[6:8],
  images = images[1:5]
WHERE images IS NOT NULL
  AND cardinality(images) > 5
  AND (ambient_images IS NULL OR cardinality(ambient_images) = 0);
