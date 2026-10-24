-- ============================================================================
-- Classement du profil : renvoie aussi l'avatar de chaque compte (voir
-- migration 0030 et apps/web-host/src/lib/avatars.tsx). Le type de retour
-- change, d'où le drop préalable (même logique de sélection que 0023).
-- À exécuter dans le SQL Editor de Supabase.
-- ============================================================================

drop function if exists get_player_leaderboard(uuid);

create function get_player_leaderboard(p_account_id uuid)
returns table (account_id uuid, pseudo text, avatar_url text, xp int, avatar_key text, avatar_color text, avatar_extra text)
language sql
stable
as $$
  select pa.id as account_id, pa.pseudo, pa.avatar_url, pa.xp, pa.avatar_key, pa.avatar_color, pa.avatar_extra
  from player_accounts pa
  where pa.id = p_account_id
     or pa.id in (
       select distinct p2.account_id
       from players p1
       join players p2 on p2.room_id = p1.room_id
       where p1.account_id = p_account_id
         and p2.account_id is not null
         and p2.account_id <> p_account_id
     )
  order by pa.xp desc, pa.pseudo asc;
$$;

grant execute on function get_player_leaderboard(uuid) to anon, authenticated;
