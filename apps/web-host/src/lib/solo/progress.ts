/**
 * Progression du mode solo : étoiles par niveau, bonus en stock, morceaux
 * déjà trouvés et entendus récemment par monde (pour que chaque tentative
 * tire d'autres morceaux, voir engine.drawTracks).
 *
 * Le mode solo exige d'être connecté (voir app/solo/_components/SoloGate) :
 * la progression est enregistrée sur le compte (table solo_progress,
 * migration 0039, route /api/solo/progress) et gardée en copie sur
 * l'appareil (localStorage, une clé par compte) pour un affichage immédiat.
 */

import { WORLDS, type LevelDef, type WorldDef } from "./worlds";

export type BoosterKey = "time" | "hint" | "replay" | "skip";
export const BOOSTERS: BoosterKey[] = ["time", "hint", "replay", "skip"];

export type SoloProgress = {
  version: 1;
  stars: Record<string, 0 | 1 | 2 | 3>; // id du niveau → meilleur résultat
  best: Record<string, number>; // id du niveau → meilleur score
  boosters: Record<BoosterKey, number>;
  found: Record<string, string[]>; // monde → morceaux déjà trouvés
  recent: Record<string, string[]>; // niveau → morceaux de la dernière tentative
};

const KEY = "kazou-solo-v1";
const MAX_FOUND_PER_WORLD = 400;
// Stock maximum par bonus : ils doivent rester précieux.
export const MAX_PER_BOOSTER = 3;

export function emptyProgress(): SoloProgress {
  return { version: 1, stars: {}, best: {}, boosters: { time: 1, hint: 1, replay: 1, skip: 1 }, found: {}, recent: {} };
}

// Compte dont on lit / écrit la progression (fixé par SoloGate une fois connecté).
let owner: string | null = null;
const keyFor = (id: string | null) => (id ? `${KEY}:${id}` : KEY);

function normalizeProgress(p: unknown): SoloProgress | null {
  const o = p as SoloProgress | null;
  if (!o || o.version !== 1) return null;
  const boosters = { ...emptyProgress().boosters, ...o.boosters };
  for (const k of BOOSTERS) boosters[k] = Math.min(MAX_PER_BOOSTER, Math.max(0, Number(boosters[k]) || 0));
  return { ...emptyProgress(), ...o, boosters };
}

function readLocal(key: string): SoloProgress | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? normalizeProgress(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function loadProgress(): SoloProgress {
  return readLocal(keyFor(owner)) ?? emptyProgress();
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;

/** Enregistre sur l'appareil tout de suite, et sur le compte (regroupé, 600 ms). */
export function saveProgress(p: SoloProgress) {
  try {
    localStorage.setItem(keyFor(owner), JSON.stringify(p));
  } catch {
    // stockage indisponible (navigation privée) : le compte garde la sauvegarde
  }
  if (!owner) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    fetch("/api/solo/progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progress: p }),
      keepalive: true,
    }).catch(() => {});
  }, 600);
}

/** Fusion de deux progressions : le meilleur de chacune (étoiles, records, morceaux trouvés) ; les bonus de `a`. */
export function mergeProgress(a: SoloProgress, b: SoloProgress): SoloProgress {
  const out = emptyProgress();
  for (const id of new Set([...Object.keys(a.stars), ...Object.keys(b.stars)])) {
    out.stars[id] = Math.max(a.stars[id] ?? 0, b.stars[id] ?? 0) as 0 | 1 | 2 | 3;
  }
  for (const id of new Set([...Object.keys(a.best), ...Object.keys(b.best)])) out.best[id] = Math.max(a.best[id] ?? 0, b.best[id] ?? 0);
  // Bonus : ceux de `a` (le compte fait foi), sinon un bonus dépensé ailleurs reviendrait.
  for (const k of BOOSTERS) out.boosters[k] = Math.min(MAX_PER_BOOSTER, a.boosters[k] ?? 0);
  for (const w of new Set([...Object.keys(a.found), ...Object.keys(b.found)])) {
    out.found[w] = Array.from(new Set([...(a.found[w] ?? []), ...(b.found[w] ?? [])])).slice(-MAX_FOUND_PER_WORLD);
  }
  out.recent = { ...b.recent, ...a.recent };
  return out;
}

/**
 * À la connexion : récupère la progression du compte, la fusionne avec la
 * copie de l'appareil (et avec une éventuelle progression jouée sans compte
 * avant que la connexion soit obligatoire), puis enregistre le résultat.
 */
export async function syncProgress(accountId: string): Promise<SoloProgress> {
  owner = accountId;
  let local = readLocal(keyFor(accountId)) ?? emptyProgress();
  const guest = readLocal(KEY);
  if (guest) {
    local = mergeProgress(local, guest);
    try {
      localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  }
  let server: SoloProgress | null = null;
  try {
    const res = await fetch("/api/solo/progress", { cache: "no-store" });
    if (res.ok) server = normalizeProgress(((await res.json()) as { progress?: unknown }).progress);
  } catch {
    // hors ligne : on garde la copie de l'appareil
  }
  const merged = server ? mergeProgress(server, local) : local;
  saveProgress(merged);
  return merged;
}

export function totalStars(p: SoloProgress, world?: WorldDef): number {
  const ids = world ? world.levels.map((l) => l.id) : Object.keys(p.stars);
  return ids.reduce((sum, id) => sum + (p.stars[id] ?? 0), 0);
}

/** Un niveau est ouvert si le précédent est réussi ; le 1er d'un monde, si le boss du monde d'avant est battu. */
export function isUnlocked(p: SoloProgress, level: LevelDef): boolean {
  const w = WORLDS.find((x) => x.id === level.worldId);
  if (!w || !w.playable) return false;
  if (level.index > 1) return (p.stars[`${w.id}-${level.index - 1}`] ?? 0) > 0;
  const prev = WORLDS.find((x) => x.number === w.number - 1);
  if (!prev) return true;
  const prevBoss = prev.levels[prev.levels.length - 1];
  return !!prevBoss && (p.stars[prevBoss.id] ?? 0) > 0;
}

export function isWorldUnlocked(p: SoloProgress, w: WorldDef): boolean {
  return w.playable && !!w.levels[0] && isUnlocked(p, w.levels[0]);
}

/** Niveau à jouer ensuite dans un monde (le premier sans étoile, sinon le dernier). */
export function currentLevel(p: SoloProgress, w: WorldDef): LevelDef | undefined {
  return w.levels.find((l) => isUnlocked(p, l) && !(p.stars[l.id] ?? 0)) ?? w.levels[w.levels.length - 1];
}

/**
 * Enregistre le résultat d'une tentative. Renvoie le bonus gagné, rare :
 * un seul, la PREMIÈRE fois qu'un niveau est réussi avec 3 étoiles ou
 * qu'un boss est battu. Rejouer ne rapporte rien de plus.
 */
export function recordResult(
  p: SoloProgress,
  level: LevelDef,
  result: { stars: 0 | 1 | 2 | 3; points: number; played: string[]; found: string[] }
): { progress: SoloProgress; gained: BoosterKey[] } {
  const before = p.stars[level.id] ?? 0;
  const earned = level.boss ? before === 0 && result.stars > 0 : before < 3 && result.stars === 3;
  const pool = BOOSTERS.filter((k) => p.boosters[k] < MAX_PER_BOOSTER);
  const gained: BoosterKey[] = earned && pool.length > 0 ? [pool[Math.floor(Math.random() * pool.length)]] : [];
  const boosters = { ...p.boosters };
  for (const g of gained) boosters[g] = Math.min(MAX_PER_BOOSTER, boosters[g] + 1);
  const found = Array.from(new Set([...(p.found[level.worldId] ?? []), ...result.found])).slice(-MAX_FOUND_PER_WORLD);
  return {
    gained,
    progress: {
      ...p,
      stars: { ...p.stars, [level.id]: Math.max(before, result.stars) as 0 | 1 | 2 | 3 },
      best: { ...p.best, [level.id]: Math.max(p.best[level.id] ?? 0, result.points) },
      boosters,
      found: { ...p.found, [level.worldId]: found },
      recent: { ...p.recent, [level.id]: result.played },
    },
  };
}

export function spendBooster(p: SoloProgress, key: BoosterKey): SoloProgress {
  return { ...p, boosters: { ...p.boosters, [key]: Math.max(0, p.boosters[key] - 1) } };
}
