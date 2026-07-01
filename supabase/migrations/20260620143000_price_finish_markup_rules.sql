-- Finish-specific markup rules for the price consultant.
-- Uses the existing price brand model and does not add tenant_id/store_id.

create table if not exists public.price_finish_markup_rules (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.price_brands(id) on delete cascade,
  finish_label text not null,
  finish_key text not null,
  markup_percent numeric(7,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, finish_key),
  constraint price_finish_markup_rules_label_not_blank check (btrim(finish_label) <> ''),
  constraint price_finish_markup_rules_key_not_blank check (btrim(finish_key) <> ''),
  constraint price_finish_markup_rules_markup_range check (markup_percent >= 0 and markup_percent <= 999)
);

create index if not exists idx_price_finish_markup_rules_brand
  on public.price_finish_markup_rules(brand_id, is_active);

alter table public.price_finish_markup_rules enable row level security;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_price_finish_markup_rules_updated_at on public.price_finish_markup_rules;
create trigger touch_price_finish_markup_rules_updated_at
before update on public.price_finish_markup_rules
for each row execute function public.touch_updated_at();

drop policy if exists "Tenant can read price_finish_markup_rules" on public.price_finish_markup_rules;
create policy "Tenant can read price_finish_markup_rules"
on public.price_finish_markup_rules
for select
to authenticated
using (
  exists (
    select 1
    from public.price_brands pb
    where pb.id = price_finish_markup_rules.brand_id
      and (pb.tenant_id = public.current_tenant_id() or public.has_role(auth.uid(), 'admin'))
  )
);

drop policy if exists "Admins can manage price_finish_markup_rules" on public.price_finish_markup_rules;
create policy "Admins can manage price_finish_markup_rules"
on public.price_finish_markup_rules
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

grant select on public.price_finish_markup_rules to authenticated;
grant insert, update, delete on public.price_finish_markup_rules to authenticated;
