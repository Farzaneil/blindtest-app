import type { AnswerMode } from "./answers";

/**
 * Choix des playlists côté hôte (maquette « Choisir ses playlists ») :
 * - des THÈMES cliquables, qui lancent une recherche Deezer (beaucoup de
 *   playlists différentes d'une partie à l'autre) et proposent un « Mix
 *   surprise » ;
 * - des EXEMPLES, dix playlists choisies pour démarrer vite, avec le type de
 *   réponse déjà réglé (voir lib/answers.ts).
 * Exemples : officiels Deezer autant que possible ; « Génériques » et
 * « Musiques de films » viennent d'utilisateurs (choisies parce que leurs
 * morceaux donnent bien le nom de l'œuvre, voir guessWork) et peuvent
 * disparaître : l'import échoue alors avec un message, sans bloquer le reste.
 * Pour changer un exemple : remplacer l'identifiant (deezer.com/fr/playlist/<id>).
 */
export type ThemeChip = { label: string; query: string; answerMode: AnswerMode };

export const THEME_CHIPS: ThemeChip[] = [
  { label: "Années 80", query: "années 80", answerMode: "classic" },
  { label: "Années 90", query: "années 90", answerMode: "classic" },
  { label: "Années 2000", query: "années 2000", answerMode: "classic" },
  { label: "Années 2010", query: "années 2010", answerMode: "classic" },
  { label: "Rap français", query: "rap français", answerMode: "classic" },
  { label: "Variété française", query: "variété française", answerMode: "classic" },
  { label: "Rock", query: "rock", answerMode: "classic" },
  { label: "Pop", query: "pop hits", answerMode: "classic" },
  { label: "Hits du moment", query: "hits du moment", answerMode: "classic" },
  { label: "Disney", query: "disney", answerMode: "song_work" },
  { label: "Films", query: "musiques de films", answerMode: "work" },
  { label: "Génériques", query: "génériques dessins animés", answerMode: "work" },
];

export type ExamplePlaylist = { id: string; title: string; answerMode: AnswerMode };

export const EXAMPLES: ExamplePlaylist[] = [
  { id: "1913763402", title: "80s Party Hits", answerMode: "classic" },
  { id: "2322259622", title: "90s Party Hits", answerMode: "classic" },
  { id: "1977689462", title: "00s Party Hits", answerMode: "classic" },
  { id: "5175061384", title: "Rapstars : années 2010", answerMode: "classic" },
  { id: "1420459465", title: "Essentiels variété française", answerMode: "classic" },
  { id: "1306931615", title: "Rock Essentials", answerMode: "classic" },
  { id: "1109890291", title: "Top France", answerMode: "classic" },
  { id: "613860315", title: "Disney Les Classiques", answerMode: "song_work" },
  { id: "8531512122", title: "Musiques de films et dessins animés cultes", answerMode: "work" },
  { id: "9976576142", title: "Génériques dessins animés et séries 80-90", answerMode: "work" },
];

export const EXAMPLE_BY_ID: Record<string, ExamplePlaylist> = Object.fromEntries(EXAMPLES.map((t) => [t.id, t]));

/** Petit texte sous un exemple quand la réponse attendue n'est pas « titre + artiste ». */
export function answerModeHint(mode: AnswerMode): string | null {
  if (mode === "work") return "Réponse : le film ou la série";
  if (mode === "song_work") return "Réponse : la chanson et le film";
  return null;
}

/** Nombre de morceaux du Mix surprise : choisi librement par l'hôte. */
export const MIX_DEFAULT = 30;
export const MIX_MIN = 5;
export const MIX_MAX = 100;
/** Le Mix puise dans les N premières playlists du thème. */
export const MIX_PLAYLISTS = 5;
