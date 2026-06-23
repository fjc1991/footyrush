-- Auto-create a profile row whenever a new auth user is created, reading the
-- manager id / display name from the signup metadata (set in RegistrationPage
-- via supabase.auth.signUp({ options: { data: { manager_id, display_name } } })).
--
-- This replaces the previous gap where /api/registration validated availability
-- but no profiles row was ever inserted.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_display_name text := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
  meta_manager_id text := nullif(trim(new.raw_user_meta_data ->> 'manager_id'), '');
  fallback_name text := coalesce(meta_display_name, split_part(new.email, '@', 1), 'Manager');
begin
  insert into public.profiles (id, display_name, email, manager_id)
  values (
    new.id,
    fallback_name,
    new.email,
    coalesce(
      meta_manager_id,
      lower(regexp_replace(fallback_name, '[^a-zA-Z0-9_]+', '_', 'g'))
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
