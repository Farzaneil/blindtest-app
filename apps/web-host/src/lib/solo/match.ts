/**
 * Correction automatique des réponses tapées du mode solo (pas d'hôte pour
 * juger). Tolérante sans être laxiste :
 * - accents, majuscules, ponctuation, « the »/« le »/« la »… en tête ignorés ;
 * - mentions parasites des titres Deezer retirées : (feat. …), - Remastered,
 *   (Radio Edit), (From "…")… ;
 * - petites fautes de frappe acceptées (distance d'édition ≤ ~20 % du mot,
 *   aucune pour les réponses très courtes) ;
 * - artiste : l'un des artistes du morceau suffit (« Orelsan, Stromae »),
 *   et « Céline Dion » est accepté pour « Céline Dion & Garou ».
 */

const LEADING_ARTICLES = /^(the|le|la|les|l|a|an|un|une|des)\s+/;

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/['’`]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(LEADING_ARTICLES, "")
    .trim();
}

/** Titre Deezer sans les mentions qui n'en font pas partie. */
export function cleanTitle(title: string): string {
  let s = title;
  for (let i = 0; i < 3; i++) s = s.replace(/\s*[([][^()[\]]*[)\]]/g, "");
  s = s.replace(/\s+[-–]\s+.*\b(remaster(ed)?|version|edit|mix|live|remix|radio|mono|stereo|single|bonus|instrumental|acoustic|acoustique|from|soundtrack|bande originale|b\.?o\.?|extrait|theme|générique)\b.*$/i, "");
  s = s.replace(/\s+(feat|ft|featuring)\.?\s+.*$/i, "");
  return s.trim() || title.trim();
}

/**
 * Distance d'édition avec inversion de deux lettres voisines comptée comme
 * UNE faute (« Nadyia » pour « Nadiya ») : distance de Damerau (OSA).
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Fautes tolérées selon la longueur de la réponse attendue. */
function allowedTypos(len: number): number {
  if (len <= 5) return 0;
  if (len <= 8) return 1;
  if (len <= 14) return 2;
  return Math.floor(len * 0.2);
}

function close(typed: string, expected: string): boolean {
  if (!typed || !expected) return false;
  if (typed === expected) return true;
  return levenshtein(typed, expected) <= allowedTypos(expected.length);
}

/** Le titre tapé correspond-il au titre du morceau ? */
export function titleMatches(typed: string, title: string): boolean {
  const t = normalize(typed);
  if (!t) return false;
  // « Lose Yourself - From "8 Mile" » : la partie avant le tiret suffit aussi.
  const beforeDash = title.split(/\s+[-–]\s+/)[0];
  const candidates = new Set([normalize(title), normalize(cleanTitle(title)), normalize(cleanTitle(beforeDash))]);
  for (const c of candidates) if (close(t, c)) return true;
  return false;
}

/** Les artistes d'un morceau, un par un (« A, B », « A & B », « A feat. B »). */
export function splitArtists(artist: string): string[] {
  const parts = artist
    .split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bfeaturing|\bet\b|\bx\b|\/|\+)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  return Array.from(new Set([artist.trim(), ...parts]));
}

/** L'artiste tapé correspond-il à l'un des artistes du morceau ? */
export function artistMatches(typed: string, artist: string): boolean {
  const t = normalize(typed);
  if (!t) return false;
  const typedParts = splitArtists(typed).map(normalize).filter(Boolean);
  for (const a of splitArtists(artist).map(normalize)) {
    if (close(t, a)) return true;
    // Nom de famille seul : « Balavoine » pour « Daniel Balavoine ».
    const words = a.split(" ");
    if (words.length >= 2) {
      for (const last of [words.slice(1).join(" "), words[words.length - 1]]) {
        if (last.length >= 4 && close(t, last)) return true;
      }
    }
    // « Céline Dion & Garou » tapé en entier pour « Céline Dion » : chaque
    // artiste tapé doit être un vrai artiste du morceau.
    if (typedParts.length > 1 && typedParts.every((p) => splitArtists(artist).map(normalize).some((x) => close(p, x)))) {
      return true;
    }
  }
  return false;
}
