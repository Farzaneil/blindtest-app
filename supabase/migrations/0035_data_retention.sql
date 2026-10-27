-- ============================================================================
-- Durées de conservation (RGPD), annoncées sur la page Confidentialité :
-- - compte joueur sans aucune connexion depuis 3 ans : supprimé (avec son
--   utilisateur de connexion Supabase Auth, donc son adresse e-mail) ;
-- - parties de plus de 12 mois : supprimées avec tout ce qui en dépend
--   (joueurs, manches, buzz, tentatives, équipes…, via on delete cascade).
--   L'XP, les badges et le skin des comptes ne sont pas touchés.
-- - compteurs anti-abus : déjà nettoyés au fil de l'eau (voir 0033).
--
-- Purge lancée chaque nuit par pg_cron (extension Supabase).
-- À exécuter dans le SQL Editor de Supabase.
-- ============================================================================

-- Dernière activité d'un compte : mise à jour au plus une fois par jour
-- quand le joueur ouvre le site connecté (api/player-auth/me) et à chaque
-- connexion. Les comptes existants partent d'aujourd'hui.
alter table player_accounts add column if not exists last_seen_at timestamptz not null default now();
create index if not exists idx_player_accounts_last_seen on player_accounts(last_seen_at);
create index if not exists idx_rooms_created_at on rooms(created_at);

create or replace function purge_old_data()
returns json as $$
declare
  v_accounts int;
  v_rooms int;
begin
  with gone as (
    delete from player_accounts
    where last_seen_at < now() - interval '3 years'
    returning auth_user_id
  ),
  gone_auth as (
    delete from auth.users where id in (select auth_user_id from gone where auth_user_id is not null)
  )
  select count(*) into v_accounts from gone;

  delete from rooms where created_at < now() - interval '12 months';
  get diagnostics v_rooms = row_count;

  delete from rate_limits where window_start < now() - interval '1 day';

  return json_build_object('accounts_deleted', v_accounts, 'rooms_deleted', v_rooms);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke all on function purge_old_data() from public, anon, authenticated;

-- Planification quotidienne (3 h 17, heure UTC).
create extension if not exists pg_cron;
select cron.schedule('blindtest-purge-old-data', '17 3 * * *', $$select public.purge_old_data()$$);
