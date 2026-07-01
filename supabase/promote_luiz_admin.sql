-- One-off admin promotion for luizhenrylima2002@gmail.com.
-- Run this in Supabase SQL Editor with an owner/admin database role.

do $$
declare
  target_user_id uuid;
begin
  select id
    into target_user_id
  from auth.users
  where email = 'luizhenrylima2002@gmail.com'
  limit 1;

  if target_user_id is null then
    raise exception 'User luizhenrylima2002@gmail.com was not found in auth.users';
  end if;

  insert into public.profiles (user_id, full_name, approved)
  values (target_user_id, 'Luiz Henry Lima', true)
  on conflict (user_id) do update
  set full_name = coalesce(public.profiles.full_name, excluded.full_name),
      approved = true;

  insert into public.user_roles (user_id, role)
  values (target_user_id, 'admin'::public.app_role)
  on conflict (user_id, role) do nothing;

  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now()),
      confirmed_at = coalesce(confirmed_at, now())
  where id = target_user_id;
end $$;

select
  u.id,
  u.email,
  u.email_confirmed_at is not null as email_confirmed,
  p.approved,
  exists (
    select 1
    from public.user_roles r
    where r.user_id = u.id
      and r.role = 'admin'::public.app_role
  ) as is_admin
from auth.users u
left join public.profiles p on p.user_id = u.id
where u.email = 'luizhenrylima2002@gmail.com';
