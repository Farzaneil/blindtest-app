import type { AnswerMode } from "./answers";

/**
 * Nos playlists proposées (« thèmes ») : playlists Deezer choisies pour le
 * blind test, avec le type de réponse déjà réglé (voir lib/answers.ts).
 * Officielles Deezer autant que possible ; « Génériques » et « Musiques de
 * films » viennent d'utilisateurs (choisies parce que leurs morceaux
 * donnent bien le nom de l'œuvre, voir guessWork) et peuvent disparaître :
 * l'import échoue alors avec un message, sans bloquer le reste.
 * Pour en changer une : remplacer l'identifiant (deezer.com/fr/playlist/<id>).
 */
export type Theme = { id: string; title: string; group: "Années" | "France" | "Styles" | "Ciné & TV"; answerMode: AnswerMode };

export const THEMES: Theme[] = [
  { id: "1913763402", title: "Années 80", group: "Années", answerMode: "classic" },
  { id: "2322259622", title: "Années 90", group: "Années", answerMode: "classic" },
  { id: "1977689462", title: "Années 2000", group: "Années", answerMode: "classic" },
  { id: "715215865", title: "Années 2010", group: "Années", answerMode: "classic" },
  { id: "791349661", title: "Années 80 en français", group: "France", answerMode: "classic" },
  { id: "1051470831", title: "Années 90 en français", group: "France", answerMode: "classic" },
  { id: "713806955", title: "Années 2000 en français", group: "France", answerMode: "classic" },
  { id: "1162725851", title: "Années 2010 en français", group: "France", answerMode: "classic" },
  { id: "1420459465", title: "Variété française", group: "France", answerMode: "classic" },
  { id: "4676814864", title: "Rap français années 2000", group: "France", answerMode: "classic" },
  { id: "5175061384", title: "Rap français années 2010", group: "France", answerMode: "classic" },
  { id: "1109890291", title: "Hits du moment", group: "Styles", answerMode: "classic" },
  { id: "1306931615", title: "Rock", group: "Styles", answerMode: "classic" },
  { id: "5506526242", title: "Tubes de l’été", group: "Styles", answerMode: "classic" },
  { id: "613860315", title: "Disney", group: "Ciné & TV", answerMode: "song_work" },
  { id: "8531512122", title: "Musiques de films et dessins animés", group: "Ciné & TV", answerMode: "work" },
  { id: "9976576142", title: "Génériques dessins animés et séries", group: "Ciné & TV", answerMode: "work" },
];

export const THEME_BY_ID: Record<string, Theme> = Object.fromEntries(THEMES.map((t) => [t.id, t]));

/** Petit texte sous un thème quand la réponse attendue n'est pas « titre + artiste ». */
export function answerModeHint(mode: AnswerMode): string | null {
  if (mode === "work") return "Réponse : le film ou la série";
  if (mode === "song_work") return "Réponse : la chanson et le film";
  return null;
}
