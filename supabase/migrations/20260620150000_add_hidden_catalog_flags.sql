alter table public.brands
  add column if not exists is_hidden boolean not null default false;

alter table public.products
  add column if not exists is_hidden boolean not null default false;

create index if not exists idx_brands_is_hidden on public.brands(is_hidden);
create index if not exists idx_products_is_hidden on public.products(is_hidden);
