/**
 * Ce qu'il faut trouver dans une manche (migration 0038, rounds.answer_mode) :
 * - "classic" : titre + artiste (1 point chacun) ;
 * - "work" : une seule réponse, le film / la série / le dessin animé (2 points
 *   d'un coup : l'hôte la valide d'un bouton qui coche titre ET artiste) ;
 * - "song_work" : chanson + film (Disney), 1 point chacun ; côté serveur,
 *   « titre trouvé » = la chanson, « artiste trouvé » = le film.
 * Le calcul des points ne change pas : seuls les libellés et la réponse
 * affichée dépendent du mode.
 */
export type AnswerMode = "classic" | "work" | "song_work";

type RoundLike = { title: string; artist: string; answer_mode?: AnswerMode | null; work?: string | null };

const modeOf = (r: RoundLike): AnswerMode => r.answer_mode ?? "classic";

/** Libellés des deux éléments à trouver (second = null : réponse unique). */
export function answerLabels(r: RoundLike): { first: string; second: string | null } {
  const mode = modeOf(r);
  if (mode === "work") return { first: "Film / série", second: null };
  if (mode === "song_work") return { first: "Chanson", second: "Film" };
  return { first: "Titre", second: "Artiste" };
}

/** Bonne réponse à afficher : « Titre — Artiste », « Chanson — Film » ou l'œuvre seule. */
export function answerText(r: RoundLike): string {
  const mode = modeOf(r);
  const work = r.work?.trim() || null;
  if (mode === "work") return work ?? r.title;
  if (mode === "song_work") return `${r.title} — ${work ?? r.artist}`;
  return `${r.title} — ${r.artist}`;
}

/** Élément 1 / élément 2 tels qu'affichés (« Titre trouvé : … »). */
export function answerParts(r: RoundLike): { first: string; second: string } {
  const mode = modeOf(r);
  const work = r.work?.trim() || null;
  if (mode === "work") return { first: work ?? r.title, second: work ?? r.title };
  if (mode === "song_work") return { first: r.title, second: work ?? r.artist };
  return { first: r.title, second: r.artist };
}

/** Morceau original, rappelé à l'hôte quand la réponse attendue est l'œuvre. */
export function originalTrackText(r: RoundLike): string | null {
  return modeOf(r) === "work" ? `${r.title} — ${r.artist}` : null;
}

/**
 * Nom d'œuvre tiré d'un titre d'album Deezer :
 * « La Reine des Neiges (Bande Originale Française du Film) » → « La Reine des Neiges »,
 * « Goldorak : La légende d'Actarus (Générique original…) - Single » → « Goldorak : La légende d'Actarus ».
 */
export function cleanWorkName(album: string | null | undefined): string | null {
  if (!album) return null;
  let s = album;
  for (let i = 0; i < 3; i++) s = s.replace(/\s*[([][^()[\]]*[)\]]/g, "");
  s = s
    .replace(/\s+-\s+(single|ep)$/i, "")
    .replace(/\s*[-–:]?\s*\b(original )?(motion picture )?(soundtrack|bande originale|music from)\b.*$/i, "")
    .replace(/\s*[-–:,]\s*$/, "")
    .trim();
  return s || album.trim();
}

const SOUNDTRACK_ALBUM = /soundtrack|motion picture|bande originale du film|original score|music from (the|and)|movie|du film/i;
// Albums de compilation (« Les Meilleures Musiques De Dessins Animés Vol. 1 ») :
// leur nom ne dit rien de l'œuvre, on se rabat alors sur le titre du morceau.
const COMPILATION_ALBUM = /best|meilleur|hits?\b|vol\.|volume|compil|collection|génériques|generiques|musiques de|thèmes|themes|classics|greatest|cultes|enfants|génération|generation|\b\d{2,3}\b/i;

/**
 * Œuvre (film, série, dessin animé) d'un morceau, pour les réponses
 * « Film / série ». Dans l'ordre :
 * 1. mention explicite dans le titre : Stayin' Alive (From "Saturday Night Fever") ;
 * 2. album de bande originale (pas une compilation) : Pulp Fiction (Music From The Motion Picture) ;
 * 3. sinon le titre du morceau nettoyé : « Dragon Ball (Générique) » → « Dragon Ball ».
 */
export function guessWork(title: string, album: string | null | undefined): string {
  const quoted = title.match(/(?:from|de|du film|extrait du dessin animé|extrait de)\s*(?:the\s+)?["“'‘]([^"”'’]+)["”'’]/i);
  if (quoted) return quoted[1].trim();
  if (album && SOUNDTRACK_ALBUM.test(album) && !COMPILATION_ALBUM.test(album)) {
    const a = cleanWorkName(album);
    if (a) return a;
  }
  const t = (cleanWorkName(title) ?? title).replace(/\s*[-–:]?\s*(main title( theme)?|main theme|theme|thème)$/i, "").trim();
  return t || title;
}

/** Titre de chanson sans les mentions « (De "…"/Bande Originale…) » ou « (From …) ». */
export function cleanSongTitle(title: string): string {
  const s = title.replace(/\s*\((de|from|du film|tiré de)\b[^)]*\)/gi, "").trim();
  return s || title;
}
