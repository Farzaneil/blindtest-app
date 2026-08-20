import { GENRE_PRESETS } from "@blindtest/game-logic";

/**
 * Définitions des badges (libellés, catégories, seuils) — phase 3 du plan
 * décrit dans cadrage_comptes_recompenses_rgpd.md. Conformément au principe
 * explicite du cadrage, ces définitions vivent ici, dans le CODE, jamais en
 * base : seules la progression et les dates de déblocage sont persistées
 * (voir player_badge_progress / player_badge_unlocks, migration 0021).
 *
 * Les seuils ci-dessous sont dupliqués dans award_game_rewards() (voir
 * supabase/migrations/0021_badges_xp.sql) — à garder synchronisés si jamais
 * ils changent. Le seuil "or" d'Éclectique n'est PAS dupliqué en dur ici :
 * il vaut le nombre de genres disponibles (Object.keys(GENRE_PRESETS).length,
 * voir packages/game-logic/src/genrePresets.ts) ; en revanche il EST dupliqué
 * en dur (5) côté SQL, faute de pouvoir partager ce calcul avec Postgres —
 * voir le commentaire dans la migration.
 */

export type BadgeTier = "none" | "bronze" | "argent" | "or";

export type BadgeCategory = "Performance en jeu" | "Assiduité" | "Social" | "Côté hôte";

export type BadgeDefinition = {
  key: string;
  label: string;
  category: BadgeCategory;
  description: string;
  thresholds: { bronze: number; argent: number; or: number };
};

const GENRE_COUNT = Object.keys(GENRE_PRESETS).length;

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // --- Performance en jeu ---------------------------------------------------
  {
    key: "melomane",
    label: "Mélomane",
    category: "Performance en jeu",
    description: "Bonnes réponses cumulées",
    thresholds: { bronze: 50, argent: 250, or: 1000 },
  },
  {
    key: "sans_faute",
    label: "Sans-faute",
    category: "Performance en jeu",
    description: "Parties à 100% de réussite",
    thresholds: { bronze: 1, argent: 5, or: 20 },
  },
  {
    key: "eclair",
    label: "Éclair",
    category: "Performance en jeu",
    description: "Bonus vitesse déclenchés",
    thresholds: { bronze: 10, argent: 50, or: 200 },
  },
  {
    key: "sur_une_lancee",
    label: "Sur une lancée",
    category: "Performance en jeu",
    description: "Streaks de 3 bonnes réponses atteints",
    thresholds: { bronze: 1, argent: 10, or: 50 },
  },
  {
    key: "comeback",
    label: "Comeback",
    category: "Performance en jeu",
    description: "Bonus remontada réussis",
    thresholds: { bronze: 1, argent: 10, or: 30 },
  },
  {
    key: "chanceux",
    label: "Chanceux",
    category: "Performance en jeu",
    description: "Manches joker gagnées",
    thresholds: { bronze: 5, argent: 20, or: 50 },
  },
  {
    key: "reflexes",
    label: "Réflexes",
    category: "Performance en jeu",
    description: "Premier à buzzer, peu importe le résultat",
    thresholds: { bronze: 20, argent: 100, or: 400 },
  },
  {
    key: "bonne_oreille",
    label: "Bonne oreille",
    category: "Performance en jeu",
    description: "Réponses partielles cumulées",
    thresholds: { bronze: 20, argent: 100, or: 400 },
  },
  {
    key: "sang_froid",
    label: "Sang-froid",
    category: "Performance en jeu",
    description: "Bonnes réponses dans la dernière seconde",
    thresholds: { bronze: 5, argent: 25, or: 100 },
  },
  {
    key: "invincible",
    label: "Invincible",
    category: "Performance en jeu",
    description: "Record de victoires consécutives",
    thresholds: { bronze: 2, argent: 5, or: 10 },
  },
  // --- Assiduité -------------------------------------------------------------
  {
    key: "increvable",
    label: "Increvable",
    category: "Assiduité",
    description: "Parties jouées",
    thresholds: { bronze: 10, argent: 50, or: 200 },
  },
  {
    key: "champion",
    label: "Champion",
    category: "Assiduité",
    description: "Parties terminées à la 1ère place",
    thresholds: { bronze: 1, argent: 10, or: 50 },
  },
  {
    key: "fidele",
    label: "Fidèle",
    category: "Assiduité",
    description: "Mois calendaires distincts joués",
    thresholds: { bronze: 3, argent: 6, or: 12 },
  },
  // --- Social ------------------------------------------------------------
  {
    key: "sociable",
    label: "Sociable",
    category: "Social",
    description: "Comptes distincts rencontrés",
    thresholds: { bronze: 5, argent: 20, or: 50 },
  },
  // --- Côté hôte ---------------------------------------------------------
  {
    key: "maitre_du_jeu",
    label: "Maître du jeu",
    category: "Côté hôte",
    description: "Parties organisées en tant qu'hôte",
    thresholds: { bronze: 1, argent: 10, or: 50 },
  },
  {
    key: "curateur",
    label: "Curateur",
    category: "Côté hôte",
    description: "Playlists Spotify importées",
    thresholds: { bronze: 5, argent: 20, or: 100 },
  },
  {
    key: "eclectique",
    label: "Éclectique",
    category: "Côté hôte",
    description: "Genres distincts explorés",
    thresholds: { bronze: 3, argent: 6, or: GENRE_COUNT },
  },
];

export const BADGE_BY_KEY: Record<string, BadgeDefinition> = Object.fromEntries(
  BADGE_DEFINITIONS.map((b) => [b.key, b])
);

export function tierForProgress(def: BadgeDefinition, progress: number): BadgeTier {
  if (progress >= def.thresholds.or) return "or";
  if (progress >= def.thresholds.argent) return "argent";
  if (progress >= def.thresholds.bronze) return "bronze";
  return "none";
}

export function nextThreshold(def: BadgeDefinition, progress: number): number | null {
  if (progress < def.thresholds.bronze) return def.thresholds.bronze;
  if (progress < def.thresholds.argent) return def.thresholds.argent;
  if (progress < def.thresholds.or) return def.thresholds.or;
  return null; // déjà au palier max (or)
}

/**
 * Niveau = palier tous les 100 XP (formule du cadrage, "ajustable"). Niveau
 * 1 de 0 à 99 XP, niveau 2 de 100 à 199, etc. — jamais de niveau 0, même à
 * 0 XP, pour rester cohérent avec l'affichage "Niveau X" de la maquette.
 */
export const XP_PER_LEVEL = 100;

export function levelForXp(xp: number): number {
  return Math.floor(Math.max(xp, 0) / XP_PER_LEVEL) + 1;
}

export function xpIntoCurrentLevel(xp: number): number {
  return Math.max(xp, 0) % XP_PER_LEVEL;
}
