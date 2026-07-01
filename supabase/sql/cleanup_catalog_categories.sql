begin;

create schema if not exists maintenance;

create or replace function pg_temp.category_key(value text)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(coalesce(value, ''));
begin
  v := replace(v, '&', ' e ');
  v := replace(v, '|', ' ');
  v := replace(v, U&'\00E1', 'a');
  v := replace(v, U&'\00E0', 'a');
  v := replace(v, U&'\00E2', 'a');
  v := replace(v, U&'\00E3', 'a');
  v := replace(v, U&'\00E4', 'a');
  v := replace(v, U&'\00E9', 'e');
  v := replace(v, U&'\00EA', 'e');
  v := replace(v, U&'\00E8', 'e');
  v := replace(v, U&'\00EB', 'e');
  v := replace(v, U&'\00ED', 'i');
  v := replace(v, U&'\00EC', 'i');
  v := replace(v, U&'\00EE', 'i');
  v := replace(v, U&'\00EF', 'i');
  v := replace(v, U&'\00F3', 'o');
  v := replace(v, U&'\00F2', 'o');
  v := replace(v, U&'\00F4', 'o');
  v := replace(v, U&'\00F5', 'o');
  v := replace(v, U&'\00F6', 'o');
  v := replace(v, U&'\00FA', 'u');
  v := replace(v, U&'\00F9', 'u');
  v := replace(v, U&'\00FB', 'u');
  v := replace(v, U&'\00FC', 'u');
  v := replace(v, U&'\00E7', 'c');
  v := replace(v, U&'\00F1', 'n');
  v := regexp_replace(v, '[^a-z0-9]+', ' ', 'g');
  v := regexp_replace(v, ' +', ' ', 'g');
  return trim(v);
end;
$$;

create or replace function pg_temp.compact_category_source(category_name text)
returns text
language plpgsql
immutable
as $$
declare
  v text := pg_temp.category_key(category_name);
begin
  if v like 'arquivos %' then
    v := regexp_replace(v, '^arquivos +', '');
  end if;
  v := regexp_replace(v, ' +tissot +arte +e +atitude.*$', '');
  return trim(v);
end;
$$;

create or replace function pg_temp.infer_catalog_category(key text)
returns text
language plpgsql
immutable
as $$
begin
  if key is null or key = '' then return null; end if;
  if key ~ '(^| )(mesa|mesas) (de )?(cabeceira|cabeceiras)( |$)' or key ~ '(^| )criados?( |$)' or key ~ '(^| )criado mudo( |$)' or key ~ '(^| )bedside( |$)' then return 'Mesas de Cabeceira'; end if;
  if key ~ '(^| )(mesa|mesas) (de )?(centro|central)( |$)' then return 'Mesas de Centro'; end if;
  if key ~ '(^| )(mesa|mesas) (lateral|laterais|auxiliar|auxiliares|apoio)( |$)' then return 'Mesas Laterais'; end if;
  if key ~ '(^| )(mesa|mesas) (de )?jantar( |$)' then return 'Mesas de Jantar'; end if;
  if key ~ '(^| )(carros? bar|mesa bar|bar|bares)( |$)' then return 'Bares'; end if;
  if key ~ '(^| )aparador(es)?( |$)' then return 'Aparadores'; end if;
  if key ~ '(^| )buffets?( |$)' or key ~ '(^| )balcao( |$)' then return 'Buffets'; end if;
  if key ~ '(^| )banquetas?( |$)' then return 'Banquetas'; end if;
  if key ~ '(^| )cadeiras?( |$)' then return 'Cadeiras'; end if;
  if key ~ '(^| )bancos?( |$)' then return 'Bancos'; end if;
  if key ~ '(^| )bandejas?( |$)' then return 'Bandejas'; end if;
  if key ~ '(^| )(puffs?|pufes?)( |$)' then return 'Pufes'; end if;
  if key ~ '(^| )poltronas?( |$)' or key ~ '(^| )namoradeiras?( |$)' then return 'Poltronas'; end if;
  if key ~ '(^| )sofas?( |$)' then return 'Sofás'; end if;
  if key ~ '(^| )camas?( |$)' or key ~ '(^| )chaises?( |$)' then return 'Camas'; end if;
  if key ~ '(^| )escrivaninhas?( |$)' or key ~ '(^| )penteadeiras?( |$)' or key ~ '(^| )home office( |$)' then return 'Escrivaninhas'; end if;
  if key ~ '(^| )racks?( |$)' or key ~ '(^| )home( |$)' then return 'Racks'; end if;
  if key ~ '(^| )estantes?( |$)' then return 'Estantes'; end if;
  if key ~ '(^| )mancebos?( |$)' then return 'Mancebos'; end if;
  if key ~ '(^| )espelhos?( |$)' then return 'Espelhos'; end if;
  if key ~ '(^| )cristaleiras?( |$)' then return 'Cristaleiras'; end if;
  if key ~ '(^| )luminarias?( |$)' then return 'Luminárias'; end if;
  if key ~ '(^| )comodas?( |$)' then return 'Cômodas'; end if;
  if key ~ '(^| )carrinhos?( |$)' then return 'Carrinhos'; end if;
  if key ~ '(^| )vasos?( |$)' then return 'Vasos'; end if;
  if key ~ '(^| )mesas?( |$)' then return 'Mesas de Jantar'; end if;
  return null;
end;
$$;

create or replace function pg_temp.normalize_catalog_category(category_name text, product_signal text)
returns text
language plpgsql
immutable
as $$
declare
  source_key text := pg_temp.compact_category_source(category_name);
  product_key text := pg_temp.category_key(product_signal);
  from_product text := pg_temp.infer_catalog_category(product_key);
  from_source text := pg_temp.infer_catalog_category(source_key);
  source_is_composite boolean := source_key ~ '(^| )(e)( |$)'
    or source_key like '% aparadores buffets e bares%'
    or source_key like 'aparadores buffets e bares%'
    or source_key like '%puffs e bancos%'
    or source_key like '%cadeiras e banquetas%'
    or source_key like '%mesas de centro e laterais%'
    or source_key like '%espelhos e mancebos%'
    or source_key like '%biombos e estantes%'
    or source_key like '%biombos e mancebos%'
    or source_key = 'pt';
begin
  if source_is_composite and from_product is not null then return from_product; end if;
  if from_source is not null then return from_source; end if;
  if from_product is not null then return from_product; end if;
  if source_key = 'pt' then return 'Mesas de Cabeceira'; end if;
  return null;
end;
$$;

create table if not exists maintenance.category_cleanup_backup_20260522 (
  product_id uuid primary key,
  product_name text not null,
  brand_id uuid not null,
  old_category text not null,
  new_category text,
  backed_up_at timestamptz not null default now()
);

insert into maintenance.category_cleanup_backup_20260522 (
  product_id,
  product_name,
  brand_id,
  old_category,
  new_category
)
select
  p.id,
  p.name,
  p.brand_id,
  p.category,
  pg_temp.normalize_catalog_category(p.category, concat_ws(' ', p.name, p.description, p.tech_sheet))
from public.products p
on conflict (product_id) do nothing;

update maintenance.category_cleanup_backup_20260522 backup
set new_category = pg_temp.normalize_catalog_category(backup.old_category, concat_ws(' ', p.name, p.description, p.tech_sheet))
from public.products p
where p.id = backup.product_id;

create table if not exists maintenance.brand_category_cleanup_backup_20260522 (
  brand_id uuid not null,
  old_category_id uuid not null,
  old_category_name text not null,
  new_category text,
  backed_up_at timestamptz not null default now(),
  primary key (brand_id, old_category_id)
);

insert into maintenance.brand_category_cleanup_backup_20260522 (
  brand_id,
  old_category_id,
  old_category_name,
  new_category
)
select
  bc.brand_id,
  c.id,
  c.name,
  pg_temp.normalize_catalog_category(c.name, c.name)
from public.brand_categories bc
join public.categories c on c.id = bc.category_id
on conflict (brand_id, old_category_id) do nothing;

update maintenance.brand_category_cleanup_backup_20260522 backup
set new_category = pg_temp.normalize_catalog_category(backup.old_category_name, backup.old_category_name);

do $$
declare
  unknown_count integer;
begin
  select count(*)
  into unknown_count
  from public.products p
  left join maintenance.category_cleanup_backup_20260522 backup on backup.product_id = p.id
  where pg_temp.normalize_catalog_category(coalesce(backup.old_category, p.category), concat_ws(' ', p.name, p.description, p.tech_sheet)) is null;

  if unknown_count > 0 then
    raise exception 'category cleanup stopped: % products have no safe canonical category', unknown_count;
  end if;
end;
$$;

with mapped_products as (
  select
    p.id,
    pg_temp.normalize_catalog_category(coalesce(backup.old_category, p.category), concat_ws(' ', p.name, p.description, p.tech_sheet)) as new_category
  from public.products p
  left join maintenance.category_cleanup_backup_20260522 backup on backup.product_id = p.id
)
update public.products p
set category = mapped_products.new_category
from mapped_products
where p.id = mapped_products.id
  and p.category is distinct from mapped_products.new_category;

with canonical_categories(name) as (
  values
    ('Aparadores'),
    ('Bandejas'),
    ('Bancos'),
    ('Banquetas'),
    ('Bares'),
    ('Buffets'),
    ('Cadeiras'),
    ('Camas'),
    ('Carrinhos'),
    ('Cômodas'),
    ('Cristaleiras'),
    ('Escrivaninhas'),
    ('Espelhos'),
    ('Estantes'),
    ('Luminárias'),
    ('Mancebos'),
    ('Mesas de Cabeceira'),
    ('Mesas de Centro'),
    ('Mesas de Jantar'),
    ('Mesas Laterais'),
    ('Poltronas'),
    ('Pufes'),
    ('Racks'),
    ('Sofás'),
    ('Vasos')
),
needed_categories as (
  select name from canonical_categories
  union
  select distinct category from public.products
)
insert into public.categories (name)
select name from needed_categories
on conflict (name) do nothing;

with mapped_brand_categories as (
  select distinct
    bcb.brand_id,
    c_new.id as category_id
  from maintenance.brand_category_cleanup_backup_20260522 bcb
  join public.categories c_new on c_new.name = bcb.new_category
  where bcb.new_category is not null
),
brand_product_categories as (
  select distinct
    p.brand_id,
    c.id as category_id
  from public.products p
  join public.categories c on c.name = p.category
),
all_brand_categories as (
  select * from mapped_brand_categories
  union
  select * from brand_product_categories
)
insert into public.brand_categories (brand_id, category_id)
select brand_id, category_id
from all_brand_categories
on conflict (brand_id, category_id) do nothing;

with canonical_categories(name) as (
  values
    ('Aparadores'),
    ('Bandejas'),
    ('Bancos'),
    ('Banquetas'),
    ('Bares'),
    ('Buffets'),
    ('Cadeiras'),
    ('Camas'),
    ('Carrinhos'),
    ('Cômodas'),
    ('Cristaleiras'),
    ('Escrivaninhas'),
    ('Espelhos'),
    ('Estantes'),
    ('Luminárias'),
    ('Mancebos'),
    ('Mesas de Cabeceira'),
    ('Mesas de Centro'),
    ('Mesas de Jantar'),
    ('Mesas Laterais'),
    ('Poltronas'),
    ('Pufes'),
    ('Racks'),
    ('Sofás'),
    ('Vasos')
),
kept_categories as (
  select name from canonical_categories
  union
  select distinct category from public.products
)
delete from public.categories c
where not exists (
  select 1 from kept_categories kept where kept.name = c.name
);

delete from public.brand_categories bc
where not exists (
  select 1
  from public.products p
  join public.categories c on c.name = p.category
  where p.brand_id = bc.brand_id
    and c.id = bc.category_id
);

select
  'products_before' as check_name,
  count(*)::text as value
from maintenance.category_cleanup_backup_20260522
union all
select
  'products_after',
  count(*)::text
from public.products
union all
select
  'renamed_products',
  count(*)::text
from maintenance.category_cleanup_backup_20260522
where old_category is distinct from new_category
union all
select
  'category_rows_after',
  count(*)::text
from public.categories;

commit;
