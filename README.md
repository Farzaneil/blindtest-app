# Blindtest App

Une appli pour faire des blind tests entre potes sans personne dédiée au lancement
des sons. Les téléphones des joueurs servent de buzzer. Un écran « hôte » (laptop
projeté sur une TV, ordi ou même téléphone) diffuse la musique, affiche le code de
partie et un QR code, les joueurs, qui a buzzé en premier et le classement.

Projet perso, pas encore commercialisé. `docs/architecture/blueprint.docx` contient
le cadrage initial (concept, DA, roadmap, business plan). Ce README décrit l'état
**réel** du code, qui a beaucoup évolué depuis.

Prod : **https://blindtest-app-web-host.vercel.app**

## Sommaire

- [Ce que fait l'app aujourd'hui](#ce-que-fait-lapp-aujourdhui)
- [Comment jouer](#comment-jouer)
- [Sources de musique](#sources-de-musique)
- [Comptes joueurs, progression et cosmétiques](#comptes-joueurs-progression-et-cosmétiques)
- [Design « Arcade autocollants »](#design--arcade-autocollants-)
- [Le jeu, techniquement](#le-jeu-techniquement)
- [Architecture / stack](#architecture--stack)
- [Sécurité / RLS](#sécurité--rls)
- [Démarrer en local](#démarrer-en-local)
- [Déploiement (Vercel)](#déploiement-vercel)
- [Qualité / CI](#qualité--ci)
- [Conventions Git](#conventions-git)
- [Roadmap](#roadmap)

## Ce que fait l'app aujourd'hui

**Jouable, déployée et testée en conditions réelles** : hôte et joueurs sur des
réseaux différents, y compris tout depuis des téléphones.

**Mise en place d'une partie**
- L'hôte crée une partie et reçoit un code à 6 caractères, avec un QR code à scanner.
- La partie survit à un refresh. L'accueil affiche « Partie en cours » avec deux
  choix : *Reprendre*, ou *Nouvelle partie*, qui termine l'ancienne pour tout le
  monde, après confirmation.
- Les joueurs rejoignent depuis leur navigateur (rien à installer) avec le code et un
  pseudo. Le pseudo est unique dans une partie.
- Un joueur qui a perdu sa place (onglet fermé, changement de téléphone) la reprend :
  - **connecté à un compte** : automatiquement ;
  - **invité** : par une demande que l'hôte accepte ou refuse. Il retrouve alors son
    score, son équipe et ses stats.

**Modes**
- **Maître du jeu** : l'hôte anime sans jouer et voit les titres à l'avance.
- **Tout le monde participe** : l'hôte peut aussi jouer sur son écran. La file est
  alors masquée (« Morceau 1 », « Morceau 2 »…) et la réponse ne s'affiche qu'au clic.
  Si l'hôte repasse en Maître du jeu pendant la préparation, son joueur est retiré
  (après confirmation).
- Le mode est **verrouillé** une fois la partie lancée.
- **Mode équipes** : on répartit les joueurs par glisser-déposer. Chaque équipe a sa
  couleur.

**Une manche**
- Le morceau se joue chez l'hôte, avec un compte à rebours de 30 s.
- Le premier buzz est tranché côté serveur, sans course possible. La musique se coupe
  et le timer se fige pendant le jugement.
- L'hôte juge la réponse : titre, artiste, les deux ou rien, avec des boutons colorés
  **+2 / +1 / -1**.
  - **Maître du jeu** : une réponse partielle relance la musique là où elle s'était
    arrêtée. Le joueur qui vient de répondre reste bloqué jusqu'au buzz de quelqu'un
    d'autre.
  - **Tout le monde participe** : la manche se termine dès le premier jugement.
- Si personne ne buzze en 30 s, la réponse s'affiche et la manche se termine sans
  gagnant.
- Le score peut être négatif.

**Bonus / malus** (chacun activable ou non, par partie)
- **Bonus vitesse** : +1 pour une réponse complète en moins de 2 s.
- **Bonus remontada** : +1 si le joueur est strictement dernier, à plus de 5 points de
  l'avant-dernier.
- **Manche joker** : environ 1 manche sur 10, points de base doublés dans les deux sens.
- **Malus série gagnante** : le détenteur d'une série d'au moins 3 bonnes réponses
  buzze en différé.
- **Malus série perdante** : après 3 erreurs d'affilée, le joueur est bloqué la
  manche suivante.

**Fin de manche et fin de partie**
- Le classement s'anime entre les manches : scores qui défilent, joueurs qui
  échangent leurs places, égalités partagées.
- L'historique des manches est replié, avec le détail de chaque tentative.
- **Cérémonie de fin**, côté hôte comme côté joueurs : podium avec avatars, confettis,
  buzzeur le plus rapide, manche la plus disputée.
- Pages annexes : `/rules`, `/about` et `/confidentialite`, plus un bandeau cookies
  (l'analytics est prévu mais pas branché, `ANALYTICS_ENABLED = false`).

**Pas fait / mis de côté**
- **App mobile native (`apps/mobile`, Expo)** : jamais validée de bout en bout, à
  cause de soucis de toolchain iOS. Elle est en retard sur les règles actuelles. Le
  buzzer web la remplace très bien.
- **Amis** : fonctionnalité prévue.
- **Domaine propre et e-mails** : les mails de connexion arrivent souvent en spams
  pour l'instant.
- **Vérifications légales** (Deezer notamment) : à faire avant toute
  commercialisation.

## Comment jouer

`/` est l'accueil : *Créer une partie* (`/host`), *Rejoindre une partie* (`/play`),
choix du fond (jaune, ciel ou lilas) et accès au compte joueur.

- **En ligne** :
  - Hôte : `https://blindtest-app-web-host.vercel.app/host`. Choisis un mode,
    construis la playlist, puis montre le code ou le QR code.
  - Joueurs : `/play`, avec le code et un pseudo, ou en scannant le QR code.
- **En local** :
  - Hôte : `http://localhost:3000/host`. La page redirige vers `127.0.0.1`, voir
    [plus bas](#pourquoi-127001-et-pas-localhost).
  - Joueurs : d'autres onglets, ou un autre appareil sur le même réseau via
    `http://<IP locale>:3000/play`.

## Sources de musique

### Deezer (par défaut, sans compte)

- **Fonctionnement** : on cherche ou on importe une **playlist publique Deezer**, et
  le jeu utilise les extraits de 30 s fournis par l'API publique. Ni compte ni clé
  pour l'hôte.
- **Code** :
  - `lib/deezer.ts` (types et appels client) ;
  - routes proxy `api/deezer/{search,featured,playlist/[id],track/[id]}` qui passent
    par `lib/deezerServer.ts`, car l'API Deezer n'autorise pas le CORS ;
  - choix de la playlist dans `_components/DeezerPlaylistPicker.tsx`.
- **Lecture** : `lib/usePreviewPlayer.ts`, un seul élément `<audio>` avec
  pause/reprise. Un lien d'extrait expire : il est donc rafraîchi via
  `api/deezer/track/[id]` juste avant de jouer.
- ⚠️ Vérifier les conditions d'utilisation de Deezer avant toute exploitation
  commerciale.

### Spotify (réservé à certains comptes)

La source Spotify n'est proposée qu'aux joueurs connectés dont l'e-mail figure dans
la variable `SPOTIFY_HOST_EMAILS`, une liste séparée par des virgules (voir
`api/host-features` et `isSpotifyAllowedEmail` dans `lib/playerEmailAuth.ts`). Pour
tous les autres, elle est masquée. En mode développeur, l'app Spotify n'accepte de
toute façon que 5 utilisateurs de test.

- **Premium obligatoire.** Les `preview_url` ont été supprimées pour les apps créées
  après le 27/11/2024. Seule la lecture complète via le **Web Playback SDK** reste
  possible, et elle exige Premium. Le SDK crée un appareil Spotify Connect dans
  l'onglet de l'hôte.
- **Un seul lecteur partagé.** Il est stocké sur `window` (`useSpotifyPlayer.ts`), ce
  qui évite l'erreur « device not found » quand on quitte puis revient sur `/host`.
  *Réessayer* déconnecte le lecteur, attend, le recrée, et propose de recharger la
  page.
- **Deux appels distincts** :
  - `playTrackOnHostDevice`, avec un body `{ uris, position_ms }`, démarre un morceau
    du début ;
  - `resumePlayback`, sans body, reprend exactement là où la lecture s'était arrêtée.
  Un appel avec body relance toujours le morceau à zéro.
- **Connexion OAuth PKCE**, sans Client Secret. Les tokens sont stockés en cookies
  httpOnly. Après l'aller-retour OAuth, on revient bien sur `/host`.
- **Import de playlist** : uniquement les playlists dont l'hôte est propriétaire ou
  collaborateur (changements d'API de février 2026, sinon erreur 403). Les morceaux
  sont mélangés une seule fois, à l'import.
- **Génération par genre et époque** : à partir de listes d'artistes curées à la main
  (`packages/game-logic/src/genrePresets.ts`). Le champ `popularity` et les endpoints
  de recommandation ont été retirés par Spotify en février 2026.
- **Quota (erreur 429)** : un coupe-circuit est partagé entre appareils via Supabase,
  avec un délai qui double à chaque nouveau refus. Voir `lib/spotifyQuotaLock.ts` et
  les migrations 0012-0013.

## Comptes joueurs, progression et cosmétiques

### Connexion par e-mail

- **Principe** : un e-mail avec **un lien magique et un code à 6 chiffres** (Supabase
  Auth), sans mot de passe. Le compte est créé au premier passage.
- **Flux** :
  - `api/player-auth/email` envoie l'e-mail. Le « code verifier » PKCE est gardé dans
    un cookie httpOnly `player_magic_verifier`.
  - `api/player-auth/confirm` traite le lien.
  - `api/player-auth/verify-code` traite le code saisi à la main.
- **Comptes** : `lib/playerEmailAccount.ts` (`findOrCreateAccountForEmail`). La
  session de jeu est notre propre cookie signé `player_session` (HMAC
  `PLAYER_SESSION_SECRET`, 180 jours), lu par `api/player-auth/me`.
- **Origine des liens** : l'origine est lue depuis l'en-tête `host` (`requestOrigin`),
  ce qui évite le piège `localhost` / `127.0.0.1` dans les liens envoyés.
- **Rattachement** : un joueur invité, ou le joueur de l'hôte, est rattaché au compte
  dès la connexion (`api/player-account/link-host-player`).
- **Ancien code** : les routes `api/player-auth/login` et `callback` (connexion
  joueur via Spotify) sont l'ancien système. Elles ne sont plus proposées dans l'UI.

### Avatars « La Bande-Son »

- **Les avatars** : 12 personnages musicaux, tous gratuits, chacun avec sa couleur de
  rond. Les invités reçoivent un avatar déterminé par le hash de leur pseudo.
  Fichiers : `lib/avatars.tsx` (sans `"use client"`, car importé côté serveur) et
  `_components/AvatarPicker.tsx`.
- **Effets spéciaux** (`lib/avatarExtras.ts`) : effet anime (niveau 5), or
  (10 victoires), couronne (Éclair or), lunettes étoile (Curateur argent), chapeaux
  saisonniers (Halloween, Noël, été).

### Profil (`/profil`)

L'en-tête affiche l'avatar (cliquable pour le changer), le niveau, les parties et
victoires, et la barre d'XP. Cinq onglets :

- **Réglages** : pseudo, skin du buzzer, fond, compte (données, suppression).
- **Stats** : chiffres clés, forme du moment (10 dernières parties), records.
- **Badges** : paliers obtenus, prochain objectif, médailles par catégorie.
- **Historique** : parties groupées par mois, filtre Victoires.
- **Classement** : les comptes déjà croisés en partie, avec podium et avatars.

### Badges et XP

- **17 badges à 3 paliers** (bronze / argent / or), soit 51 paliers, en 4 catégories :
  Performance en jeu, Assiduité, Social, Côté hôte. Définitions dans `lib/badges.ts`.
- **Calcul** : en fin de partie par `award_game_rewards` (migration 0021).
- **XP gagnée** : le score final de la partie (jamais négatif), plus +10 / +25 / +50
  par palier bronze / argent / or débloqué. 100 XP par niveau.

### Skins du buzzer

- **Catalogue** : 53 skins en 7 familles (Couleurs, Musique, Motifs, Arcade, Fête,
  Gourmand, Fiertés), tous dans `lib/cosmetics.tsx`.
- **Déblocage** : **les règles sont centralisées** dans `isCosmeticUnlocked(def, { xp,
  badges })` et calculées à la volée à partir de l'XP et des paliers de badges. La
  même fonction sert au profil (cadenas et conditions affichées) et au serveur
  (`api/player-account/equip-cosmetic`). Pour changer une règle, on ne modifie que ce
  fichier : ni migration, ni table à remplir.
- **Affichage** : un skin à motif reçoit une pastille blanche sous le libellé du
  buzzer, pour rester lisible.

## Design « Arcade autocollants »

- **Couleurs** : 3 fonds (jaune, ciel, lilas), choisis au hasard à la première visite
  puis mémorisés (`lib/theme.ts`, script inline dans `<head>` pour éviter tout
  flash). Chaque fond définit les variables `--bg`, `--c1`, `--c2` et `--tint`.
- **Tokens Tailwind** : `sage` = c1, `info` = c2. Les surfaces (`inkSurface`,
  `inkSurface2`) sont blanches, `inkSurface3` = tint.
- **Style autocollant** : contours noirs épais et ombres `shadow-sticker`
  (`-sm` / `-lg`).
- **Composants** :
  - buzzer en relief 3D ;
  - `ConfirmDialog` (remplace `window.confirm`) ;
  - interrupteurs en relief ;
  - `ScoreAnimations.tsx` (`AnimatedScoreboard`, `CountUp`, `Confetti`,
    `EndCeremony`).
- **Maquettes de référence** : canvas Claude « Blindtest — Refonte Arcade » (pages
  joueur, hôte, infos, avatars, profil v2).

## Le jeu, techniquement

### Modèle de données (`supabase/migrations/`)

- **`rooms`** : une partie (code, statut `lobby` / `in_progress` / `finished`, mode
  solo / équipe, réglages bonus/malus).
- **`players`** : un joueur dans une room (pseudo, score, équipe, séries, avatar,
  `account_id` éventuel, `is_host` si c'est l'hôte qui joue).
- **`teams`** : les équipes d'une room et leur couleur.
- **`rounds`** : une manche, c'est-à-dire un morceau.
  - Cycle de vie : `pending → playing → buzzed → revealed → scored`. En Maître du jeu,
    une réponse partielle fait repasser la manche de `revealed` à `playing`.
  - Colonnes : `title_found` / `artist_found`, `locked_player_id`,
    `elapsed_seconds`, `is_joker`, mode dénormalisé.
- **`buzzes`** : chaque tentative de buzz, horodatée côté serveur.
- **`round_attempts`** : une ligne par tentative jugée (points, bonus, temps de
  réaction).
- **`rejoin_requests`** : demandes de reprise de place des invités.
- **Comptes** :
  - `player_accounts` : e-mail non lisible publiquement, pseudo, XP, avatar ;
  - `player_badge_progress` et `player_badge_unlocks` ;
  - `player_cosmetics`, qui ne sert plus qu'au skin équipé ;
  - fonction `get_player_leaderboard`.
- **Autres** : `spotify_quota_locks` (verrou de quota partagé).

### Résolution du buzz (0002, étendue par 0008, 0009 et 0017)

Le trigger `resolve_buzz_winner` fait un `UPDATE … WHERE status = 'playing'` à chaque
insert dans `buzzes`. Seul le premier insert validé gagne, grâce au verrou de ligne.
Le trigger exclut aussi le joueur `locked_player_id`, applique les malus de série et
fige `elapsed_seconds` au moment exact du buzz.

### Jugement (0006, 0008, 0017-0019)

- `reveal_round` fait passer la manche de `buzzed` à `revealed`. C'est automatique en
  Maître du jeu, et se fait au clic en Tout le monde participe.
- `resolve_round_attempt(round_id, title_found, artist_found, force_end)` calcule les
  points (2 / 1 / -1, doublés en joker, plus les bonus), met à jour les séries et
  insère la tentative. Ensuite, soit elle clôture la manche, soit elle la relance.
- `timeout_round` clôture la manche sans gagnant.

### Temps réel

Tout passe par **Supabase Realtime** (`postgres_changes`). Chaque table écoutée par
le client doit être ajoutée à la publication `supabase_realtime` : créer la table ne
suffit pas. Sinon, les lignes s'insèrent mais l'UI ne bouge pas (piège corrigé dans
0010 pour `round_attempts`). Côté `/play`, un listener `visibilitychange` relance tous
les abonnements au retour au premier plan, car un websocket tué en veille n'est pas
toujours signalé.

### Mobile web (`/play`)

- Zones sûres de l'encoche (`viewport-fit: cover` et `env(safe-area-inset-*)`).
- Zoom désactivé.
- Wake Lock pour que l'écran reste allumé.
- Vibration au buzz, sur Android uniquement.
- Re-synchronisation au réveil du téléphone.

### Pourquoi 127.0.0.1 et pas localhost

Spotify exige `127.0.0.1` dans les URI de redirection. Or, les cookies posés sur
`localhost` sont invisibles depuis `127.0.0.1`, ce qui provoquait des « state
mismatch » ou des « verifier manquant ». `useForceLoopbackHost` redirige donc
automatiquement vers `127.0.0.1` en local (sur `/host`, `/connexion`, `/spotify-test`).
En prod, il ne fait rien.

## Architecture / stack

- **`apps/web-host/`** : l'app réellement utilisée. Next.js 16 (App Router,
  Turbopack), React 19, Tailwind 3, Supabase JS, lucide-react, qrcode.react.
- **`apps/mobile/`** : Expo, mis de côté.
- **`packages/game-logic/`** : code de room, scoring, résolution de buzz,
  correspondance des réponses, presets de genres.
- **`packages/api-clients/`** : `spotify.ts`, complet. `deezer.ts` et `youtube.ts`
  sont des stubs : le vrai client Deezer est dans `apps/web-host/src/lib`.
- **`packages/ui/`** : tokens (embryonnaire).
- **`supabase/migrations/`** : schéma, RLS et fonctions, numérotés.
- **`.github/workflows/ci.yml`** : lint et typecheck à chaque push ou PR.

### Migrations

| # | Contenu |
|---|---|
| 0001 | Schéma de base, RLS en refus par défaut |
| 0002 | Trigger de résolution atomique du buzz |
| 0003 / 0004 | Policies prototype, puis durcissement (GRANT ciblés, fonctions SECURITY DEFINER) |
| 0005-0007 | Validation, révélation, timeout de manche |
| 0008 / 0009 | Réponses partielles, `round_attempts`, timer figé au buzz |
| 0010 | `round_attempts` dans la publication Realtime |
| 0011 | Temps de réaction (buzzeur le plus rapide) |
| 0012 / 0013 | Verrou de quota Spotify partagé, avec délai croissant |
| 0014 | Redémarrer une partie (scores remis à zéro, mêmes joueurs) |
| 0015 / 0016 | L'hôte peut jouer ; mode dénormalisé sur les manches |
| 0017-0019 | Bonus/malus, réglages par partie, seuils ajustés |
| 0020 | Comptes joueurs |
| 0021 | Badges et XP (`award_game_rewards`) |
| 0022 | Cosmétiques (skin équipé) |
| 0023 | Classement des joueurs rencontrés |
| 0024 | Pseudo personnalisé conservé |
| 0025 / 0027 | Mode équipes, couleurs d'équipe |
| 0026 | Demandes de reprise de place |
| 0028 | Retrait du joueur de l'hôte, pseudo unique par room |
| 0029 | Connexion par e-mail (`email`, `auth_user_id`) |
| 0030 | Avatars (comptes et joueurs) |
| 0031 | Classement avec avatars |

### `apps/web-host/src` en bref

- **Pages** :
  - `app/page.tsx` (accueil) ;
  - `host/` (écran hôte) ;
  - `play/` (buzzer) ;
  - `connexion/` (e-mail et code) ;
  - `profil/` (espace joueur) ;
  - `rules/`, `about/`, `confidentialite/` ;
  - `spotify-test/` (débogage de la connexion Spotify).
- **`app/_components/`** :
  - `AvatarPicker`, `SkinSwatch`, `ThemePicker` ;
  - `ConfirmDialog`, `ScoreAnimations` ;
  - `TeamSetupPanel`, `Teams` ;
  - `DeezerPlaylistPicker`, `JoinQrCode` ;
  - `HomeActions`, `PlayerAccountCorner`, `RejoinRequestsBanner` ;
  - `CookieConsentBanner`.
- **`app/api/`** :
  - `deezer/*` (proxy) ;
  - `spotify/*` (OAuth de l'hôte, token, logout) ;
  - `player-auth/*` (e-mail, confirm, verify-code, me, logout) ;
  - `player-account/*` (pseudo, avatar, skin, liaison du joueur de l'hôte,
    suppression) ;
  - `host-features` (Spotify autorisé ou non).
- **`lib/`** :
  - `rooms.ts` : toutes les opérations de partie et abonnements Realtime ;
  - `hostSession.ts` : partie en cours de l'onglet ;
  - `ranking.ts`, `teams.ts`, `buzzLockout.ts` ;
  - `badges.ts`, `cosmetics.tsx`, `avatars.tsx`, `avatarExtras.ts` ;
  - hooks `usePlayer*` (compte, badges, cosmétiques, stats, classement, badges
    fraîchement débloqués) ;
  - `useSpotifyPlayer.ts`, `usePreviewPlayer.ts` ;
  - `spotifyAuth.ts`, `playerAuth.ts`, `playerEmailAuth.ts`,
    `playerEmailAccount.ts` ;
  - `supabase.ts` (clé anon) et `supabaseAdmin.ts` (`service_role`, serveur
    uniquement) ;
  - `theme.ts`, `analyticsConsent.ts`.

## Sécurité / RLS

- **Toutes les écritures sensibles** passent par des fonctions Postgres
  `SECURITY DEFINER`, chacune limitée à une seule opération. Aucune policy `UPDATE`
  n'est ouverte sur `players` ou `rounds`, et les colonnes insérables sont
  restreintes par des `GRANT`.
- **Les données de compte** (e-mail, XP, badges) ne sont écrites que par les routes
  serveur, avec la clé `service_role`. L'e-mail n'est jamais lisible publiquement.
- **Limite assumée** : en partie, les joueurs invités sont identifiés par un
  `device_id` côté client, non vérifié. N'importe qui connaissant le code peut
  rejoindre. Avant une ouverture large au public, il faudra restreindre les policies
  au joueur et à la room de l'utilisateur authentifié.
- **Ne jamais exposer `SUPABASE_SERVICE_ROLE_KEY`** avec un préfixe `NEXT_PUBLIC_`.
  Ne jamais committer `.env.local`.

## Démarrer en local

Prérequis : Node.js 18+, un projet Supabase gratuit, et Chrome de préférence.
L'app Spotify Developer et un compte Premium ne sont nécessaires que pour tester la
source Spotify.

```bash
npm install
cp apps/web-host/.env.example apps/web-host/.env.local   # puis remplir
npm run web-host                                          # http://localhost:3000
```

### Variables d'environnement

| Variable | Rôle / où la trouver | Secrète ? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → Data API (sans `/` final) | Non |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API Keys → `anon` | Non |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API Keys → `service_role` (serveur uniquement) | **Oui** |
| `PLAYER_SESSION_SECRET` | Signe le cookie `player_session` : `openssl rand -hex 32` | **Oui** |
| `SPOTIFY_HOST_EMAILS` | E-mails autorisés à utiliser Spotify, séparés par des virgules | Non |
| `SPOTIFY_CLIENT_ID` | Spotify Developer Dashboard (pas de Client Secret, flow PKCE) | Non |
| `SPOTIFY_REDIRECT_URI` | `http://127.0.0.1:3000/api/spotify/callback` | Non |
| `SPOTIFY_PLAYER_REDIRECT_URI` | Pour l'ancienne connexion joueur via Spotify, plus utilisée dans l'UI | Non |

Pièges :
- Les variables ne sont lues qu'au démarrage : relancer après chaque modification.
- Une erreur `fetch failed` ou `Load failed` signifie une URL Supabase fausse, ou un
  projet gratuit mis en pause (à restaurer depuis le dashboard).
- Sur Vercel, les variables *Sensitive* ne sont plus lisibles. Pour une nouvelle
  machine, récupérer la `service_role` dans Supabase et générer un secret de session
  local.
- Dans le Finder, `Cmd + Maj + .` affiche les fichiers cachés.

### Configuration Supabase

1. **Migrations** : exécuter les fichiers de `supabase/migrations/` dans l'ordre
   (0001 → 0031), dans le SQL Editor. Une migration committée n'est **pas**
   appliquée automatiquement : il faut aussi la coller dans le SQL Editor. Attention,
   la base locale et la prod sont la même base.
2. **Realtime** : vérifier que `players`, `rounds`, `buzzes`, `rooms`,
   `round_attempts`, `teams` et `rejoin_requests` sont dans la publication
   `supabase_realtime` (Database → Publications).
3. **Auth**, pour la connexion par e-mail :
   - **Providers** : Email activé, OTP à **6 chiffres**.
   - **URL Configuration** : Site URL = l'URL de prod. Ajouter aux Redirect URLs
     `https://blindtest-app-web-host.vercel.app/api/player-auth/confirm**` et
     `http://127.0.0.1:3000/api/player-auth/confirm**`.
   - **Email Templates** (Magic Link) : afficher le lien et le code `{{ .Token }}`.
   - **SMTP** : Brevo, configuré dans Auth → SMTP Settings. Le SMTP intégré de
     Supabase est trop limité en volume. Prévoir un domaine propre (par exemple avec
     Resend) avant le lancement, pour sortir des spams.

### Configuration Spotify Developer (optionnelle)

Ajouter aux Redirect URIs `http://127.0.0.1:3000/api/spotify/callback` et son
équivalent de prod. Copier le Client ID dans `.env.local`.

## Déploiement (Vercel)

1. Importer le repo avec **Root Directory = `apps/web-host`**.
2. Renseigner les variables ci-dessus, avec les URI de redirection en
   `https://blindtest-app-web-host.vercel.app/...`. Marquer comme *Sensitive*
   `SUPABASE_SERVICE_ROLE_KEY` et `PLAYER_SESSION_SECRET`.
3. **Un push sur `main` déploie la prod.**

Les cookies sont en `secure: true` en production, détecté via `NODE_ENV`.

## Qualité / CI

- ESLint 9 (config flat, `eslint-config-next`) et TypeScript strict.
- GitHub Actions : lint et typecheck de `web-host` et `mobile` sur `develop` et `main`.
- Commandes :
  - `npm run lint --workspace=apps/web-host`
  - `npm run typecheck --workspace=apps/web-host`
- Avant un merge sur `main` : lint, typecheck, et si possible un build
  (`rm -rf .next && npx next build` dans `apps/web-host`). Le build échoue sans
  `.env.local` (`supabaseUrl is required`) : c'est attendu.
- Règles de lint à connaître :
  - `react-hooks/set-state-in-effect` ;
  - pas de lecture de ref pendant le rendu ;
  - apostrophes typographiques (’) dans le texte JSX.

## Conventions Git

- `develop` est la branche de travail. On merge dans `main` puis on pousse, ce qui
  déploie.
- Commits au format [Conventional Commits](https://www.conventionalcommits.org/) de
  préférence (`feat:`, `fix:`…).
- Repo sur un compte GitHub **personnel** : la config git est locale au repo, pas
  globale.
- Une migration SQL doit être committée **et** exécutée à la main dans Supabase.
- **Toute nouvelle table doit déclarer ses droits explicitement**, dans la migration qui la crée. Depuis le 30/10/2026, Supabase n'accorde plus automatiquement l'accès aux nouvelles tables du schéma `public` ; sans `grant`, l'API renvoie « permission denied ». Toujours activer la RLS, et n'accorder que le strict nécessaire, par exemple :
  ```sql
  alter table public.ma_table enable row level security;
  grant select on public.ma_table to anon, authenticated;          -- lecture publique (+ policy)
  grant select, insert, update, delete on public.ma_table to service_role; -- routes serveur
  ```
  Une table interne, lue uniquement par des fonctions `security definer` (comme `room_hosts` ou `rate_limits`), ne reçoit aucun `grant`.

## Roadmap

✅ **Fait**
- Buzzer temps réel atomique.
- Deux modes de jeu, réponses partielles, timer figé.
- Mode équipes, bonus/malus réglables.
- Deezer par défaut, Spotify réservé à certains comptes.
- Reprise de partie et de place.
- Comptes par e-mail.
- Avatars et effets, badges et XP, 53 skins de buzzer.
- Profil v2 (stats, historique, classement).
- Refonte « Arcade autocollants » : animations de score, cérémonie de fin.
- Déploiement Vercel et CI.

🔜 **Prochaines étapes**
- Redéfinir les règles de déblocage des skins (`lib/cosmetics.tsx`).
- Fonctionnalité **amis**, avec un classement entre amis.
- Domaine propre et e-mails transactionnels (Resend) avant le lancement.
- Volet légal : Deezer, CGU, RGPD (une page `/confidentialite` existe déjà).
- Style de jeu dans les stats (il faudrait stocker plus de données).
- Persister les playlists côté serveur pour les réutiliser d'une partie à l'autre.
- App mobile native, seulement si le besoin d'une app installable se confirme.
