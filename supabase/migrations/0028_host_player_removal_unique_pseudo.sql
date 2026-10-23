-- ============================================================================
-- 1) Hôte joueur qui passe en "Maître du jeu" pendant la préparation : en
--    Maître du jeu, l'hôte voit tous les titres à l'avance, il ne peut donc
--    pas rester joueur. L'écran hôte demande confirmation puis retire sa
--    ligne `players` via remove_host_player (les joueurs ne sont jamais
--    supprimables directement depuis le navigateur, voir
--    0004_rls_hardening.sql). Limité à la ligne de l'hôte (is_host = true)
--    et aux parties dont aucune manche n'a encore été jouée.
--
-- 2) Pseudo unique par partie (casse et espaces autour ignorés), en base :
--    le contrôle côté client (joinRoomByCode / joinRoomAsHost) laissait
--    passer deux validations simultanées. Les doublons déjà présents sont
--    d'abord renommés ("Neil #a1b2") pour que l'index puisse être créé.
--
-- À exécuter dans le SQL Editor de Supabase.
-- ============================================================================

create or replace function remove_host_player(p_player_id uuid)
returns void as $$
begin
  delete from players p
  where p.id = p_player_id
    and p.is_host = true
    and not exists (select 1 from rounds r where r.room_id = p.room_id);

  if not found then
    raise exception 'Impossible de retirer ce joueur (partie déjà commencée ?).';
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

grant execute on function remove_host_player(uuid) to anon, authenticated;

-- Doublons existants : on garde le plus ancien, les suivants sont suffixés.
with ranked as (
  select id,
         row_number() over (
           partition by room_id, lower(btrim(display_name))
           order by joined_at, id
         ) as rn
  from players
)
update players p
set display_name = p.display_name || ' #' || substr(p.id::text, 1, 4)
from ranked
where ranked.id = p.id and ranked.rn > 1;

create unique index if not exists players_room_pseudo_unique
  on players (room_id, lower(btrim(display_name)));
