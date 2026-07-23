-- Durcissement léger des policies RLS dev (toujours sans auth réelle).
drop policy if exists "dev: maj libre players" on players;

revoke insert on players from anon, authenticated;
grant insert (room_id, team_id, display_name, device_id) on players to anon, authenticated;

revoke update on rooms from anon, authenticated;
grant update (status) on rooms to anon, authenticated;

drop policy if exists "dev: maj libre rounds" on rounds;

alter function resolve_buzz_winner() security definer;
alter function resolve_buzz_winner() set search_path = public, pg_temp;

revoke insert on buzzes from anon, authenticated;
grant insert (round_id, player_id) on buzzes to anon, authenticated;
