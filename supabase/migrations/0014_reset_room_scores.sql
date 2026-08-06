-- ============================================================================
-- "Redémarrer une partie" côté hôte (voir apps/web-host/src/app/host/page.tsx,
-- handleRestartGame) : remet tous les scores de la room à zéro et efface
-- l'historique des manches déjà jouées, SANS recréer de room ni forcer les
-- joueurs à se reconnecter — contrairement à "↻ Nouvelle partie" qui crée un
-- tout nouveau code. La file d'attente côté navigateur hôte (queue /
-- queueIndex, sessionStorage) n'est pas touchée par cette fonction : elle
-- continue où elle en était, sans rejouer les morceaux déjà passés.
--
-- SECURITY DEFINER nécessaire : depuis le durcissement RLS
-- (0004_rls_hardening.sql), aucune policy UPDATE n'existe plus sur `players`
-- côté client (la colonne score n'est modifiée que via des fonctions
-- SECURITY DEFINER comme resolve_round_attempt/timeout_round) — même
-- raisonnement ici.
--
-- Supprimer les lignes de `rounds` de la room efface aussi automatiquement
-- round_attempts et buzzes (foreign keys "on delete cascade", voir
-- 0001_init.sql / 0008_partial_answers.sql) : pas besoin de le faire à la
-- main, et le panneau "Historique" / les stats de fin de partie repartent
-- donc naturellement à vide côté client (subscribeToRoundHistory /
-- subscribeToRoundAttempts refont un fetch complet à chaque changement).
-- ============================================================================

create or replace function reset_room_scores(p_room_id uuid)
returns void as $$
begin
  update players set score = 0 where room_id = p_room_id;
  delete from rounds where room_id = p_room_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

grant execute on function reset_room_scores(uuid) to anon, authenticated;
