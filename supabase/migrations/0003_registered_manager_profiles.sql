alter table public.profiles
  add column if not exists manager_id text;

update public.profiles
set manager_id = lower(regexp_replace(display_name, '[^a-zA-Z0-9_]+', '_', 'g'))
where manager_id is null;

create unique index if not exists profiles_manager_id_unique
  on public.profiles (lower(manager_id))
  where manager_id is not null;

alter table public.profiles
  alter column mmr set default 0;

alter table public.minileague_members
  alter column mmr set default 0;
