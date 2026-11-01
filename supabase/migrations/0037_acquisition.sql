-- 0037 — Suivi des stickers et QR codes de la bêta (source d'arrivée).
--
-- Un QR de sticker pointe vers https://kazouband.fr/?src=paris-kaz : le
-- navigateur garde ce code 30 jours (localStorage, voir lib/acquisition.ts)
-- et la route app/api/acquisition enregistre ici trois moments :
--   visit          première arrivée par ce lien (une fois par onglet) ;
--   room_created   cet appareil a créé une partie ;
--   player_joined  cet appareil a rejoint une partie.
-- Aucune donnée personnelle : ni IP, ni compte, ni identifiant d'appareil.
-- Écrite uniquement par la route serveur (clé service_role).

create table if not exists public.acquisition_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text not null check (source ~ '^[a-z0-9-]{1,40}$'),
  kind text not null check (kind in ('visit', 'room_created', 'player_joined')),
  room_id uuid references public.rooms (id) on delete set null
);

create index if not exists acquisition_events_source_idx on public.acquisition_events (source, kind);

alter table public.acquisition_events enable row level security;
revoke all on public.acquisition_events from anon, authenticated;
grant select, insert, delete on public.acquisition_events to service_role;

-- Durée de conservation (voir 0035 et 0036) : 12 mois, comme les parties.
create or replace function purge_old_data()
returns json as $$
declare
  v_accounts int;
  v_rooms int;
  v_feedback int;
  v_acquisition int;
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

  delete from feedback where created_at < now() - interval '12 months';
  get diagnostics v_feedback = row_count;

  delete from acquisition_events where created_at < now() - interval '12 months';
  get diagnostics v_acquisition = row_count;

  delete from rate_limits where window_start < now() - interval '1 day';

  return json_build_object(
    'accounts_deleted', v_accounts,
    'rooms_deleted', v_rooms,
    'feedback_deleted', v_feedback,
    'acquisition_deleted', v_acquisition
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke all on function purge_old_data() from public, anon, authenticated;

-- Tableau de bord, à lancer dans le SQL Editor :
--   select source,
--          count(*) filter (where kind = 'visit')         as visites,
--          count(*) filter (where kind = 'room_created')  as parties_creees,
--          count(*) filter (where kind = 'player_joined') as joueurs
--   from acquisition_events
--   group by source
--   order by visites desc;
