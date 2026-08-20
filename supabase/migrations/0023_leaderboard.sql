-- ============================================================================
-- Classement "joueurs déjà rencontrés" — phase 5 du plan (voir
-- cadrage_comptes_recompenses_rgpd.md, section 5.4 et 7). Le cadrage est
-- explicite : "pas de nouvelle table, juste une requête triée sur
-- player_stats/xp" — cette migration n'ajoute donc qu'une fonction de
-- lecture, rien en plus.
--
-- Comme validé dans la maquette (maquette_comptes_espace_joueur.html,
-- panel "Classement") : pas de système d'amis pour l'instant, donc le
-- classement rassemble tous les comptes avec qui le compte demandeur a
-- déjà partagé au moins une partie (account_id renseigné côté players,
-- donc joueur connecté ce jour-là — un invité sans compte n'apparaît
-- jamais, ni comme "moi" ni comme "rencontré"), plus le compte demandeur
-- lui-même. Trié par XP total (section 5.3 : le niveau affiché se déduit
-- de l'XP côté client via badges.ts:levelForXp, inutile de le recalculer
-- ici).
--
-- Fonction en SECURITY INVOKER (comportement par défaut, pas SECURITY
-- DEFINER) : contrairement aux fonctions de mutation de partie
-- (resolve_round_attempt, award_game_rewards...), celle-ci ne fait que
-- lire des données déjà publiquement lisibles via la clé anon —
-- player_accounts.id/pseudo/avatar_url/xp (grant explicite, 0020) et
-- players.room_id/account_id (jamais restreints en lecture depuis 0001/
-- 0004) — donc pas besoin de bypasser RLS.
create or replace function get_player_leaderboard(p_account_id uuid)
returns table (account_id uuid, pseudo text, avatar_url text, xp int)
language sql
stable
as $$
  select pa.id as account_id, pa.pseudo, pa.avatar_url, pa.xp
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
