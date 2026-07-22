-- OAuth identities do not have a FootyRush manager ID until the player chooses
-- one in the app. Password registration can still claim an ID at signup by
-- supplying manager_id in raw_user_meta_data.

alter table public.profiles
  alter column manager_id drop not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_display_name text := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
  meta_full_name text := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
  meta_name text := nullif(trim(new.raw_user_meta_data ->> 'name'), '');
  meta_manager_id text := nullif(trim(new.raw_user_meta_data ->> 'manager_id'), '');
  email_name text := nullif(split_part(coalesce(new.email, ''), '@', 1), '');
  fallback_name text := coalesce(meta_display_name, meta_full_name, meta_name, email_name, 'Manager');
begin
  insert into public.profiles (id, display_name, email, manager_id)
  values (
    new.id,
    fallback_name,
    new.email,
    meta_manager_id
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates an auth profile. Manager IDs are only copied from explicit signup metadata; OAuth users complete onboarding in the app.';
