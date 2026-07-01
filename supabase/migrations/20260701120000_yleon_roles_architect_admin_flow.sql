-- YLEON single-store roles and admin-created architect flow.
-- No tenant_id/store_id structure is introduced here.

alter type public.app_role add value if not exists 'ceo';
alter type public.app_role add value if not exists 'financeiro';

alter table public.profiles
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists office_name text,
  add column if not exists is_active boolean not null default true;

create index if not exists idx_profiles_role_flow_seller
on public.profiles(seller_id, approved, is_active);

create or replace function public.is_ceo(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role::text = 'ceo'
  )
$$;

create or replace function public.is_finance(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role::text = 'financeiro'
  )
$$;

create or replace function public.is_admin_or_manager(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role::text in ('admin', 'ceo', 'gestor')
  )
$$;

create or replace function public.can_manage_operations(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin_or_manager(_user_id)
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role::text in ('admin', 'ceo', 'gestor', 'financeiro', 'vendedor')
  )
$$;

create or replace function public.is_approved(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.approved and coalesce(p.is_active, true)
      from public.profiles p
      where p.user_id = _user_id
      limit 1
    ),
    false
  )
$$;

create or replace function public.list_sellers()
returns table(user_id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id, coalesce(p.full_name, 'Vendedor') as full_name
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.user_id
  where ur.role::text = 'vendedor'
    and p.approved = true
    and coalesce(p.is_active, true) = true
  order by p.full_name nulls last
$$;

grant execute on function public.is_ceo(uuid) to authenticated;
grant execute on function public.is_finance(uuid) to authenticated;
grant execute on function public.is_admin_or_manager(uuid) to authenticated;
grant execute on function public.can_manage_operations(uuid) to authenticated;
grant execute on function public.is_staff(uuid) to authenticated;
grant execute on function public.is_approved(uuid) to authenticated;
grant execute on function public.list_sellers() to authenticated;

drop policy if exists "Authenticated users can view visible brands" on public.brands;
create policy "Authenticated users can view visible brands"
on public.brands for select to authenticated
using (
  public.is_admin_or_manager(auth.uid())
  or coalesce(is_hidden, false) = false
);

drop policy if exists "Authenticated users can view visible products" on public.products;
create policy "Authenticated users can view visible products"
on public.products for select to authenticated
using (
  public.is_admin_or_manager(auth.uid())
  or coalesce(is_hidden, false) = false
);
