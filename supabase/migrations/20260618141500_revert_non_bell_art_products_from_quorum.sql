-- Revert products that were incorrectly moved to Quorum by the broad name match.
-- Only the listed product IDs are changed. Products imported from Bell Art stay in Quorum.

CREATE OR REPLACE FUNCTION pg_temp.catalog_name_key(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(
    regexp_replace(
      translate(
        lower(coalesce(value, '')),
        'áàãâäéèêëíìîïóòõôöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn'
      ),
      '\s+',
      ' ',
      'g'
    )
  )
$$;

WITH true_brands(name, segment) AS (
  VALUES
    ('America Moveis', 'premium'),
    ('Essenza Moveis', 'premium'),
    ('JHOVINI Móveis', 'premium'),
    ('Doimo Conceito', 'premium'),
    ('Folio', 'premium')
)
INSERT INTO public.brands (name, segment)
SELECT tb.name, tb.segment
FROM true_brands tb
WHERE NOT EXISTS (
  SELECT 1
  FROM public.brands b
  WHERE pg_temp.catalog_name_key(b.name) = pg_temp.catalog_name_key(tb.name)
);

WITH restore_map(product_id, brand_name) AS (
  VALUES
    ('2b95bf36-a89d-4eee-9ed3-6e3a64e53b69'::uuid, 'America Moveis'),
    ('27269056-2cba-4ef3-9cd1-2d5926bd86fc'::uuid, 'America Moveis'),
    ('fbda6896-4af7-41cc-9795-01009a842d13'::uuid, 'Essenza Moveis'),
    ('6ba78c2d-2832-45a5-ba03-183be04918b6'::uuid, 'Essenza Moveis'),
    ('6d5656b4-21b5-4afe-a8bb-444d758c95c6'::uuid, 'JHOVINI Móveis'),
    ('7bf451f3-601d-478a-b8c2-820139fed04a'::uuid, 'JHOVINI Móveis'),
    ('a9643a68-5571-4d8f-8071-28dc17350e92'::uuid, 'Doimo Conceito'),
    ('b7d24a97-0f77-4df2-aac8-c99961c877b2'::uuid, 'Folio'),
    ('ab07e344-3678-41c3-ad14-365b24633e6f'::uuid, 'Folio'),
    ('a75d7903-f762-4e68-b301-f243b6dbbeb9'::uuid, 'Folio')
),
target_brands AS (
  SELECT rm.product_id, b.id AS brand_id
  FROM restore_map rm
  JOIN public.brands b ON pg_temp.catalog_name_key(b.name) = pg_temp.catalog_name_key(rm.brand_name)
)
UPDATE public.products p
SET
  brand_id = tb.brand_id,
  designer_id = NULL
FROM target_brands tb
WHERE p.id = tb.product_id;

WITH restore_ids(product_id) AS (
  VALUES
    ('2b95bf36-a89d-4eee-9ed3-6e3a64e53b69'::uuid),
    ('27269056-2cba-4ef3-9cd1-2d5926bd86fc'::uuid),
    ('fbda6896-4af7-41cc-9795-01009a842d13'::uuid),
    ('6ba78c2d-2832-45a5-ba03-183be04918b6'::uuid),
    ('6d5656b4-21b5-4afe-a8bb-444d758c95c6'::uuid),
    ('7bf451f3-601d-478a-b8c2-820139fed04a'::uuid),
    ('a9643a68-5571-4d8f-8071-28dc17350e92'::uuid),
    ('b7d24a97-0f77-4df2-aac8-c99961c877b2'::uuid),
    ('ab07e344-3678-41c3-ad14-365b24633e6f'::uuid),
    ('a75d7903-f762-4e68-b301-f243b6dbbeb9'::uuid)
)
DELETE FROM public.product_style_tags pst
USING restore_ids ri, public.design_style_tags dst
WHERE pst.product_id = ri.product_id
  AND dst.id = pst.style_tag_id
  AND pg_temp.catalog_name_key(dst.name) IN (
    pg_temp.catalog_name_key('Arthur Casas'),
    pg_temp.catalog_name_key('Crystian Freiberger'),
    pg_temp.catalog_name_key('Larissa Diegoli'),
    pg_temp.catalog_name_key('Ricardo Barddal'),
    pg_temp.catalog_name_key('Ramon Zancanaro'),
    pg_temp.catalog_name_key('Everton Souza'),
    pg_temp.catalog_name_key('Studio Quorum')
  );

WITH affected_brands AS (
  SELECT id
  FROM public.brands
  WHERE pg_temp.catalog_name_key(name) IN (
    pg_temp.catalog_name_key('America Moveis'),
    pg_temp.catalog_name_key('Essenza Moveis'),
    pg_temp.catalog_name_key('JHOVINI Móveis'),
    pg_temp.catalog_name_key('Doimo Conceito'),
    pg_temp.catalog_name_key('Folio')
  )
)
INSERT INTO public.brand_categories (brand_id, category_id)
SELECT DISTINCT p.brand_id, c.id
FROM public.products p
JOIN affected_brands ab ON ab.id = p.brand_id
JOIN public.categories c ON pg_temp.catalog_name_key(c.name) = pg_temp.catalog_name_key(p.category)
ON CONFLICT (brand_id, category_id) DO NOTHING;

DELETE FROM public.brand_categories bc
USING public.brands b, public.categories c
WHERE b.id = bc.brand_id
  AND c.id = bc.category_id
  AND pg_temp.catalog_name_key(b.name) = pg_temp.catalog_name_key('Quorum')
  AND NOT EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.brand_id = bc.brand_id
      AND pg_temp.catalog_name_key(p.category) = pg_temp.catalog_name_key(c.name)
  );
