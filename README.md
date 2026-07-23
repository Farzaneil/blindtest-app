# Blindtest App

Une appli pour faire des blind tests entre potes sans avoir besoin de quelqu'un dédié
au lancement des sons : les téléphones (ou ordis) des joueurs servent de buzzer, un
écran "hôte" (laptop projeté sur une TV, ou juste un ordi) diffuse le son via Spotify,
affiche le code de partie, les joueurs connectés et qui a buzzé en premier.

Projet perso (premier projet d'appli), pensé pour apprendre en s'amusant — pas un
produit commercial. Voir `docs/architecture/blueprint.docx` pour le contexte initial
complet (concept, DA, roadmap, business plan) ; ce README documente l'état **réel** du
code, qui a pas mal évolué depuis ce document de départ.

## État actuel (à jour)

**Le MVP est jouable, déployé, et testé de bout en bout avec de vraies personnes sur
des réseaux différents.** Concrètement, ce qui marche aujourd'hui :

- Un hôte ouvre l'écran web, obtient un code de partie à 6 caractères.
- Des joueurs rejoignent depuis leur téléphone (navigateur, pas d'appli à installer)
  avec ce code + un pseudo.
- L'hôte se connecte à son compte Spotify Premium, cherche un morceau, lance la manche
  → le son se joue sur l'ordi de l'hôte.
- Les joueurs buzzent depuis leur téléphone ; le premier à buzzer est déterminé de
  façon fiable côté serveur (pas de course possible même si deux buzz arrivent à
  quelques millisecondes d'écart) ; le son se coupe automatiquement.
- L'hôte valide "bonne réponse" / "mauvaise réponse" → le joueur gagne un point si
  correct, et une nouvelle recherche redevient possible pour enchaîner sur la manche
  suivante.
- Testé en conditions réelles : hôte + un joueur sur deux réseaux différents (pas
  besoin d'être sur le même wifi), via l'app déployée sur Vercel.

Ce qui **ne marche pas encore** / n'est pas fait :

- **Appli mobile native (Expo)** : le code existe (`apps/mobile`) et reproduit la même
  logique rejoindre + buzzer, mais n'a jamais été validée de bout en bout — bloquée sur
  des soucis de toolchain natif (CocoaPods / Ruby / libyaml) côté compilation iOS.
  Mise de côté volontairement : le buzzer web (`/play`, accessible depuis n'importe
  quel navigateur mobile) remplit déjà ce rôle et a été testé en conditions réelles.
- Pas de mode équipe, pas de thèmes/playlists pré-construites, pas de génération de
  playlist par IA, pas de mode réponse vocale (tout ça était prévu dans le blueprint
  initial mais pas commencé).
- Pas de vraie authentification (voir section RLS / sécurité plus bas — c'est une
  limite assumée pour cette phase "entre potes").
- Une manche ne peut avancer que dans un sens : personne ne peut "annuler" un buzz ou
  relancer un morceau sans qu'il y ait eu une réponse validée.

## Comment jouer (procédure exacte)

**En ligne (recommandé, pas besoin d'être sur le même réseau) :**

- Hôte : ouvre `https://blindtest-app-web-host.vercel.app/` sur ton ordi, connecte-toi
  à Spotify (compte Premium requis, voir plus bas), note le code affiché.
- Joueurs : chacun ouvre `https://blindtest-app-web-host.vercel.app/play` sur son
  téléphone, entre le code + un pseudo.

**En local (pour développer) :**

- Hôte : `http://localhost:3000/` (redirige automatiquement vers `127.0.0.1`, requis
  pour que la connexion Spotify fonctionne — voir "Pourquoi 127.0.0.1 et pas
  localhost" plus bas).
- Joueurs : `http://localhost:3000/play` dans d'autres onglets, ou depuis un autre
  appareil sur le même réseau via `http://<IP locale de l'hôte>:3000/play`.

Un seul onglet host à la fois : chaque chargement de `/` crée une **nouvelle** partie
avec un nouveau code (comportement voulu, pas un bug — si tu recharges la page hôte en
plein milieu d'une partie, tu en crées une nouvelle).

## Le jeu, techniquement

### Modèle de données (voir `supabase/migrations/0001_init.sql`)

Pas de table "hosts" séparée : l'hôte est juste le navigateur qui a créé la `room` et
s'est connecté à Spotify dessus. Les tables principales :

- `rooms` : une partie (code, statut lobby/in_progress/finished).
- `players` : un joueur ayant rejoint une room (pseudo, score, device_id).
- `rounds` : une manche = un morceau (titre, artiste, statut
  pending → playing → buzzed → scored).
- `buzzes` : chaque tentative de buzz (pas juste le gagnant), horodatée côté serveur.
- `teams`, `playlists`, `answers` : présentes dans le schéma pour les features futures
  (mode équipe, playlists pré-construites, réponse écrite/vocale) mais pas encore
  utilisées par le code actuel.

### Résolution du buzz (voir `supabase/migrations/0002_buzz_resolution.sql`)

Plutôt que de laisser le client décider "qui a buzzé en premier" (source de bugs si
deux buzz arrivent presque en même temps), un trigger Postgres
(`resolve_buzz_winner`) fait une `UPDATE ... WHERE status = 'playing'` à chaque insert
dans `buzzes` : seul le premier insert à valider sa transaction gagne, grâce au verrou
de ligne pris par la clause `WHERE`. Aucune logique applicative ne peut se tromper
là-dessus, même sous forte concurrence.

### Validation de la réponse (voir `supabase/migrations/0005_resolve_round.sql`)

Une fonction Postgres `resolve_round(round_id, correct)` (appelée en RPC depuis
`resolveRound()` dans `rooms.ts`) attribue le point si besoin et repasse la manche à
`scored`, ce qui débloque une nouvelle recherche côté hôte.

### Temps réel

Tout passe par **Supabase Realtime** (`postgres_changes`) : les tables `players`,
`rounds` et `buzzes` doivent être ajoutées à la publication `supabase_realtime` (déjà
fait sur le projet Supabase actuel — voir Database → Publications dans le dashboard
Supabase si jamais ça doit être refait sur un nouveau projet).

### Intégration Spotify (voir `packages/api-clients/src/spotify.ts` et `apps/web-host/src/lib/spotifyAuth.ts`)

Points importants, vérifiés en 2026 :

- **Compte Spotify Premium obligatoire côté hôte.** Spotify a supprimé l'accès aux
  extraits gratuits de 30s (`preview_url`) pour toute app créée après le 27/11/2024 —
  il n'y a plus moyen de contourner ça, seule la lecture complète via un SDK officiel
  fonctionne, et ce SDK exige Premium.
- **Web Playback SDK** : crée un "device" Spotify Connect directement dans l'onglet du
  navigateur de l'hôte. Le son sort de l'ordi de l'hôte, pas besoin d'enceinte
  connectée en Bluetooth.
- **Auth : Authorization Code Flow + PKCE**, pas de Client Secret utilisé (ni stocké
  côté serveur). Tokens (access + refresh) stockés en cookies `httpOnly`, pas en base.
  Une seule session Spotify active à la fois (celle de l'hôte).
- **Recherche** : `GET /v1/search`, avec le token utilisateur obtenu via PKCE.
- Plusieurs endpoints Spotify (recommendations, audio-features, audio-analysis,
  related-artists, featured-playlists) sont dépréciés pour les nouvelles apps depuis
  nov. 2024 — ne pas construire de logique dessus.
- Avant validation "Extended Quota Mode" par Spotify, l'app Spotify Developer est
  limitée à 5 utilisateurs de test en Developer Mode (largement suffisant pour jouer
  entre potes).

### Pourquoi 127.0.0.1 et pas localhost

L'URI de redirection OAuth Spotify doit être enregistrée exactement dans le dashboard
développeur, et Spotify exige `127.0.0.1` plutôt que `localhost` depuis fin 2025. Or
les cookies posés sur `localhost` sont invisibles depuis `127.0.0.1` (le navigateur les
traite comme deux origines différentes) — ce qui cassait la connexion Spotify de façon
assez peu intuitive (`state mismatch`) si on testait sur `localhost`. Un garde-fou
(`useForceLoopbackHost`, utilisé dans `page.tsx` et `spotify-test/page.tsx`) redirige
automatiquement vers `127.0.0.1` si jamais la page est ouverte via `localhost`, pour ne
plus jamais retomber dans ce piège. Cette redirection ne s'applique qu'en local ; en
prod (un vrai domaine HTTPS) elle ne fait rien.

## Architecture / stack

- `apps/web-host/` — Next.js 16 (App Router, Turbopack) : **l'appli réellement
  utilisée aujourd'hui** (écran hôte, page joueur `/play`, connexion Spotify).
- `apps/mobile/` — Expo (React Native) : écrit mais jamais validé de bout en bout,
  mis de côté (voir "État actuel").
- `packages/game-logic/` — génération de code de room, scoring, résolution de buzz,
  matching de réponse : TypeScript partagé entre web-host et mobile.
- `packages/ui/` — design system partagé (tokens couleur/typo), embryonnaire.
- `packages/api-clients/` — wrappers API musique. `spotify.ts` est complet (recherche
  + lecture). `youtube.ts` / `deezer.ts` sont des stubs non utilisés.
- `supabase/migrations/` — schéma Postgres + RLS + fonctions, versionné et numéroté :
  - `0001_init` : schéma de base + RLS activée (deny-all par défaut)
  - `0002_buzz_resolution` : trigger de résolution atomique du buzz
  - `0003_dev_policies` : policies RLS permissives (phase prototype)
  - `0004_rls_hardening` : durcissement (colonnes restreintes, fonctions
    SECURITY DEFINER) — voir la section Sécurité plus bas
  - `0005_resolve_round` : RPC de validation de réponse + attribution du score
- `docs/architecture/` — document de conception initial (`blueprint.docx`).
- `.github/workflows/ci.yml` — lint + typecheck des deux apps sur push/PR.

### apps/web-host en détail

- `src/app/page.tsx` — écran hôte : code de partie, joueurs, recherche Spotify,
  lancement de manche, validation réponse/score.
- `src/app/play/page.tsx` — écran joueur : rejoindre par code + pseudo, bouton buzz.
- `src/app/spotify-test/page.tsx` — page de validation isolée de la connexion Spotify
  (utile pour déboguer l'auth sans dépendre d'une partie en cours).
- `src/app/api/spotify/login/route.ts` — démarre le flow OAuth PKCE, pose les cookies
  verifier/state.
- `src/app/api/spotify/callback/route.ts` — échange le code contre les tokens, pose
  les cookies de session.
- `src/app/api/spotify/token/route.ts` — renvoie un access token valide au client
  (refresh automatique si besoin).
- `src/app/api/spotify/logout/route.ts` — supprime les cookies de session Spotify.
- `src/lib/rooms.ts` — toutes les fonctions Supabase : créer/rejoindre une room,
  s'abonner aux joueurs/manches en temps réel, lancer une manche, buzzer, résoudre
  une manche.
- `src/lib/spotifyAuth.ts` — fonctions pures PKCE (génération verifier/challenge/state,
  échange de code, refresh) ; pas de cookies ici, c'est chaque route qui les manipule
  directement.
- `src/lib/useSpotifyPlayer.ts` — hook : connexion au Web Playback SDK, expose device
  id + access token + état de connexion.
- `src/lib/useForceLoopbackHost.ts` — garde-fou localhost → 127.0.0.1 (voir plus haut).
- `src/lib/supabase.ts` — client Supabase (clé anon, lit les variables d'env).

## Sécurité / RLS — limites assumées

**Il n'y a pas d'authentification réelle** (Supabase Auth n'est pas branché). Les
joueurs sont identifiés par un `device_id` généré côté client, non vérifié. C'est un
choix assumé pour cette phase "prototype entre amis" (voir les commentaires en tête de
`0003_dev_policies.sql`), pas un oubli — mais il faut en avoir conscience avant
d'envisager d'ouvrir l'app à des inconnus :

- N'importe qui connaissant le code d'une partie peut la rejoindre.
- Un client techniquement curieux pourrait appeler les routes Supabase directement
  (avec la clé anon, publique par nature) plutôt que de passer par l'interface.

Ceci dit, `0004_rls_hardening.sql` réduit déjà pas mal la surface : plus aucune policy
`UPDATE` ouverte sur `players` ou `rounds` (un client ne peut plus modifier le score de
quelqu'un d'autre ou trafiquer le statut d'une manche directement) ; les colonnes
insérables sont restreintes via des `GRANT` ciblés (impossible de s'auto-déclarer hôte,
de truquer un score à la création, ou de falsifier l'horodatage d'un buzz) ; les seules
transitions d'état encore possibles passent par des fonctions Postgres
`SECURITY DEFINER` (`resolve_buzz_winner`, `resolve_round`) qui ne font qu'une chose
précise chacune. À faire avant une vraie ouverture au public : brancher Supabase Auth
(même anonyme) et réécrire les policies pour restreindre "appartenir à sa propre
room / son propre player".

## Démarrer en local

Prérequis : Node.js 18+, un compte [Supabase](https://supabase.com) (gratuit), un
compte [Spotify Developer](https://developer.spotify.com/dashboard) (gratuit, **et un
compte Spotify Premium** pour tester la lecture), un navigateur Chrome de préférence
(testé et fiable ; Safari a des comportements différents avec les cookies sur IP
littérale).

Étapes :

1. Installer les dépendances de tout le monorepo : `npm install`
2. Lancer l'écran hôte web (http://localhost:3000, redirige vers 127.0.0.1) :
   `npm run web-host`
3. (Optionnel, non maintenu activement) l'app mobile Expo : `npm run mobile`

### Variables d'environnement

Dans `apps/web-host/.env.local` (jamais commité, voir `.gitignore`) :

- `NEXT_PUBLIC_SUPABASE_URL` = https://ton-projet.supabase.co
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = clé anon publique du projet Supabase
- `SPOTIFY_CLIENT_ID` = Client ID de ton app Spotify Developer
- `SPOTIFY_REDIRECT_URI` = http://127.0.0.1:3000/api/spotify/callback

Pas de `SPOTIFY_CLIENT_SECRET` nécessaire (flow PKCE).

### Configuration Supabase

1. Crée un projet sur [supabase.com](https://supabase.com).
2. Dans SQL Editor, exécute dans l'ordre les fichiers de `supabase/migrations/`
   (0001 → 0005). Chaque fichier est commenté pour expliquer ce qu'il fait.
3. Dans Database → Publications → `supabase_realtime`, active le toggle pour les
   tables `players`, `rounds`, `buzzes`, `rooms` (sans ça, l'interface hôte ne se met
   pas à jour en temps réel — piège rencontré et documenté dans l'historique du repo).

### Configuration Spotify Developer

1. Crée une app sur le [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Dans Settings → Redirect URIs, ajoute `http://127.0.0.1:3000/api/spotify/callback`
   (et l'URL de prod si tu déploies, voir plus bas).
3. Copie le Client ID dans `.env.local` (pas besoin du Client Secret).

## Déploiement (Vercel)

L'app est déployée sur Vercel (offre Hobby, gratuite pour un usage personnel/non
commercial) : **https://blindtest-app-web-host.vercel.app**

Pour redéployer ou recréer le déploiement :

1. Sur [vercel.com](https://vercel.com), importe le repo GitHub, avec **Root
   Directory = `apps/web-host`** (monorepo — Vercel doit savoir où trouver l'app
   Next.js).
2. Renseigne les variables d'environnement (mêmes noms qu'en local, sauf
   `SPOTIFY_REDIRECT_URI` qui doit pointer vers le domaine Vercel réel, ex.
   `https://blindtest-app-web-host.vercel.app/api/spotify/callback`).
3. Ajoute cette même URL dans les Redirect URIs du Spotify Developer Dashboard (en plus
   de celle en `127.0.0.1`, garder les deux).
4. Deploy.

Les cookies de session Spotify sont automatiquement en `secure: true` en production
(HTTPS) et `secure: false` en local (HTTP) — géré via
`process.env.NODE_ENV === "production"` dans les routes `api/spotify/*`.

## Qualité / CI

- **ESLint** (config flat, ESLint 9) : `eslint-config-next` pour web-host,
  `eslint-config-expo` pour mobile.
- **TypeScript strict** sur les deux apps (`npm run typecheck --workspace=apps/...`).
- **GitHub Actions** (`.github/workflows/ci.yml`) : lint + typecheck des deux apps à
  chaque push/PR sur `develop` et `main`.

Commandes utiles :

- `npm run lint --workspace=apps/web-host`
- `npm run typecheck --workspace=apps/web-host`
- `npm run lint --workspace=apps/mobile`
- `npm run typecheck --workspace=apps/mobile`

## Conventions Git

- `main` : branche stable, mise à jour après validation d'un palier (merge depuis
  `develop`).
- `develop` : branche de travail au quotidien.
- `feature/<nom>` : optionnel, pour une fonctionnalité isolée avant de merger dans
  `develop`.
- Commits au format [Conventional Commits](https://www.conventionalcommits.org/) :
  `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`.
- Repo hébergé sur un compte GitHub **personnel**, distinct du compte professionnel
  utilisé sur cette même machine (config git locale au repo, pas globale — voir
  `git config --local -l` si besoin de vérifier).

## Roadmap (mis à jour)

Complété par rapport au plan initial (`docs/architecture/blueprint.docx`) :

- ✅ Mécanique buzzer temps réel (résolution atomique, testée sous charge normale).
- ✅ Intégration Spotify complète (recherche, lecture, pause automatique au buzz).
- ✅ Boucle de jeu : lancer manche → buzz → valider → score → manche suivante.
- ✅ Déploiement public (Vercel), jouable à distance entre plusieurs réseaux.
- ✅ CI (lint + typecheck), policies RLS durcies dans la limite du raisonnable sans
  auth.

Pas encore fait, par ordre de valeur perçue :

- Mode équipe, thèmes/playlists pré-construites, playlists générées par IA.
- Reprendre l'app mobile native (si le confort d'une vraie app est souhaité un jour —
  pas indispensable, le buzzer web fonctionne bien).
- DA / polish visuel (l'interface actuelle est fonctionnelle mais très brute,
  Tailwind minimal sans vrai travail de design).
- Authentification réelle + policies RLS restreintes par utilisateur, si l'app devait
  s'ouvrir au-delà d'un cercle d'amis de confiance.
