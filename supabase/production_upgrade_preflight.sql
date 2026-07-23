-- FootyRush production upgrade preflight
-- Read-only: this query changes no data or schema.

select
  to_regclass('public.profiles') is not null as profiles_table,
  to_regclass('public.invincible_attempts') is not null as invincible_attempts_table,
  to_regclass('public.community_squads') is not null as community_squads_table,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'manager_id'
  ) as manager_id_column,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leaderboard_entries'
      and column_name = 'competition_mode'
  ) as migration_0009_columns,
  to_regprocedure('public.record_competition_result(uuid,text,text,text,text,integer,integer,integer,integer,integer,integer,integer,timestamp with time zone)')
    is not null as migration_0009_function,
  to_regclass('public.product_events') is not null as migration_0010_product_events,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'manager_id_confirmed_at'
  ) as migration_0011_identity,
  to_regclass('public.user_visits') is not null as migration_0011_visits,
  to_regclass('public.user_mode_runs') is not null as migration_0011_runs,
  to_regclass('public.profile_preferences') is not null as migration_0011_preferences,
  to_regclass('public.marketing_preferences') is not null as migration_0011_marketing,
  to_regclass('public.admin_export_audit') is not null as migration_0011_audit,
  to_regprocedure('public.claim_manager_id(uuid,text)') is not null
    as migration_0011_claim_function;
