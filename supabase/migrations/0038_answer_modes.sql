-- Type de réponse par manche (playlists thématiques et import « Film / série »).
--
-- answer_mode :
--   'classic'   : titre + artiste (comme avant) ;
--   'work'      : une seule réponse, le nom du film / de la série / du
--                 dessin animé (colonne work) ; l'hôte la valide d'un seul
--                 bouton qui coche titre ET artiste, d'où 2 points ;
--   'song_work' : chanson + film (Disney) : title_found = la chanson,
--                 artist_found = le film (colonne work).
-- Le calcul des points (resolve_round_attempt) ne change pas.

alter table rounds add column if not exists answer_mode text not null default 'classic'
  check (answer_mode in ('classic', 'work', 'song_work'));
alter table rounds add column if not exists work text;

-- start_round : deux paramètres facultatifs en plus. L'ancienne version est
-- supprimée pour éviter toute ambiguïté d'appel ; les appels sans les
-- nouveaux paramètres continuent de fonctionner (valeurs par défaut).
drop function if exists start_round(uuid, uuid, text, text, text, boolean, boolean, timestamptz);

create or replace function start_round(
  p_host_token uuid,
  p_room_id uuid,
  p_source_track_id text,
  p_title text,
  p_artist text,
  p_blind_mode boolean,
  p_is_joker boolean,
  p_started_at timestamptz,
  p_answer_mode text default 'classic',
  p_work text default null
) returns rounds as $$
declare
  v_round rounds;
  v_next int;
  v_mode text := coalesce(p_answer_mode, 'classic');
begin
  perform assert_room_host(p_room_id, p_host_token);
  if v_mode not in ('classic', 'work', 'song_work') then
    v_mode := 'classic';
  end if;
  select coalesce(max(order_index), -1) + 1 into v_next from rounds where room_id = p_room_id;
  insert into rounds (room_id, order_index, source_track_id, title, artist, status, started_at, blind_mode, is_joker, answer_mode, work)
  values (
    p_room_id, v_next, left(p_source_track_id, 200), left(p_title, 300), left(p_artist, 300), 'playing',
    coalesce(p_started_at, now()), coalesce(p_blind_mode, false), coalesce(p_is_joker, false),
    v_mode, nullif(left(p_work, 300), '')
  )
  returning * into v_round;
  update rooms set status = 'in_progress' where id = p_room_id;
  return v_round;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke all on function start_round(uuid, uuid, text, text, text, boolean, boolean, timestamptz, text, text) from public;
grant execute on function start_round(uuid, uuid, text, text, text, boolean, boolean, timestamptz, text, text) to anon, authenticated;
