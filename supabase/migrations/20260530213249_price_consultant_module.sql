-- Isolated price consultant module with tenant-scoped access.

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  primary_color text,
  created_at timestamptz not null default now()
);

alter table public.tenants enable row level security;

alter table public.profiles
  add column if not exists tenant_id uuid references public.tenants(id) on delete set null;

insert into public.tenants (name, slug, primary_color)
values ('Acervo 10.55', 'acervo-1055', '#111111')
on conflict (slug) do update
set name = excluded.name,
    primary_color = excluded.primary_color;

update public.profiles
set tenant_id = (select id from public.tenants where slug = 'acervo-1055')
where tenant_id is null;

create index if not exists idx_profiles_tenant_id on public.profiles(tenant_id);

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from public.profiles
  where user_id = auth.uid()
  limit 1
$$;

grant execute on function public.current_tenant_id() to authenticated;

drop policy if exists "Users can view own tenant" on public.tenants;
create policy "Users can view own tenant"
on public.tenants
for select
to authenticated
using (id = public.current_tenant_id() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins can manage tenants" on public.tenants;
create policy "Admins can manage tenants"
on public.tenants
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create table if not exists public.price_brands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  source_brand_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create table if not exists public.price_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.price_brands(id) on delete cascade,
  name text not null,
  slug text not null,
  source_category_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, slug)
);

create table if not exists public.price_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.price_brands(id) on delete cascade,
  category_id uuid not null references public.price_categories(id) on delete cascade,
  name text not null,
  slug text not null,
  reference_code text,
  description text,
  designer text,
  source_product_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, source_product_id),
  unique (tenant_id, brand_id, category_id, slug)
);

create table if not exists public.price_product_variations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.price_brands(id) on delete cascade,
  category_id uuid not null references public.price_categories(id) on delete cascade,
  product_id uuid not null references public.price_products(id) on delete cascade,
  variation_code text,
  variation_name text,
  dimensions text,
  module text,
  description text,
  source_variation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, product_id, source_variation_id),
  unique (tenant_id, product_id, variation_code)
);

create table if not exists public.price_finishes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.price_brands(id) on delete cascade,
  name text not null,
  finish_type text,
  code text,
  slug text not null,
  source_finish_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, code),
  unique (tenant_id, brand_id, slug)
);

create table if not exists public.price_table (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.price_brands(id) on delete cascade,
  category_id uuid not null references public.price_categories(id) on delete cascade,
  product_id uuid not null references public.price_products(id) on delete cascade,
  variation_id uuid not null references public.price_product_variations(id) on delete cascade,
  finish_id uuid not null references public.price_finishes(id) on delete cascade,
  price numeric(12,2) not null,
  currency text not null default 'BRL',
  source_reference text,
  source_price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, category_id, product_id, variation_id, finish_id)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'price_brands',
    'price_categories',
    'price_products',
    'price_product_variations',
    'price_finishes',
    'price_table'
  ] loop
    execute format('drop trigger if exists touch_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger touch_%I_updated_at before update on public.%I for each row execute function public.touch_updated_at()',
      table_name,
      table_name
    );
  end loop;
end $$;

create index if not exists idx_price_brands_tenant_name on public.price_brands(tenant_id, name);
create index if not exists idx_price_categories_tenant_brand_name on public.price_categories(tenant_id, brand_id, name);
create index if not exists idx_price_products_tenant_brand_category_name on public.price_products(tenant_id, brand_id, category_id, name);
create index if not exists idx_price_products_tenant_reference on public.price_products(tenant_id, reference_code);
create index if not exists idx_price_products_tenant_source on public.price_products(tenant_id, source_product_id);
create index if not exists idx_price_variations_tenant_product_code on public.price_product_variations(tenant_id, product_id, variation_code);
create index if not exists idx_price_variations_tenant_source on public.price_product_variations(tenant_id, source_variation_id);
create index if not exists idx_price_finishes_tenant_brand_name on public.price_finishes(tenant_id, brand_id, name);
create index if not exists idx_price_finishes_tenant_code on public.price_finishes(tenant_id, brand_id, code);
create index if not exists idx_price_table_tenant on public.price_table(tenant_id);
create index if not exists idx_price_table_brand on public.price_table(tenant_id, brand_id);
create index if not exists idx_price_table_category on public.price_table(tenant_id, category_id);
create index if not exists idx_price_table_product on public.price_table(tenant_id, product_id);
create index if not exists idx_price_table_variation on public.price_table(tenant_id, variation_id);
create index if not exists idx_price_table_finish on public.price_table(tenant_id, finish_id);
create index if not exists idx_price_table_product_price on public.price_table(tenant_id, product_id, price);
create index if not exists idx_price_table_variation_price on public.price_table(tenant_id, variation_id, price);

alter table public.price_brands enable row level security;
alter table public.price_categories enable row level security;
alter table public.price_products enable row level security;
alter table public.price_product_variations enable row level security;
alter table public.price_finishes enable row level security;
alter table public.price_table enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'price_brands',
    'price_categories',
    'price_products',
    'price_product_variations',
    'price_finishes',
    'price_table'
  ] loop
    execute format('drop policy if exists "Tenant can read %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "Tenant can read %s" on public.%I for select to authenticated using (tenant_id = public.current_tenant_id() or public.has_role(auth.uid(), ''admin''))',
      table_name,
      table_name
    );
    execute format('drop policy if exists "Admins can manage %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "Admins can manage %s" on public.%I for all to authenticated using (public.has_role(auth.uid(), ''admin'')) with check (public.has_role(auth.uid(), ''admin''))',
      table_name,
      table_name
    );
  end loop;
end $$;

grant select on public.tenants to authenticated;
grant insert, update, delete on public.tenants to authenticated;
grant select on public.price_brands, public.price_categories, public.price_products, public.price_product_variations, public.price_finishes, public.price_table to authenticated;
grant insert, update, delete on public.price_brands, public.price_categories, public.price_products, public.price_product_variations, public.price_finishes, public.price_table to authenticated;

create or replace view public.price_search_index
with (security_invoker = true)
as
select
  pt.id as price_id,
  pt.tenant_id,
  pt.brand_id,
  pb.name as brand_name,
  pt.category_id,
  pc.name as category_name,
  pt.product_id,
  pp.name as product_name,
  pp.reference_code,
  pp.source_product_id,
  pt.variation_id,
  pv.variation_code,
  pv.variation_name,
  pv.dimensions,
  pv.module,
  pt.finish_id,
  pf.name as finish_name,
  pf.finish_type,
  pf.code as finish_code,
  pt.price,
  pt.currency,
  pt.source_reference
from public.price_table pt
join public.price_brands pb on pb.id = pt.brand_id
join public.price_categories pc on pc.id = pt.category_id
join public.price_products pp on pp.id = pt.product_id
join public.price_product_variations pv on pv.id = pt.variation_id
join public.price_finishes pf on pf.id = pt.finish_id;

grant select on public.price_search_index to authenticated;
