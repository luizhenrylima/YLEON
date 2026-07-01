-- Security hardening for the single-store SPECIFICA model.
-- No tenant_id/store_id structure is introduced here.

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
      and role::text in ('admin', 'gestor')
  )
$$;

create or replace function public.is_seller(_user_id uuid)
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
      and role::text = 'vendedor'
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

grant execute on function public.is_admin_or_manager(uuid) to authenticated;
grant execute on function public.is_seller(uuid) to authenticated;
grant execute on function public.can_manage_operations(uuid) to authenticated;

alter table if exists public.projects
  add column if not exists archived_at timestamptz;

create or replace function public.can_access_project(_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = _project_id
      and p.archived_at is null
      and (
        public.is_admin_or_manager(auth.uid())
        or p.user_id = auth.uid()
        or p.seller_user_id = auth.uid()
      )
  )
$$;

grant execute on function public.can_access_project(uuid) to authenticated;

alter table if exists public.projects
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table if exists public.crm_customers
  add column if not exists architect_profile_id uuid references public.profiles(user_id) on delete set null,
  add column if not exists construction_address text,
  add column if not exists construction_status text,
  add column if not exists construction_deadline date,
  add column if not exists move_in_deadline date,
  add column if not exists birth_date date,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table if exists public.crm_leads
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table if exists public.crm_quotes
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table if exists public.crm_orders
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table if exists public.project_items
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

create or replace function public.apply_basic_audit_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;

  new.updated_by := auth.uid();
  if to_jsonb(new) ? 'updated_at' then
    new.updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_projects_basic_audit on public.projects;
create trigger trg_projects_basic_audit
before insert or update on public.projects
for each row execute function public.apply_basic_audit_fields();

drop trigger if exists trg_crm_customers_basic_audit on public.crm_customers;
create trigger trg_crm_customers_basic_audit
before insert or update on public.crm_customers
for each row execute function public.apply_basic_audit_fields();

drop trigger if exists trg_crm_leads_basic_audit on public.crm_leads;
create trigger trg_crm_leads_basic_audit
before insert or update on public.crm_leads
for each row execute function public.apply_basic_audit_fields();

drop trigger if exists trg_crm_quotes_basic_audit on public.crm_quotes;
create trigger trg_crm_quotes_basic_audit
before insert or update on public.crm_quotes
for each row execute function public.apply_basic_audit_fields();

drop trigger if exists trg_crm_orders_basic_audit on public.crm_orders;
create trigger trg_crm_orders_basic_audit
before insert or update on public.crm_orders
for each row execute function public.apply_basic_audit_fields();

drop trigger if exists trg_project_items_basic_audit on public.project_items;
create trigger trg_project_items_basic_audit
before insert or update on public.project_items
for each row execute function public.apply_basic_audit_fields();

create or replace function public.enforce_sensitive_write_rate_limit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  limit_result jsonb;
  max_hits integer := 120;
  window_seconds integer := 600;
  block_seconds integer := 300;
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_table_name = 'projects' and tg_op = 'INSERT' then
    max_hits := 30;
    window_seconds := 3600;
  elsif tg_table_name = 'project_items' then
    max_hits := 300;
    window_seconds := 600;
  elsif tg_table_name in ('crm_quotes', 'crm_orders') then
    max_hits := 80;
    window_seconds := 600;
  elsif tg_table_name in ('crm_customers', 'crm_leads') then
    max_hits := 120;
    window_seconds := 600;
  end if;

  limit_result := public.check_rate_limit(
    'db:' || tg_table_name || ':' || lower(tg_op),
    auth.uid()::text,
    max_hits,
    window_seconds,
    block_seconds,
    auth.uid(),
    null
  );

  if coalesce((limit_result->>'allowed')::boolean, false) = false then
    raise exception 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_projects_sensitive_write_rate_limit on public.projects;
create trigger trg_projects_sensitive_write_rate_limit
before insert or update on public.projects
for each row execute function public.enforce_sensitive_write_rate_limit();

drop trigger if exists trg_crm_customers_sensitive_write_rate_limit on public.crm_customers;
create trigger trg_crm_customers_sensitive_write_rate_limit
before insert or update on public.crm_customers
for each row execute function public.enforce_sensitive_write_rate_limit();

drop trigger if exists trg_crm_leads_sensitive_write_rate_limit on public.crm_leads;
create trigger trg_crm_leads_sensitive_write_rate_limit
before insert or update on public.crm_leads
for each row execute function public.enforce_sensitive_write_rate_limit();

drop trigger if exists trg_crm_quotes_sensitive_write_rate_limit on public.crm_quotes;
create trigger trg_crm_quotes_sensitive_write_rate_limit
before insert or update on public.crm_quotes
for each row execute function public.enforce_sensitive_write_rate_limit();

drop trigger if exists trg_crm_orders_sensitive_write_rate_limit on public.crm_orders;
create trigger trg_crm_orders_sensitive_write_rate_limit
before insert or update on public.crm_orders
for each row execute function public.enforce_sensitive_write_rate_limit();

drop trigger if exists trg_project_items_sensitive_write_rate_limit on public.project_items;
create trigger trg_project_items_sensitive_write_rate_limit
before insert or update on public.project_items
for each row execute function public.enforce_sensitive_write_rate_limit();

create or replace function public.prevent_crm_customer_delete_with_history()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (select 1 from public.projects p where p.crm_customer_id = old.id)
    or exists (select 1 from public.crm_leads l where l.customer_id = old.id)
    or exists (select 1 from public.crm_quotes q where q.customer_id = old.id)
    or exists (select 1 from public.crm_orders o where o.customer_id = old.id)
  then
    raise exception 'Cliente possui historico comercial. Arquive em vez de excluir.';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_prevent_crm_customer_delete_with_history on public.crm_customers;
create trigger trg_prevent_crm_customer_delete_with_history
before delete on public.crm_customers
for each row execute function public.prevent_crm_customer_delete_with_history();

alter table if exists public.projects enable row level security;
alter table if exists public.project_items enable row level security;
alter table if exists public.crm_customers enable row level security;
alter table if exists public.crm_leads enable row level security;
alter table if exists public.crm_interactions enable row level security;
alter table if exists public.crm_quotes enable row level security;
alter table if exists public.crm_orders enable row level security;
alter table if exists public.crm_order_approvals enable row level security;
alter table if exists public.crm_support_tickets enable row level security;
alter table if exists public.crm_agenda_events enable row level security;
alter table if exists public.crm_brand_delivery_terms enable row level security;
alter table if exists public.crm_sales_targets enable row level security;
alter table if exists public.favorites enable row level security;
alter table if exists public.architect_brand_favorites enable row level security;
alter table if exists public.price_finish_markup_rules enable row level security;

drop policy if exists "Users can view own projects" on public.projects;
drop policy if exists "Users can create projects" on public.projects;
drop policy if exists "Users can update own projects" on public.projects;
drop policy if exists "Users can delete own projects" on public.projects;
drop policy if exists "Users can view accessible projects" on public.projects;
drop policy if exists "Users can update accessible projects" on public.projects;

create policy "Projects visible by role and ownership"
on public.projects for select to authenticated
using (
  archived_at is null
  and (
    public.is_admin_or_manager(auth.uid())
    or user_id = auth.uid()
    or seller_user_id = auth.uid()
  )
);

create policy "Projects created by valid owner"
on public.projects for insert to authenticated
with check (
  public.is_admin_or_manager(auth.uid())
  or (
    user_id = auth.uid()
    and (
      seller_user_id is null
      or seller_user_id = auth.uid()
      or seller_user_id = (select p.seller_id from public.profiles p where p.user_id = auth.uid())
    )
  )
  or (
    public.is_seller(auth.uid())
    and seller_user_id = auth.uid()
    and (
      crm_architect_profile_id is null
      or exists (
        select 1
        from public.profiles p
        where p.user_id = crm_architect_profile_id
          and p.seller_id = auth.uid()
      )
    )
  )
);

create policy "Projects updated by valid owner"
on public.projects for update to authenticated
using (
  public.is_admin_or_manager(auth.uid())
  or user_id = auth.uid()
  or seller_user_id = auth.uid()
)
with check (
  public.is_admin_or_manager(auth.uid())
  or (
    user_id = auth.uid()
    and (
      seller_user_id is null
      or seller_user_id = auth.uid()
      or seller_user_id = (select p.seller_id from public.profiles p where p.user_id = auth.uid())
    )
  )
  or (
    public.is_seller(auth.uid())
    and seller_user_id = auth.uid()
  )
);

create policy "Projects deleted only by management"
on public.projects for delete to authenticated
using (public.is_admin_or_manager(auth.uid()));

drop policy if exists "Users can view own project items" on public.project_items;
drop policy if exists "Users can add project items" on public.project_items;
drop policy if exists "Users can update own project items" on public.project_items;
drop policy if exists "Users can remove project items" on public.project_items;
drop policy if exists "Project items visible by project access" on public.project_items;
drop policy if exists "Project items inserted by project access" on public.project_items;
drop policy if exists "Project items updated by project access" on public.project_items;
drop policy if exists "Project items deleted by project access" on public.project_items;

create policy "Project items visible by project access"
on public.project_items for select to authenticated
using (
  archived_at is null
  and public.can_access_project(project_id)
);

create policy "Project items inserted by project access"
on public.project_items for insert to authenticated
with check (public.can_access_project(project_id));

create policy "Project items updated by project access"
on public.project_items for update to authenticated
using (public.can_access_project(project_id))
with check (public.can_access_project(project_id));

create policy "Project items deleted by project access"
on public.project_items for delete to authenticated
using (public.can_access_project(project_id));

drop policy if exists "CRM customers are visible to staff owners" on public.crm_customers;
drop policy if exists "CRM customers can be created by staff owners" on public.crm_customers;
drop policy if exists "CRM customers can be updated by staff owners" on public.crm_customers;
drop policy if exists "CRM customers can be deleted by admins" on public.crm_customers;
drop policy if exists "CRM customers can be deleted by staff owners" on public.crm_customers;

create policy "CRM customers visible by seller"
on public.crm_customers for select to authenticated
using (
  archived_at is null
  and (
    public.is_admin_or_manager(auth.uid())
    or seller_user_id = auth.uid()
  )
);

create policy "CRM customers created by seller"
on public.crm_customers for insert to authenticated
with check (
  public.is_admin_or_manager(auth.uid())
  or seller_user_id = auth.uid()
);

create policy "CRM customers updated by seller"
on public.crm_customers for update to authenticated
using (
  public.is_admin_or_manager(auth.uid())
  or seller_user_id = auth.uid()
)
with check (
  public.is_admin_or_manager(auth.uid())
  or seller_user_id = auth.uid()
);

create policy "CRM customers deleted only by management"
on public.crm_customers for delete to authenticated
using (public.is_admin_or_manager(auth.uid()));

drop policy if exists "CRM leads visible to staff owners" on public.crm_leads;
drop policy if exists "CRM leads created by staff owners" on public.crm_leads;
drop policy if exists "CRM leads updated by staff owners" on public.crm_leads;
drop policy if exists "CRM leads deleted by staff owners" on public.crm_leads;

create policy "CRM leads visible by seller"
on public.crm_leads for select to authenticated
using (
  archived_at is null
  and (
    public.is_admin_or_manager(auth.uid())
    or seller_user_id = auth.uid()
  )
);

create policy "CRM leads created by seller"
on public.crm_leads for insert to authenticated
with check (
  public.is_admin_or_manager(auth.uid())
  or seller_user_id = auth.uid()
);

create policy "CRM leads updated by seller"
on public.crm_leads for update to authenticated
using (
  public.is_admin_or_manager(auth.uid())
  or seller_user_id = auth.uid()
)
with check (
  public.is_admin_or_manager(auth.uid())
  or seller_user_id = auth.uid()
);

create policy "CRM leads deleted only by management"
on public.crm_leads for delete to authenticated
using (public.is_admin_or_manager(auth.uid()));

drop policy if exists "Users can view own favorites" on public.favorites;
drop policy if exists "Users can add favorites" on public.favorites;
drop policy if exists "Users can remove favorites" on public.favorites;

create policy "Favorites read own rows"
on public.favorites for select to authenticated
using (user_id = auth.uid());

create policy "Favorites insert own rows"
on public.favorites for insert to authenticated
with check (user_id = auth.uid());

create policy "Favorites delete own rows"
on public.favorites for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "Users read own favorite brands" on public.architect_brand_favorites;
drop policy if exists "Users insert own favorite brands" on public.architect_brand_favorites;
drop policy if exists "Users delete own favorite brands" on public.architect_brand_favorites;
drop policy if exists "Users manage own favorite brands" on public.architect_brand_favorites;

create policy "Favorite brands read own rows"
on public.architect_brand_favorites for select to authenticated
using (user_id = auth.uid());

create policy "Favorite brands insert own rows"
on public.architect_brand_favorites for insert to authenticated
with check (user_id = auth.uid());

create policy "Favorite brands delete own rows"
on public.architect_brand_favorites for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "Tenant can read price_finish_markup_rules" on public.price_finish_markup_rules;
drop policy if exists "Admins can manage price_finish_markup_rules" on public.price_finish_markup_rules;

create policy "Staff can read price finish markup rules"
on public.price_finish_markup_rules for select to authenticated
using (public.is_staff(auth.uid()));

create policy "Managers can manage price finish markup rules"
on public.price_finish_markup_rules for all to authenticated
using (public.is_admin_or_manager(auth.uid()))
with check (public.is_admin_or_manager(auth.uid()));

do $$
begin
  alter table public.projects
    add constraint projects_client_name_required
    check (client_name is not null and btrim(client_name) <> '') not valid;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.crm_leads
    add constraint crm_leads_lead_name_required
    check (btrim(lead_name) <> '') not valid;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.crm_customers
    add constraint crm_customers_name_required
    check (btrim(name) <> '') not valid;
exception when duplicate_object then null;
end $$;

create index if not exists idx_projects_active_seller
on public.projects(seller_user_id, created_at desc)
where archived_at is null;

create index if not exists idx_projects_active_architect
on public.projects(user_id, created_at desc)
where archived_at is null;

create index if not exists idx_crm_customers_active_seller
on public.crm_customers(seller_user_id, created_at desc)
where archived_at is null;

create index if not exists idx_crm_leads_active_seller
on public.crm_leads(seller_user_id, created_at desc)
where archived_at is null;

drop policy if exists "Anyone authenticated can view brands" on public.brands;
drop policy if exists "Anyone authenticated can view products" on public.products;
drop policy if exists "Anyone authenticated can view categories" on public.categories;

create policy "Authenticated users can view visible brands"
on public.brands for select to authenticated
using (
  public.is_admin_or_manager(auth.uid())
  or coalesce(is_hidden, false) = false
);

create policy "Authenticated users can view visible products"
on public.products for select to authenticated
using (
  public.is_admin_or_manager(auth.uid())
  or coalesce(is_hidden, false) = false
);

create policy "Authenticated users can view categories"
on public.categories for select to authenticated
using (auth.uid() is not null);

drop policy if exists "Anyone authenticated can view featured_designers" on public.featured_designers;
drop policy if exists "Anyone authenticated can view landing_images" on public.landing_images;
drop policy if exists "Anyone authenticated can view style tags" on public.design_style_tags;
drop policy if exists "Anyone authenticated can view product style tags" on public.product_style_tags;
drop policy if exists "Anyone authenticated can view featured products" on public.featured_products;
drop policy if exists "Anyone authenticated can view environments" on public.environments;
drop policy if exists "Anyone authenticated can view product_environments" on public.product_environments;
drop policy if exists "Anyone authenticated can view finish_categories" on public.finish_categories;
drop policy if exists "Anyone authenticated can view finishes" on public.finishes;

create policy "Authenticated users can view featured designers"
on public.featured_designers for select to authenticated
using (auth.uid() is not null);

create policy "Authenticated users can view landing images"
on public.landing_images for select to authenticated
using (auth.uid() is not null);

create policy "Authenticated users can view style tags"
on public.design_style_tags for select to authenticated
using (auth.uid() is not null);

create policy "Authenticated users can view product style tags"
on public.product_style_tags for select to authenticated
using (auth.uid() is not null);

create policy "Authenticated users can view featured products"
on public.featured_products for select to authenticated
using (auth.uid() is not null);

create policy "Authenticated users can view environments"
on public.environments for select to authenticated
using (auth.uid() is not null);

create policy "Authenticated users can view product environments"
on public.product_environments for select to authenticated
using (auth.uid() is not null);

create policy "Authenticated users can view finish categories"
on public.finish_categories for select to authenticated
using (auth.uid() is not null);

create policy "Authenticated users can view finishes"
on public.finishes for select to authenticated
using (auth.uid() is not null);

drop policy if exists "Public can view marketing events" on public.marketing_events;
drop policy if exists "Public can insert marketing events" on public.marketing_events;
drop policy if exists "Public can update marketing events" on public.marketing_events;
drop policy if exists "Public can delete marketing events" on public.marketing_events;

create policy "Authenticated users can view marketing events"
on public.marketing_events for select to authenticated
using (auth.uid() is not null);

create policy "Managers can insert marketing events"
on public.marketing_events for insert to authenticated
with check (public.is_admin_or_manager(auth.uid()));

create policy "Managers can update marketing events"
on public.marketing_events for update to authenticated
using (public.is_admin_or_manager(auth.uid()))
with check (public.is_admin_or_manager(auth.uid()));

create policy "Managers can delete marketing events"
on public.marketing_events for delete to authenticated
using (public.is_admin_or_manager(auth.uid()));
