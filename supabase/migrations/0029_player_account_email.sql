-- ============================================================================
-- Comptes joueurs : connexion par e-mail (lien magique) au lieu de Spotify.
--
-- L'e-mail est la nouvelle identité du compte (unique, en minuscules). Il
-- n'est PAS lisible publiquement : player_accounts n'accorde la lecture
-- publique que sur (id, pseudo, avatar_url, xp), voir 0020 — la colonne
-- email n'y est pas ajoutée. Seules les routes serveur (clé service_role)
-- la lisent et l'écrivent.
--
-- Les comptes déjà créés via Spotify restent intacts : à la première
-- connexion par e-mail depuis une session encore ouverte, l'e-mail est
-- rattaché à ce compte (même XP, badges, cosmétiques), voir
-- app/api/player-auth/confirm/route.ts.
--
-- À exécuter dans le SQL Editor de Supabase.
-- ============================================================================

alter table player_accounts add column if not exists email text;
-- Utilisateur Supabase Auth correspondant (créé par l'envoi du lien
-- magique) : permet de le supprimer aussi quand le joueur supprime son
-- compte (RGPD), voir app/api/player-account/delete.
alter table player_accounts add column if not exists auth_user_id uuid;

create unique index if not exists player_accounts_email_unique
  on player_accounts (lower(email))
  where email is not null;
