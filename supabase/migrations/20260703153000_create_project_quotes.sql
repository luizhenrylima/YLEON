create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null default ('COT-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  project_id uuid not null references public.projects(id) on delete cascade,
  customer_id uuid references public.crm_customers(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  responsible_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'rascunho',
  internal_notes text,
  commercial_terms text,
  general_discount_type text not null default 'none',
  general_discount_value numeric(12,2) not null default 0,
  subtotal_gross numeric(12,2) not null default 0,
  item_discount_total numeric(12,2) not null default 0,
  general_discount_total numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  total_final numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  constraint quotes_number_unique unique (quote_number),
  constraint quotes_status_check check (status in ('rascunho', 'enviada', 'em_negociacao', 'aprovada', 'recusada', 'cancelada')),
  constraint quotes_general_discount_type_check check (general_discount_type in ('none', 'percent', 'amount')),
  constraint quotes_general_discount_value_check check (general_discount_value >= 0),
  constraint quotes_totals_nonnegative check (
    subtotal_gross >= 0
    and item_discount_total >= 0
    and general_discount_total >= 0
    and discount_total >= 0
    and total_final >= 0
  )
);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  price_id uuid references public.price_table(id) on delete set null,
  price_product_id uuid references public.price_products(id) on delete set null,
  price_brand_id uuid references public.price_brands(id) on delete set null,
  price_category_id uuid references public.price_categories(id) on delete set null,
  price_variation_id uuid references public.price_product_variations(id) on delete set null,
  price_finish_id uuid references public.price_finishes(id) on delete set null,
  product_name text not null,
  brand_name text,
  sku text,
  image_url text,
  category_name text,
  finish_name text,
  variation_name text,
  unit_price numeric(12,2) not null default 0,
  quantity numeric(10,2) not null default 1,
  discount_type text not null default 'none',
  discount_value numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  subtotal_before_discount numeric(12,2) not null default 0,
  subtotal_after_discount numeric(12,2) not null default 0,
  item_notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint quote_items_discount_type_check check (discount_type in ('none', 'percent', 'amount')),
  constraint quote_items_nonnegative_check check (
    unit_price >= 0
    and quantity > 0
    and discount_value >= 0
    and discount_amount >= 0
    and subtotal_before_discount >= 0
    and subtotal_after_discount >= 0
  )
);

create index if not exists idx_quotes_project_created on public.quotes(project_id, created_at desc);
create index if not exists idx_quotes_responsible_created on public.quotes(responsible_user_id, created_at desc);
create index if not exists idx_quotes_customer_created on public.quotes(customer_id, created_at desc);
create index if not exists idx_quotes_tenant_created on public.quotes(tenant_id, created_at desc);
create index if not exists idx_quote_items_quote_sort on public.quote_items(quote_id, sort_order, created_at);
create index if not exists idx_quote_items_project on public.quote_items(project_id);

create or replace function public.apply_quote_item_totals()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  gross numeric(12,2);
  discount numeric(12,2);
begin
  new.quantity := greatest(coalesce(new.quantity, 1), 0.01);
  new.unit_price := greatest(coalesce(new.unit_price, 0), 0);
  new.discount_value := greatest(coalesce(new.discount_value, 0), 0);
  new.discount_type := coalesce(new.discount_type, 'none');
  gross := round(new.unit_price * new.quantity, 2);

  if new.discount_type = 'percent' then
    discount := round(gross * least(new.discount_value, 100) / 100, 2);
  elsif new.discount_type = 'amount' then
    discount := least(round(new.discount_value, 2), gross);
  else
    discount := 0;
    new.discount_value := 0;
  end if;

  new.discount_amount := discount;
  new.subtotal_before_discount := gross;
  new.subtotal_after_discount := greatest(round(gross - discount, 2), 0);
  new.updated_at := now();

  return new;
end;
$$;

create or replace function public.refresh_quote_totals(_quote_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  item_totals record;
  quote_row record;
  general_discount numeric(12,2);
begin
  select
    coalesce(sum(subtotal_before_discount), 0)::numeric(12,2) as subtotal_gross,
    coalesce(sum(discount_amount), 0)::numeric(12,2) as item_discount_total,
    coalesce(sum(subtotal_after_discount), 0)::numeric(12,2) as subtotal_after_items
  into item_totals
  from public.quote_items
  where quote_id = _quote_id;

  select general_discount_type, general_discount_value
  into quote_row
  from public.quotes
  where id = _quote_id;

  if quote_row.general_discount_type = 'percent' then
    general_discount := round(item_totals.subtotal_after_items * least(coalesce(quote_row.general_discount_value, 0), 100) / 100, 2);
  elsif quote_row.general_discount_type = 'amount' then
    general_discount := least(round(coalesce(quote_row.general_discount_value, 0), 2), item_totals.subtotal_after_items);
  else
    general_discount := 0;
  end if;

  update public.quotes
  set subtotal_gross = item_totals.subtotal_gross,
      item_discount_total = item_totals.item_discount_total,
      general_discount_total = general_discount,
      discount_total = round(item_totals.item_discount_total + general_discount, 2),
      total_final = greatest(round(item_totals.subtotal_after_items - general_discount, 2), 0),
      updated_at = now()
  where id = _quote_id;
end;
$$;

create or replace function public.refresh_quote_totals_from_item()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform public.refresh_quote_totals(coalesce(new.quote_id, old.quote_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_quote_items_apply_totals on public.quote_items;
create trigger trg_quote_items_apply_totals
before insert or update on public.quote_items
for each row execute function public.apply_quote_item_totals();

drop trigger if exists trg_quote_items_refresh_quote_totals on public.quote_items;
create trigger trg_quote_items_refresh_quote_totals
after insert or update or delete on public.quote_items
for each row execute function public.refresh_quote_totals_from_item();

drop trigger if exists trg_quotes_basic_audit on public.quotes;
create trigger trg_quotes_basic_audit
before insert or update on public.quotes
for each row execute function public.apply_basic_audit_fields();

drop trigger if exists trg_quote_items_basic_audit on public.quote_items;
create trigger trg_quote_items_basic_audit
before insert or update on public.quote_items
for each row execute function public.apply_basic_audit_fields();

alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;

drop policy if exists "Quotes visible by project access" on public.quotes;
create policy "Quotes visible by project access"
on public.quotes for select to authenticated
using (
  archived_at is null
  and public.is_staff(auth.uid())
  and public.can_access_project(project_id)
);

drop policy if exists "Quotes created by staff project access" on public.quotes;
create policy "Quotes created by staff project access"
on public.quotes for insert to authenticated
with check (
  public.is_staff(auth.uid())
  and public.can_access_project(project_id)
  and (
    public.is_admin_or_manager(auth.uid())
    or responsible_user_id = auth.uid()
  )
);

drop policy if exists "Quotes updated by responsible or management" on public.quotes;
create policy "Quotes updated by responsible or management"
on public.quotes for update to authenticated
using (
  public.is_staff(auth.uid())
  and public.can_access_project(project_id)
  and (
    public.is_admin_or_manager(auth.uid())
    or responsible_user_id = auth.uid()
  )
)
with check (
  public.is_staff(auth.uid())
  and public.can_access_project(project_id)
  and (
    public.is_admin_or_manager(auth.uid())
    or responsible_user_id = auth.uid()
  )
);

drop policy if exists "Quotes deleted by management" on public.quotes;
create policy "Quotes deleted by management"
on public.quotes for delete to authenticated
using (public.is_admin_or_manager(auth.uid()));

drop policy if exists "Quote items visible by quote access" on public.quote_items;
create policy "Quote items visible by quote access"
on public.quote_items for select to authenticated
using (
  exists (
    select 1
    from public.quotes q
    where q.id = quote_items.quote_id
      and q.archived_at is null
      and public.is_staff(auth.uid())
      and public.can_access_project(q.project_id)
  )
);

drop policy if exists "Quote items created by quote access" on public.quote_items;
create policy "Quote items created by quote access"
on public.quote_items for insert to authenticated
with check (
  public.is_staff(auth.uid())
  and exists (
    select 1
    from public.quotes q
    where q.id = quote_items.quote_id
      and q.project_id = quote_items.project_id
      and q.archived_at is null
      and public.can_access_project(q.project_id)
      and (
        public.is_admin_or_manager(auth.uid())
        or q.responsible_user_id = auth.uid()
      )
  )
);

drop policy if exists "Quote items updated by quote access" on public.quote_items;
create policy "Quote items updated by quote access"
on public.quote_items for update to authenticated
using (
  exists (
    select 1
    from public.quotes q
    where q.id = quote_items.quote_id
      and q.archived_at is null
      and public.is_staff(auth.uid())
      and public.can_access_project(q.project_id)
      and (
        public.is_admin_or_manager(auth.uid())
        or q.responsible_user_id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.quotes q
    where q.id = quote_items.quote_id
      and q.project_id = quote_items.project_id
      and q.archived_at is null
      and public.is_staff(auth.uid())
      and public.can_access_project(q.project_id)
      and (
        public.is_admin_or_manager(auth.uid())
        or q.responsible_user_id = auth.uid()
      )
  )
);

drop policy if exists "Quote items deleted by quote access" on public.quote_items;
create policy "Quote items deleted by quote access"
on public.quote_items for delete to authenticated
using (
  exists (
    select 1
    from public.quotes q
    where q.id = quote_items.quote_id
      and q.archived_at is null
      and public.is_staff(auth.uid())
      and public.can_access_project(q.project_id)
      and (
        public.is_admin_or_manager(auth.uid())
        or q.responsible_user_id = auth.uid()
      )
  )
);

grant select, insert, update, delete on public.quotes to authenticated;
grant select, insert, update, delete on public.quote_items to authenticated;
grant execute on function public.apply_quote_item_totals() to authenticated;
grant execute on function public.refresh_quote_totals(uuid) to authenticated;
grant execute on function public.refresh_quote_totals_from_item() to authenticated;
