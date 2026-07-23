do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'round_attempts'
  ) then
    alter publication supabase_realtime add table round_attempts;
  end if;
end $$;
