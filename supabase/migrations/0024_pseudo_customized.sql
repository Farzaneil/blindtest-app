-- ============================================================================
-- Correctif : le pseudo choisi manuellement dans /profil (Réglages) était
-- écrasé par le pseudo Spotify d'origine à chaque reconnexion.
--
-- Cause : api/player-auth/callback met à jour pseudo/avatar_url à CHAQUE
-- connexion (pour refléter un changement fait côté Spotify), sans savoir
-- que l'utilisateur avait entre-temps choisi un pseudo différent via
-- api/player-account/update-pseudo — la reconnexion écrasait donc
-- systématiquement ce choix.
--
-- Fix : un simple booléen, mis à true par update-pseudo dès qu'un pseudo
-- personnalisé est enregistré. Le callback OAuth continue de synchroniser
-- l'avatar à chaque connexion (rien ne permet de le personnaliser
-- autrement), mais ne touche plus au pseudo une fois qu'il a été
-- personnalisé — jusqu'à suppression du compte, qui repart de zéro.
-- ============================================================================

alter table player_accounts
  add column pseudo_customized boolean not null default false;
