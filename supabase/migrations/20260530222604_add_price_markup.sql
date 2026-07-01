alter table public.price_brands
  add column if not exists default_markup_percent numeric(7,2) not null default 0;

alter table public.price_brands
  drop constraint if exists price_brands_default_markup_percent_nonnegative;

alter table public.price_brands
  add constraint price_brands_default_markup_percent_nonnegative
  check (default_markup_percent >= 0);

alter table public.price_products
  add column if not exists markup_percent numeric(7,2);

alter table public.price_products
  drop constraint if exists price_products_markup_percent_nonnegative;

alter table public.price_products
  add constraint price_products_markup_percent_nonnegative
  check (markup_percent is null or markup_percent >= 0);

drop view if exists public.price_search_index;

create view public.price_search_index
with (security_invoker = true)
as
select
  pt.id as price_id,
  pt.tenant_id,
  pt.brand_id,
  pb.name as brand_name,
  pb.default_markup_percent as brand_markup_percent,
  pt.category_id,
  pc.name as category_name,
  pt.product_id,
  pp.name as product_name,
  pp.reference_code,
  pp.source_product_id,
  pp.markup_percent as product_markup_percent,
  coalesce(pp.markup_percent, pb.default_markup_percent, 0) as markup_percent,
  pt.variation_id,
  pv.variation_code,
  pv.variation_name,
  pv.dimensions,
  pv.module,
  pt.finish_id,
  pf.name as finish_name,
  pf.finish_type,
  pf.code as finish_code,
  pt.price as base_price,
  round(pt.price * (1 + (coalesce(pp.markup_percent, pb.default_markup_percent, 0) / 100)), 2) as price,
  pt.currency,
  pt.source_reference
from public.price_table pt
join public.price_brands pb on pb.id = pt.brand_id
join public.price_categories pc on pc.id = pt.category_id
join public.price_products pp on pp.id = pt.product_id
join public.price_product_variations pv on pv.id = pt.variation_id
join public.price_finishes pf on pf.id = pt.finish_id;

grant select on public.price_search_index to authenticated;
