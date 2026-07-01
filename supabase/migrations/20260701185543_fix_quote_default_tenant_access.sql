update public.tenants
set name = 'YLEON',
    primary_color = '#C9A24D'
where slug = 'acervo-1055';

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role::text in ('admin', 'ceo', 'gestor', 'financeiro', 'vendedor')
    )
    then coalesce(
      (
        select p.tenant_id
        from public.profiles p
        where p.user_id = auth.uid()
        limit 1
      ),
      (
        select t.id
        from public.tenants t
        where t.slug = 'acervo-1055'
        limit 1
      )
    )
    else null
  end
$$;

grant execute on function public.current_tenant_id() to authenticated;
