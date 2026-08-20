-- ============================================================================
-- Comptes joueurs (espace joueur, récompenses, RGPD) — phase 1 du plan
-- décrit dans cadrage_comptes_recompenses_rgpd.md : uniquement la connexion
-- Spotify "joueur" + la liaison optionnelle au compte depuis une partie.
-- Le reste (stats, badges, XP, classement, cosmétiques) viendra dans des
-- migrations suivantes, une fois cette base validée.
--
-- Contrairement aux tables de partie (rooms/players/rounds/...), qui
-- suivent le modèle "dev, entre amis" (RLS ouverte + clé anon, voir
-- migrations 0003/0004 — pas encore d'auth Supabase réelle), les jetons
-- OAuth des comptes joueurs sont une donnée réellement sensible.
-- player_account_providers reste donc RLS activée SANS AUCUNE policy ni
-- grant vers anon/authenticated : totalement inaccessible via la clé anon,
-- y compris en lecture. Seule la clé service_role (voir
-- apps/web-host/src/lib/supabaseAdmin.ts, utilisée uniquement dans des
-- routes API serveur, jamais côté navigateur) peut la lire/écrire,
-- puisqu'elle contourne la RLS.
--
-- player_accounts, à l'inverse, ne contient rien de sensible (pseudo,
-- avatar, xp) : elle reste lisible via la clé anon (policy select ouverte
-- + grant limité aux colonnes publiques), pour permettre d'afficher le
-- pseudo/avatar/xp d'un joueur à d'autres (classement, badges...) sans
-- repasser par le serveur à chaque fois. Écriture réservée au
-- service_role : un joueur ne doit jamais pouvoir modifier son xp ou celui
-- d'un autre depuis le navigateur.
-- ============================================================================

create table player_accounts (
  id          uuid primary key default gen_random_uuid(),
  pseudo      text not null,
  avatar_url  text,
  xp          int not null default 0,
  created_at  timestamptz not null default now()
);

create table player_account_providers (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references player_accounts(id) on delete cascade,
  provider          text not null check (provider in ('spotify', 'deezer', 'apple_music', 'youtube')),
  provider_user_id  text not null,
  access_token      text,
  refresh_token     text,
  connected_at      timestamptz not null default now(),
  unique (provider, provider_user_id)
);

create index idx_player_account_providers_account on player_account_providers(account_id);

-- players.account_id : null = invité (comportement actuel, strictement
-- inchangé), renseigné = joueur connecté. Colonne nullable sans défaut :
-- aucune migration cassante, aucune ligne existante affectée.
alter table players add column account_id uuid references player_accounts(id) on delete set null;

-- Le join côté client (joinRoomByCode/joinRoomAsHost, voir lib/rooms.ts)
-- insère désormais éventuellement account_id : on l'ajoute au grant insert
-- existant (migration 0004, qui ne listait que room_id/team_id/
-- display_name/device_id). Un GRANT sur une colonne supplémentaire est
-- additif, il ne retire pas les colonnes déjà accordées.
grant insert (account_id) on players to anon, authenticated;

alter table player_accounts enable row level security;
alter table player_account_providers enable row level security;

create policy "lecture publique player_accounts" on player_accounts for select using (true);
grant select (id, pseudo, avatar_url, xp) on player_accounts to anon, authenticated;

-- Aucune policy ni aucun grant sur player_account_providers : par design,
-- inaccessible via la clé anon (voir le commentaire en tête de fichier).
