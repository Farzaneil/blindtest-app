/**
 * Mode solo « La Tournée du Kazou Band » : la carrière du groupe, du garage
 * au stade. Chaque monde est un lieu avec sa mécanique ; ses niveaux tirent
 * leurs morceaux dans la RÉSERVE du monde (voir app/api/solo/pool), jamais
 * une liste figée : rejouer un niveau donne d'autres morceaux, ce qui rend
 * les étoiles honnêtes (impossible d'apprendre les réponses par cœur).
 *
 * Réserve d'un monde = les morceaux jouables de ses playlists Deezer
 * (`playlistIds`, voir GARAGE_POOL / FETE_POOL / PARTY_POOL). `searchQuery` ne sert
 * que de dépannage pour un monde sans playlist.
 * Difficulté d'un morceau = sa popularité Deezer (`rank`), découpée en
 * trois tranches dans la réserve : 1 = très connu, 2 = connu, 3 = pointu.
 */

export type Tier = 1 | 2 | 3;

/** Ce qu'on entend : l'extrait entier, une intro courte, ou un passage pris au milieu. */
export type Clip = { start: "intro" | "middle"; seconds: number };

export type AnswerType = "choice" | "typed";

/**
 * Fausses propositions des niveaux à choix :
 * - "easy" : au hasard dans la réserve (tutoriel du Garage) ;
 * - "close" : morceaux qui se ressemblent (même playlist, même langue,
 *   popularité proche) ;
 * - "hard" : comme "close", avec d'autres titres du MÊME artiste quand la
 *   réserve en contient (il faut vraiment reconnaître le morceau).
 */
export type Decoys = "easy" | "close" | "hard";

export type LevelDef = {
  id: string; // "boum-3"
  worldId: string;
  index: number; // 1..n (le boss a l'index n+1)
  name: string; // nom court affiché sur la carte et en haut du niveau
  answer: AnswerType;
  decoys?: Decoys;
  tracks: number;
  tiers: Tier[]; // tranches de difficulté autorisées
  clip: Clip;
  answerSeconds: number; // temps pour répondre, extrait compris
  boss?: BossDef;
};

export type BossDef = {
  name: string; // « Le Videur »
  art: "voisin" | "sono" | "videur"; // dessin (app/solo/_components/BossSprite.tsx)
  badge: string; // texte du brassard
  color: string; // couleur du corps de l'enceinte
  accent: string;
  taunts: string[]; // répliques
  // Phase 2 (boss sous 50 % de vie) : extrait et temps de réponse raccourcis.
  phase2Clip: Clip;
  phase2AnswerSeconds: number;
};

export type WorldDef = {
  id: string;
  number: number;
  name: string;
  tagline: string;
  color: string; // fond de la carte
  playable: boolean;
  playlistIds: string[];
  searchQuery: string;
  levels: LevelDef[]; // boss compris (dernier)
};

const full = (seconds = 15): Clip => ({ start: "intro", seconds });
const intro = (seconds: number): Clip => ({ start: "intro", seconds });
const middle = (seconds: number): Clip => ({ start: "middle", seconds });

function world(
  w: Omit<WorldDef, "levels">,
  levels: Omit<LevelDef, "id" | "worldId" | "index">[]
): WorldDef {
  return {
    ...w,
    levels: levels.map((l, i) => ({ ...l, id: `${w.id}-${i + 1}`, worldId: w.id, index: i + 1 })),
  };
}

/**
 * Réserves des mondes : les playlists d'exemple du mode multijoueur (voir
 * lib/themes.ts), déjà choisies et validées. Les mondes se distinguent par
 * leur DIFFICULTÉ (tranches de popularité, durée d'écoute, type de réponse)
 * plutôt que par leurs morceaux.
 */
// Le Garage : 80s, 90s et 00s Party Hits, Essentiels variété française, Rock Essentials.
const GARAGE_POOL = ["1913763402", "2322259622", "1977689462", "1420459465", "1306931615"];
// La Fête de la musique : la même chose + Rapstars 2010 (le rap reste une part
// parmi six, voir le tirage équilibré par playlist dans engine.drawTracks).
const FETE_POOL = [...GARAGE_POOL, "5175061384"];
// Les tubes de soirée : 80s, 90s et 00s Party Hits.
const PARTY_POOL = ["1913763402", "2322259622", "1977689462"];

export const WORLDS: WorldDef[] = [
  world(
    {
      id: "garage",
      number: 1,
      name: "Le Garage",
      tagline: "Les premières répètes : que des tubes ultra-connus, avec des réponses au choix.",
      color: "#FFE14D",
      playable: true,
      playlistIds: GARAGE_POOL,
      searchQuery: "",
    },
    [
      { name: "Première répète", answer: "choice", tracks: 5, tiers: [1], clip: full(15), answerSeconds: 20 },
      { name: "Les classiques", answer: "choice", tracks: 6, tiers: [1], clip: full(12), answerSeconds: 18 },
      { name: "On monte le son", answer: "choice", decoys: "close", tracks: 7, tiers: [1, 2], clip: full(12), answerSeconds: 16 },
      { name: "Sans les mains", answer: "choice", decoys: "close", tracks: 8, tiers: [1, 2], clip: full(10), answerSeconds: 14 },
      { name: "Bœuf entre potes", answer: "choice", decoys: "hard", tracks: 8, tiers: [1, 2], clip: full(10), answerSeconds: 12 },
      { name: "La démo", answer: "typed", tracks: 5, tiers: [1], clip: full(15), answerSeconds: 30 },
      {
        name: "Le Voisin",
        answer: "typed",
        tracks: 10,
        tiers: [1, 2],
        clip: full(10),
        answerSeconds: 25,
        boss: {
          name: "Le Voisin",
          art: "voisin",
          badge: "CHUT !",
          color: "#E9DCC4",
          accent: "#A8DCFF",
          taunts: ["« Baissez le son ! »", "« Il est 22 h ! »", "« J'appelle le syndic ! »"],
          phase2Clip: full(6),
          phase2AnswerSeconds: 20,
        },
      },
    ]
  ),
  world(
    {
      id: "fete",
      number: 2,
      name: "La Fête de la musique",
      tagline: "Tous les styles, des tubes un peu moins évidents, et tu commences à taper tes réponses.",
      color: "#A8DCFF",
      playable: true,
      playlistIds: FETE_POOL,
      searchQuery: "",
    },
    [
      { name: "Premier trottoir", answer: "choice", decoys: "hard", tracks: 6, tiers: [1, 2], clip: full(10), answerSeconds: 14 },
      { name: "Changement de scène", answer: "choice", decoys: "hard", tracks: 8, tiers: [1, 2], clip: full(8), answerSeconds: 12 },
      { name: "À vos claviers", answer: "typed", tracks: 5, tiers: [1], clip: full(12), answerSeconds: 30 },
      { name: "La place du village", answer: "typed", tracks: 6, tiers: [1, 2], clip: full(10), answerSeconds: 28 },
      { name: "Le kiosque", answer: "typed", tracks: 8, tiers: [1, 2], clip: full(10), answerSeconds: 25 },
      { name: "Jusqu'au bout de la nuit", answer: "typed", tracks: 9, tiers: [2], clip: full(10), answerSeconds: 25 },
      {
        name: "La Sono",
        answer: "typed",
        tracks: 10,
        tiers: [1, 2, 3],
        clip: full(8),
        answerSeconds: 25,
        boss: {
          name: "La Sono",
          art: "sono",
          badge: "SONO",
          color: "#FF6FB5",
          accent: "#FFE14D",
          taunts: ["« Larsen ! »", "« Un, deux, un, deux… »", "« Plus fort ! »"],
          phase2Clip: full(5),
          phase2AnswerSeconds: 20,
        },
      },
    ]
  ),
  world(
    {
      id: "boum",
      number: 3,
      name: "La Boum",
      tagline: "Les tubes de soirée des années 80 à 2000, avec des intros de plus en plus courtes.",
      color: "#C9B6FF",
      playable: true,
      playlistIds: PARTY_POOL,
      searchQuery: "",
    },
    [
      { name: "Intro 5 s", answer: "typed", tracks: 6, tiers: [1], clip: intro(5), answerSeconds: 25 },
      { name: "Le premier slow", answer: "typed", tracks: 7, tiers: [1, 2], clip: intro(5), answerSeconds: 25 },
      { name: "Intro express", answer: "typed", tracks: 8, tiers: [1, 2], clip: intro(3), answerSeconds: 22 },
      { name: "Lumières tamisées", answer: "typed", tracks: 9, tiers: [1, 2], clip: intro(3), answerSeconds: 20 },
      { name: "Boule à facettes", answer: "typed", tracks: 10, tiers: [2], clip: intro(2), answerSeconds: 20 },
      { name: "Dernière danse", answer: "typed", tracks: 10, tiers: [2, 3], clip: intro(2), answerSeconds: 20 },
      {
        name: "Le Videur",
        answer: "typed",
        tracks: 12,
        tiers: [2, 3],
        clip: intro(3),
        answerSeconds: 20,
        boss: {
          name: "Le Videur",
          art: "videur",
          badge: "STAFF",
          color: "#2B2B33",
          accent: "#FF6FB5",
          taunts: ["« Pas de baskets ! »", "« T'es pas sur la liste. »", "« Circulez ! »"],
          phase2Clip: intro(1),
          phase2AnswerSeconds: 16,
        },
      },
    ]
  ),
  ...[
    ["camping", "Le Camping", "Le chrono se resserre : réponds vite, très vite.", "#FF6FB5"],
    ["samedi", "Le Samedi matin", "Génériques de dessins animés et de séries : trouve leur nom.", "#FFE14D"],
    ["cine", "Le Ciné-club", "Musiques de films et Disney : trouve le film.", "#A8DCFF"],
    ["radio", "La Radio", "Des morceaux moins connus, et l'année en bonus.", "#C9B6FF"],
    ["mariage", "Le Mariage", "Deux secondes d'écoute, tous les styles mélangés.", "#FF6FB5"],
    ["disco", "La Discothèque", "L'extrait démarre au milieu du morceau.", "#FFE14D"],
    ["coulisses", "Les Coulisses", "Duos et featurings : tous les artistes comptent.", "#A8DCFF"],
    ["studio", "Le Studio", "Que des morceaux pointus, pour les vrais connaisseurs.", "#C9B6FF"],
    ["monde", "La Tournée mondiale", "Des tubes venus du monde entier.", "#FF6FB5"],
    ["festival", "Le Festival", "Le son grésille comme un vieux poste de radio.", "#FFE14D"],
    ["stade", "Le Stade", "Le grand final : tout ce que tu as appris sur la tournée.", "#A8DCFF"],
  ].map(([id, name, tagline, color], i) =>
    world({ id, number: i + 4, name, tagline, color, playable: false, playlistIds: [], searchQuery: "" }, [])
  ),
];

/** Mécanique « au milieu » utilisée plus tard par la Discothèque. */
export const CLIPS = { full, intro, middle };

export function getWorld(id: string): WorldDef | undefined {
  return WORLDS.find((w) => w.id === id);
}

export function getLevel(worldId: string, index: number): LevelDef | undefined {
  return getWorld(worldId)?.levels.find((l) => l.index === index);
}

export type Difficulty = 1 | 2 | 3;
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { 1: "Facile", 2: "Moyen", 3: "Difficile" };

/**
 * Difficulté affichée d'un niveau, calculée d'après ses règles : réponse à
 * taper, morceaux moins connus, extrait court, propositions piégeuses,
 * nombre de morceaux, boss.
 */
export function levelDifficulty(l: LevelDef): Difficulty {
  let score = 0;
  if (l.answer === "typed") score += 1.5;
  score += (Math.max(...l.tiers) - 1) * 0.9;
  if (l.clip.seconds <= 3) score += 1.2;
  else if (l.clip.seconds <= 5) score += 0.6;
  if (l.decoys === "close") score += 0.4;
  if (l.decoys === "hard") score += 0.8;
  if (l.tracks >= 9) score += 0.4;
  if (l.boss) score += 1;
  return score < 1.5 ? 1 : score < 3.2 ? 2 : 3;
}

/** Ce qu'on fait dans un niveau, en une ligne (carte et écran du niveau). */
export function describeLevel(l: LevelDef): string {
  const answer = l.answer === "choice" ? "4 réponses au choix" : "Titre + artiste à taper";
  return `${answer} · ${clipLabel(l.clip)} · ${l.tracks} morceaux`;
}

/** Libellé de la mécanique, affiché sous le nom du niveau. */
export function clipLabel(c: Clip): string {
  if (c.start === "middle") return `Extrait au milieu · ${c.seconds} s`;
  return c.seconds >= 10 ? `Extrait de ${c.seconds} s` : `Intro ${c.seconds} s`;
}
