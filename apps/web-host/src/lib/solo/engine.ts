/**
 * Règles du mode solo : tirage des morceaux d'un niveau dans la réserve du
 * monde, propositions des niveaux à choix, points, étoiles et dégâts aux
 * boss. Aucune dépendance au navigateur : testable seul.
 */

import type { Decoys, LevelDef, Tier } from "./worlds";

export type PoolTrack = {
  id: string; // identifiant Deezer (chiffres)
  title: string;
  artist: string; // tous les artistes connus : « Céline Dion, Garou »
  tier: Tier;
  rank?: number; // popularité Deezer
  pl?: number; // playlist d'origine dans la réserve (0, 1, 2…)
  fr?: boolean; // titre en français (deviné)
};

/** Artiste principal (le premier), pour comparer deux morceaux. */
const mainArtist = (t: PoolTrack) => t.artist.split(",")[0].trim().toLowerCase();

// ---------------------------------------------------------------- tirage

function shuffle<T>(items: T[], rand: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Morceaux d'une tentative : dans les tranches du niveau, en écartant les
 * morceaux entendus à la tentative précédente (`recent`) puis, si possible,
 * ceux déjà trouvés dans le monde (`found`). On élargit aux autres tranches
 * seulement si la réserve est trop petite.
 */
export function drawTracks(pool: PoolTrack[], level: LevelDef, recent: Set<string>, found: Set<string>): PoolTrack[] {
  const n = level.tracks;
  const inTier = pool.filter((t) => level.tiers.includes(t.tier));
  const buckets = [
    inTier.filter((t) => !recent.has(t.id) && !found.has(t.id)),
    inTier.filter((t) => !recent.has(t.id) && found.has(t.id)),
    pool.filter((t) => !level.tiers.includes(t.tier) && !recent.has(t.id)),
    pool.filter((t) => recent.has(t.id)),
  ];
  const picked: PoolTrack[] = [];
  const seenArtists = new Set<string>();
  // Premier passage : un seul morceau par artiste ; second : on complète.
  for (const strictArtist of [true, false]) {
    for (const bucket of buckets) {
      for (const t of shuffle(bucket)) {
        if (picked.length >= n) break;
        if (picked.some((p) => p.id === t.id)) continue;
        const key = t.artist.toLowerCase();
        if (strictArtist && seenArtists.has(key)) continue;
        picked.push(t);
        seenArtists.add(key);
      }
    }
  }
  return picked.slice(0, n);
}

// --------------------------------------------------- choix (QCM) stables

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded(seed: number): () => number {
  let x = seed || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  };
}

export type Choice = { label: string; correct: boolean };

/** Ressemblance de deux morceaux : même playlist, même langue, popularité proche. */
function likeness(a: PoolTrack, b: PoolTrack): number {
  let score = 0;
  if (a.pl !== undefined && a.pl === b.pl) score += 2;
  if (a.fr !== undefined && a.fr === b.fr) score += 3;
  if (a.tier === b.tier) score += 1;
  if (a.rank && b.rank) score += 2 * (1 - Math.min(1, Math.abs(a.rank - b.rank) / Math.max(a.rank, b.rank)));
  return score;
}

/**
 * Les 4 propositions d'un morceau : TOUJOURS les mêmes pour un morceau donné
 * (tirage déterminé par son identifiant), dans le même ordre. Changer les
 * fausses réponses à chaque tentative permettrait de trouver la bonne par
 * élimination. Leur difficulté dépend du niveau (voir Decoys).
 */
export function choicesFor(track: PoolTrack, pool: PoolTrack[], mode: Decoys = "easy"): Choice[] {
  const rand = seeded(hash(track.id));
  const label = (t: PoolTrack) => `${t.title} — ${t.artist}`;
  const others = pool.filter((t) => t.id !== track.id).sort((a, b) => hash(a.id) - hash(b.id));
  const decoys: PoolTrack[] = [];
  const usedArtists = new Set<string>([mainArtist(track)]);
  const usedTitles = new Set<string>([track.title.toLowerCase()]);
  const take = (t: PoolTrack, allowSameArtist = false) => {
    if (decoys.length >= 3 || usedTitles.has(t.title.toLowerCase())) return;
    if (!allowSameArtist && usedArtists.has(mainArtist(t))) return;
    decoys.push(t);
    usedArtists.add(mainArtist(t));
    usedTitles.add(t.title.toLowerCase());
  };
  if (mode === "hard") {
    // Jusqu'à 2 autres titres du même artiste.
    others.filter((t) => mainArtist(t) === mainArtist(track)).slice(0, 2).forEach((t) => take(t, true));
  }
  if (mode === "easy") {
    shuffle(others, rand).forEach((t) => take(t));
  } else {
    // Les plus ressemblants d'abord, avec un peu de hasard (stable) pour varier.
    others
      .map((t) => ({ t, s: likeness(track, t) + rand() * 0.8 }))
      .sort((a, b) => b.s - a.s)
      .forEach(({ t }) => take(t));
  }
  return shuffle(
    [{ label: label(track), correct: true }, ...decoys.map((t) => ({ label: label(t), correct: false }))],
    rand
  );
}

// ------------------------------------------------------ points, étoiles

export const BASE_POINTS = 100;
export const SPEED_POINTS = 50;

/** Points d'un morceau trouvé : 100 + jusqu'à 50 selon le temps restant. */
export function trackPoints(found: boolean, secondsLeft: number, answerSeconds: number): number {
  if (!found) return 0;
  const ratio = Math.max(0, Math.min(1, secondsLeft / answerSeconds));
  return BASE_POINTS + Math.round(SPEED_POINTS * ratio);
}

/**
 * Objectifs d'un niveau, affichés tels quels au joueur :
 * 1 ★ = trouver `need` morceaux (environ 60 %, arrondi au-dessus) ;
 * 2 ★ et 3 ★ = atteindre un score (bonnes réponses ET rapidité).
 */
export function starGoals(trackCount: number): { need: number; two: number; three: number } {
  const max = trackCount * (BASE_POINTS + SPEED_POINTS);
  return { need: Math.ceil(trackCount * 0.6), two: Math.round((max * 0.65) / 10) * 10, three: Math.round((max * 0.85) / 10) * 10 };
}

export function starsFor(foundCount: number, points: number, trackCount: number): 0 | 1 | 2 | 3 {
  const g = starGoals(trackCount);
  if (trackCount === 0 || foundCount < g.need) return 0;
  if (points >= g.three) return 3;
  if (points >= g.two) return 2;
  return 1;
}

// ------------------------------------------------------------------ boss

export const BOSS_HP = 100;
export const BOSS_HEARTS = 3;

/** Dégâts d'une bonne réponse : 14 + jusqu'à 6 selon la rapidité. */
export function bossDamage(secondsLeft: number, answerSeconds: number): number {
  const ratio = Math.max(0, Math.min(1, secondsLeft / answerSeconds));
  return 14 + Math.round(6 * ratio);
}

/** Étoiles d'un boss battu : selon les cœurs restants. */
export function bossStars(heartsLeft: number): 1 | 2 | 3 {
  return heartsLeft >= 3 ? 3 : heartsLeft === 2 ? 2 : 1;
}
