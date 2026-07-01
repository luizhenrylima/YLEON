-- Move any remaining products from the requested Quorum designer/collab list,
-- even if a previous import attached them to another brand.

CREATE OR REPLACE FUNCTION pg_temp.catalog_name_key(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        translate(
          lower(coalesce(value, '')),
          'áàãâäéèêëíìîïóòõôöúùûüçñ',
          'aaaaaeeeeiiiiooooouuuucn'
        ),
        '\.html\s*$',
        '',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  )
$$;

CREATE OR REPLACE FUNCTION pg_temp.catalog_product_key(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT pg_temp.catalog_name_key(
    regexp_replace(
      regexp_replace(
        coalesce(value, ''),
        '\s*[-–|]?\s*(grupo\s+)?bell\s+art(e)?\s*$',
        '',
        'i'
      ),
      '\s*[-–|]?\s*quorum\s*$',
      '',
      'i'
    )
  )
$$;

WITH product_map(product_name, designer_name) AS (
  VALUES
    ('MATCHON', 'Arthur Casas'),
    ('ARRAIA', 'Arthur Casas'),
    ('BANCO TANGRAM', 'Arthur Casas'),
    ('MESA TANGRAM', 'Arthur Casas'),
    ('PUFF TANGRAM', 'Arthur Casas'),
    ('ESPELHEIRA REDONDA TANGRAM', 'Arthur Casas'),
    ('ESPELHEIRA RETANGULAR TANGRAM', 'Arthur Casas'),
    ('BALANZA', 'Crystian Freiberger'),
    ('INDY', 'Crystian Freiberger'),
    ('SOLTA', 'Crystian Freiberger'),
    ('WAVE', 'Crystian Freiberger'),
    ('PARCO', 'Larissa Diegoli'),
    ('MONTAGGIO', 'Larissa Diegoli'),
    ('GEL', 'Larissa Diegoli'),
    ('REFÚGIO', 'Larissa Diegoli'),
    ('MISTI', 'Larissa Diegoli'),
    ('ASA', 'Larissa Diegoli'),
    ('BOBY', 'Larissa Diegoli'),
    ('LUI', 'Larissa Diegoli'),
    ('CHARRUA', 'Ricardo Barddal'),
    ('OMAWE', 'Ricardo Barddal'),
    ('NORDIC', 'Ricardo Barddal'),
    ('ARCOS DA LAPA', 'Ramon Zancanaro'),
    ('PATER', 'Everton Souza'),
    ('AURORA', 'Studio Quorum'),
    ('MATCH', NULL)
),
target_brand AS (
  SELECT id
  FROM public.brands
  WHERE pg_temp.catalog_name_key(name) = 'quorum'
  ORDER BY created_at DESC
  LIMIT 1
),
matches AS (
  SELECT
    p.id AS product_id,
    tb.id AS quorum_brand_id,
    d.id AS designer_id,
    NULLIF(
      btrim(
        regexp_replace(
          regexp_replace(
            regexp_replace(p.name, '\.html\s*$', '', 'i'),
            '\s*[-–|]?\s*(grupo\s+)?bell\s+art(e)?\s*$',
            '',
            'i'
          ),
          '\s+',
          ' ',
          'g'
        )
      ),
      ''
    ) AS clean_name
  FROM public.products p
  JOIN product_map pm
    ON pg_temp.catalog_product_key(p.name) = pg_temp.catalog_name_key(pm.product_name)
    OR pg_temp.catalog_product_key(p.name) LIKE ('% ' || pg_temp.catalog_name_key(pm.product_name))
  CROSS JOIN target_brand tb
  LEFT JOIN LATERAL (
    SELECT id
    FROM public.designers d
    WHERE pm.designer_name IS NOT NULL
      AND pg_temp.catalog_name_key(d.name) = pg_temp.catalog_name_key(pm.designer_name)
    ORDER BY created_at DESC
    LIMIT 1
  ) d ON true
)
UPDATE public.products p
SET
  brand_id = m.quorum_brand_id,
  designer_id = m.designer_id,
  name = COALESCE(m.clean_name, p.name)
FROM matches m
WHERE p.id = m.product_id;

WITH target_brand AS (
  SELECT id
  FROM public.brands
  WHERE pg_temp.catalog_name_key(name) = 'quorum'
  ORDER BY created_at DESC
  LIMIT 1
)
INSERT INTO public.brand_categories (brand_id, category_id)
SELECT DISTINCT tb.id, c.id
FROM public.products p
CROSS JOIN target_brand tb
JOIN public.categories c ON pg_temp.catalog_name_key(c.name) = pg_temp.catalog_name_key(p.category)
WHERE p.brand_id = tb.id
ON CONFLICT (brand_id, category_id) DO NOTHING;
