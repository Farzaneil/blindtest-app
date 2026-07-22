-- ============================================================================
-- Blindtest App — schema initial
--
-- Idée clé du modèle : il n'y a pas de table "hosts" séparée. Le rôle d'hôte
-- est un simple booléen (is_host) sur une ligne de `players`. Un même
-- téléphone peut donc être host ET joueur dans la même partie : il a les
-- droits de contrôle (lancer le morceau, avancer les manches) en plus de son
-- bouton de buzz normal.
--
-- Séparation état partagé / état privé :
--   - `rooms` et `rounds` = état commun, affichable sur l'écran projeté (TV).
--   - `answers` = état privé par joueur (choix de réponse), à ne jamais
--     exposer sur l'écran partagé avant la révélation de la bonne réponse.
--     Le filtrage se fait via les policies RLS plus bas.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- rooms : une "partie" de blind test
-- ---------------------------------------------------------------------------
create table rooms (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,               -- code court à partager (ex: "BZR482")
  status        text not null default 'lobby'        -- lobby | in_progress | finished
                  check (status in ('lobby', 'in_progress', 'finished')),
  game_mode     text not null default 'solo'          -- solo | team
                  check (game_mode in ('solo', 'team')),
  answer_mode   text not null default 'manual'        -- manual | voice | both
                  check (answer_mode in ('manual', 'voice', 'both')),
  music_source  text not null default 'spotify'       -- spotify | youtube | deezer | apple_music
                  check (music_source in ('spotify', 'youtube', 'deezer', 'apple_music')),
  playlist_id   uuid,                                 -- FK ajoutée plus bas (playlists créée après)
  created_at    timestamptz not null default now()
);

comment on column rooms.code is 'Code court affiché sur l''écran hôte pour que les joueurs rejoignent la partie.';

-- ---------------------------------------------------------------------------
-- teams : optionnel, utilisé seulement si game_mode = 'team'
-- ---------------------------------------------------------------------------
create table teams (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references rooms(id) on delete cascade,
  name        text not null,
  color       text,                                  -- code couleur pour la DA (ex: '#6C2BD9')
  score       int not null default 0
);

-- ---------------------------------------------------------------------------
-- players : chaque appareil connecté à une room. is_host = rôle, pas un type
-- de compte à part.
-- ---------------------------------------------------------------------------
create table players (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references rooms(id) on delete cascade,
  team_id       uuid references teams(id) on delete set null,
  display_name  text not null,
  is_host       boolean not null default false,
  device_id     text not null,                        -- identifiant stable de l'appareil (installation id)
  score         int not null default 0,
  connected     boolean not null default true,
  joined_at     timestamptz not null default now()
);

create index idx_players_room on players(room_id);

-- Un seul hôte "actif" par room n'est pas contraint en base (plusieurs
-- personnes pourraient avoir les droits de contrôle si besoin plus tard),
-- mais l'app ne doit en afficher qu'un par défaut.

-- ---------------------------------------------------------------------------
-- playlists : playlist prédéfinie, générée par IA, ou aléatoire
-- ---------------------------------------------------------------------------
create table playlists (
  id            uuid primary key default gen_random_uuid(),
  theme         text not null,
  source        text not null default 'spotify'
                  check (source in ('spotify', 'youtube', 'deezer', 'apple_music')),
  generated_by  text not null default 'manual'         -- manual | ai | random
                  check (generated_by in ('manual', 'ai', 'random')),
  tracks        jsonb not null default '[]',           -- [{ source_track_id, title, artist, duration_ms }, ...]
  created_by    uuid references players(id),
  created_at    timestamptz not null default now()
);

-- rooms.playlist_id référence playlists : ajouté après coup pour éviter un
-- cycle de dépendances à la création des tables.
alter table rooms
  add constraint fk_rooms_playlist foreign key (playlist_id) references playlists(id);

-- ---------------------------------------------------------------------------
-- rounds : une manche = un morceau à deviner
-- ---------------------------------------------------------------------------
create table rounds (
  id                uuid primary key default gen_random_uuid(),
  room_id           uuid not null references rooms(id) on delete cascade,
  order_index       int not null,
  source_track_id   text not null,
  title             text not null,
  artist            text not null,
  status            text not null default 'pending'    -- pending | playing | buzzed | revealed | scored
                      check (status in ('pending', 'playing', 'buzzed', 'revealed', 'scored')),
  buzzed_by_player_id uuid references players(id),
  buzzed_at         timestamptz,                        -- horodatage SERVEUR de réception du buzz gagnant
  started_at        timestamptz,
  revealed_at       timestamptz
);

create index idx_rounds_room on rounds(room_id);

-- ---------------------------------------------------------------------------
-- buzzes : TOUTES les tentatives de buzz d'une manche (pas seulement le
-- gagnant), utile pour départager les cas limites et pour les stats.
-- L'horodatage fait foi côté serveur (default now()), jamais celui envoyé
-- par le client.
-- ---------------------------------------------------------------------------
create table buzzes (
  id                uuid primary key default gen_random_uuid(),
  round_id          uuid not null references rounds(id) on delete cascade,
  player_id         uuid not null references players(id) on delete cascade,
  server_received_at timestamptz not null default now()
);

create index idx_buzzes_round on buzzes(round_id);

-- ---------------------------------------------------------------------------
-- answers : réponse d'un joueur — DONNÉE PRIVÉE tant que la manche n'est pas
-- "revealed". Ne doit jamais être lue par l'écran hôte projeté avant ce
-- moment (cf. policies RLS ci-dessous).
-- ---------------------------------------------------------------------------
create table answers (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references rounds(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  answer_text   text,
  mode          text not null default 'manual'         -- manual | voice
                  check (mode in ('manual', 'voice')),
  is_correct    boolean,                                -- null tant que non validée
  scored_by     uuid references players(id),            -- qui a validé manuellement (mode manual)
  created_at    timestamptz not null default now()
);

create index idx_answers_round on answers(round_id);

-- ============================================================================
-- Row Level Security — squelette à affiner une fois l'auth Supabase branchée.
-- Idée : tout ce qui est dans `rooms` / `rounds` / `teams` / `players` (état
-- commun) est lisible par tous les participants de la room. `answers` n'est
-- lisible en clair par les autres joueurs qu'une fois la manche "revealed".
-- ============================================================================

alter table rooms enable row level security;
alter table players enable row level security;
alter table teams enable row level security;
alter table rounds enable row level security;
alter table buzzes enable row level security;
alter table answers enable row level security;
alter table playlists enable row level security;

-- TODO (à faire une fois l'auth/device-id branché) :
--   - policy "lecture état commun" sur rooms/players/teams/rounds/buzzes :
--     autoriser si le joueur courant appartient à room_id.
--   - policy "lecture answers" : autoriser le joueur à lire SA PROPRE ligne
--     toujours, et celles des autres seulement si rounds.status = 'revealed'.
--   - policy "écriture" : un joueur ne peut insérer un buzz/answer que pour
--     son propre player_id ; seul is_host peut modifier rooms.status et
--     rounds.status.
