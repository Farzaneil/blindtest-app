-- ============================================================================
-- Reprise de sa place dans une partie (pseudo déjà pris par SON ancien
-- joueur : onglet fermé, "Quitter la partie", changement de téléphone...).
--
-- - Joueur connecté à un compte : reprise automatique, sans passer par ici
--   (joinRoomByCode retrouve le joueur de la room qui porte le même
--   account_id, voir apps/web-host/src/lib/rooms.ts).
-- - Joueur invité : impossible de prouver que c'est bien lui, donc une
--   demande est envoyée à l'hôte, qui accepte ou refuse depuis son écran.
--   Le téléphone du joueur attend la réponse, puis se rattache à l'ancien
--   joueur (même score, même équipe, mêmes stats) si c'est accepté.
--
-- Écritures uniquement via fonctions SECURITY DEFINER (même modèle que le
-- reste du schéma, voir 0004_rls_hardening.sql). À exécuter dans le SQL
-- Editor de Supabase, puis recharger les pages hôte/joueur déjà ouvertes.
-- ============================================================================

create table if not exists rejoin_requests (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references rooms(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  status      text not null default 'pending'
                check (status in ('pending', 'accepted', 'refused')),
  created_at  timestamptz not null default now()
);

create index if not exists idx_rejoin_requests_room on rejoin_requests(room_id);

alter table rejoin_requests enable row level security;
drop policy if exists "dev: lecture libre rejoin_requests" on rejoin_requests;
create policy "dev: lecture libre rejoin_requests" on rejoin_requests for select using (true);

alter table rejoin_requests replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rejoin_requests'
  ) then
    alter publication supabase_realtime add table rejoin_requests;
  end if;
end $$;

-- Crée une demande pour reprendre le joueur p_player_id. Une éventuelle
-- demande plus ancienne encore en attente pour ce même joueur est
-- annulée (refusée), pour ne pas empiler les doublons côté hôte.
create or replace function request_rejoin(p_player_id uuid)
returns uuid as $$
declare
  v_id uuid;
begin
  insert into rejoin_requests (room_id, player_id)
  select room_id, id from players where id = p_player_id
  returning id into v_id;

  if v_id is null then
    raise exception 'Joueur introuvable.';
  end if;

  update rejoin_requests
    set status = 'refused'
    where player_id = p_player_id and status = 'pending' and id <> v_id;

  return v_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function resolve_rejoin_request(p_request_id uuid, p_accept boolean)
returns void as $$
begin
  update rejoin_requests
    set status = case when p_accept then 'accepted' else 'refused' end
    where id = p_request_id and status = 'pending';
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

grant execute on function request_rejoin(uuid) to anon, authenticated;
grant execute on function resolve_rejoin_request(uuid, boolean) to anon, authenticated;
