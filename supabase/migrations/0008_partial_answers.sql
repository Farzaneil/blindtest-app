-- ============================================================================
-- Réponses partielles (titre seul / artiste seul) en mode "Maître du jeu".
--
-- Jusqu'ici resolve_round() ne connaissait que "bonne" ou "mauvaise" réponse,
-- et clôturait systématiquement la manche. Le mode "Maître du jeu" a
-- désormais besoin de distinguer 4 issues à un buzz (titre seul, artiste
-- seul, les deux, aucun des deux) et, sauf si les DEUX sont trouvés, de
-- relancer la manche pour laisser une autre chance (à un autre joueur, ou au
-- même une fois qu'un autre a buzzé entre-temps) plutôt que de la clôturer.
-- Le mode "Tout le monde participe" garde un unique buzz par manche (comme
-- avant) : c'est le paramètre p_force_end qui distingue les deux (le client
-- envoie toujours true dans ce mode).
--
-- title_found / artist_found sont CUMULATIFS sur la durée de la manche : une
-- fois qu'un élément a été crédité, il reste acquis même si un buzz suivant
-- ne retrouve pas cette information (le joueur suivant n'a plus qu'un seul
-- élément à trouver).
--
-- locked_player_id : le joueur qui vient de buzzer (quel que soit le
-- résultat, sauf clôture de la manche) ne peut pas rebuzzer immédiatement —
-- il est débloqué dès qu'un AUTRE joueur buzze à sa suite (voir la
-- modification du trigger resolve_buzz_winner plus bas), pas seulement à la
-- fin de la manche.
--
-- round_attempts conserve l'historique de chaque tentative jugée (qui a
-- buzzé, qu'a-t-il trouvé, combien de points), pour l'affichage détaillé
-- d'une manche à rallonge dans le panneau "Historique des manches" côté
-- hôte.
-- ============================================================================

alter table rounds add column if not exists title_found boolean not null default false;
alter table rounds add column if not exists artist_found boolean not null default false;
alter table rounds add column if not exists locked_player_id uuid references players(id);

create table if not exists round_attempts (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references rounds(id) on delete cascade,
  room_id         uuid not null references rooms(id) on delete cascade,
  player_id       uuid not null references players(id) on delete cascade,
  title_found     boolean not null,
  artist_found    boolean not null,
  points_awarded  int not null,
  created_at      timestamptz not null default now()
);

-- room_id est dénormalisé depuis rounds (au lieu d'un join à chaque lecture)
-- pour permettre au client de filtrer/écouter directement "toutes les
-- tentatives de cette room" avec un simple filtre Supabase Realtime
-- (`room_id=eq.<id>`), qui ne supporte pas les jointures.
create index if not exists idx_round_attempts_round on round_attempts(round_id);
create index if not exists idx_round_attempts_room on round_attempts(room_id);

alter table round_attempts enable row level security;

create policy "dev: lecture libre round_attempts" on round_attempts for select using (true);

-- Le trigger de résolution de buzz (0002_buzz_resolution.sql) doit
-- maintenant ignorer les buzz venant du joueur actuellement verrouillé sur
-- cette manche : son INSERT dans `buzzes` réussit toujours (pas d'erreur
-- côté client), mais ne fait plus basculer la manche en "buzzed" tant qu'un
-- AUTRE joueur n'a pas buzzé.
create or replace function resolve_buzz_winner() returns trigger as $$
begin
  update rounds
  set status = 'buzzed',
      buzzed_by_player_id = new.player_id,
      buzzed_at = new.server_received_at
  where id = new.round_id
    and status = 'playing'
    and (locked_player_id is null or locked_player_id <> new.player_id);
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- resolve_round(uuid, boolean) est remplacée par resolve_round_attempt, qui
-- gère les 4 issues possibles au lieu de bonne/mauvaise réponse. On la
-- supprime pour éviter toute confusion (l'app ne l'appelle plus).
drop function if exists resolve_round(uuid, boolean);

create or replace function resolve_round_attempt(
  p_round_id uuid,
  p_title_found boolean,
  p_artist_found boolean,
  p_force_end boolean
) returns void as $$
declare
  v_player_id uuid;
  v_room_id uuid;
  v_title_found boolean;
  v_artist_found boolean;
  v_new_title_found boolean;
  v_new_artist_found boolean;
  v_points int;
  v_complete boolean;
begin
  select buzzed_by_player_id, room_id, title_found, artist_found
    into v_player_id, v_room_id, v_title_found, v_artist_found
  from rounds
  where id = p_round_id and status = 'revealed';

  if v_player_id is null then
    raise exception 'Manche introuvable ou pas encore révélée.';
  end if;

  v_new_title_found := v_title_found or p_title_found;
  v_new_artist_found := v_artist_found or p_artist_found;

  if p_title_found and p_artist_found then
    v_points := 2;
  elsif p_title_found or p_artist_found then
    v_points := 1;
  else
    v_points := -1;
  end if;

  update players set score = score + v_points where id = v_player_id;

  insert into round_attempts (round_id, room_id, player_id, title_found, artist_found, points_awarded)
  values (p_round_id, v_room_id, v_player_id, p_title_found, p_artist_found, v_points);

  v_complete := v_new_title_found and v_new_artist_found;

  if v_complete or p_force_end then
    update rounds
    set status = 'scored',
        title_found = v_new_title_found,
        artist_found = v_new_artist_found,
        was_correct = v_complete,
        locked_player_id = null
    where id = p_round_id;
  else
    -- La manche repart : on repasse en "playing" (le trigger ci-dessus
    -- pourra de nouveau faire basculer en "buzzed" sur le prochain buzz
    -- valide), on efface le buzzeur courant, et on verrouille son buzzer
    -- jusqu'à ce qu'un autre joueur buzze.
    update rounds
    set status = 'playing',
        title_found = v_new_title_found,
        artist_found = v_new_artist_found,
        was_correct = null,
        buzzed_by_player_id = null,
        locked_player_id = v_player_id
    where id = p_round_id;
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

grant execute on function resolve_round_attempt(uuid, boolean, boolean, boolean) to anon, authenticated;

-- timeout_round ne doit plus écraser title_found/artist_found déjà acquis
-- (une manche relancée après une réponse partielle peut très bien finir par
-- un timeout sans que l'élément restant soit trouvé) : on les laisse tels
-- quels et on recalcule was_correct en conséquence.
create or replace function timeout_round(p_round_id uuid)
returns void as $$
declare
  v_title_found boolean;
  v_artist_found boolean;
begin
  select title_found, artist_found into v_title_found, v_artist_found
  from rounds
  where id = p_round_id and status = 'playing';

  if not found then
    raise exception 'Manche introuvable ou déjà en cours de traitement.';
  end if;

  update rounds
  set status = 'scored',
      was_correct = (v_title_found and v_artist_found),
      locked_player_id = null
  where id = p_round_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
