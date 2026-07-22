# Blindtest App

Une appli pour faire des blind tests entre potes sans avoir besoin de quelqu'un dédié au
changement des sons : les téléphones des joueurs servent de buzzer, un écran "hôte"
(mobile ou projeté sur une TV) diffuse le son et affiche la partie.

Voir `docs/architecture/blueprint.docx` pour le contexte complet (concept, stack, DA,
roadmap, business plan).

## Structure du repo

```
apps/
  mobile/       Appli React Native (Expo) — joueurs + hôte nomade
  web-host/     Next.js — écran hôte projetable (TV / laptop)
packages/
  ui/           Design system partagé (tokens couleur, typo, composants)
  game-logic/   Règles du jeu, scoring, résolution des buzz (TypeScript partagé)
  api-clients/  Wrappers Spotify / Deezer / YouTube
supabase/
  migrations/   Schéma Postgres versionné
  functions/    Edge Functions (génération de playlists IA, matching vocal, etc.)
docs/
  architecture/ Documents de conception
```

## Un modèle important : host = un joueur comme les autres

Il n'y a pas d'app "hôte" séparée. Le rôle d'hôte est un attribut (`is_host`) sur un
joueur au sein d'une partie. Un même téléphone peut donc être à la fois hôte (il
contrôle la lecture audio et l'avancement des manches) et joueur (il a un bouton de
buzz comme tout le monde). Le détail est dans `supabase/migrations/0001_init.sql`.

L'écran partagé (projeté sur TV) n'affiche jamais les choix de réponse personnels d'un
joueur — seulement l'état commun (question en cours, ordre des buzz, classement). Les
choix de réponse restent privés, sur l'écran de chaque joueur, hôte compris.

## Démarrer en local

Prérequis : Node.js 18+, un compte [Supabase](https://supabase.com) (gratuit), un
compte [Spotify Developer](https://developer.spotify.com/dashboard) (gratuit),
[Expo Go](https://expo.dev/go) installé sur ton téléphone pour tester l'app mobile sans
la compiler.

```bash
# 1. Installer les dépendances de tout le monorepo
npm install

# 2. Lancer l'app mobile (ouvre un QR code à scanner avec Expo Go)
npm run mobile

# 3. Lancer l'écran hôte web (sur http://localhost:3000)
npm run web-host
```

La base de données Supabase et les clés d'API (Spotify, Supabase) se configurent dans
un fichier `.env.local` à la racine de chaque app — ils ne sont jamais commités dans
Git (voir `.gitignore`).

## Conventions Git

- `main` : branche de production, protégée.
- `develop` : branche d'intégration, toutes les features y sont fusionnées avant `main`.
- `feature/<nom>` : une branche par fonctionnalité, ouverte depuis `develop`.
- Commits au format [Conventional Commits](https://www.conventionalcommits.org/) :
  `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`, `refactor: ...`.
- Tags de version sémantique (`v0.1.0`, `v0.2.0`, ...) à chaque étape notable de la
  roadmap (voir `docs/architecture/blueprint.docx`, section 7).

## Roadmap (résumé)

- **V0** — Prototype technique : 1 partie, 1 hôte + 2-3 joueurs, playlist Spotify fixe,
  buzzer simple, scoring manuel.
- **V1** — MVP complet : modes solo/équipe, thèmes, buzzer avec réponse manuelle et
  vocale, scoreboard temps réel.
- **V2** — Playlists générées par IA, mode aléatoire, source YouTube en complément.
- **V3** — Comptes persistants, statistiques, Apple Music, publication sur les stores.
