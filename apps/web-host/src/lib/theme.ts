/**
 * Thème de fond de l'app (refonte "Arcade autocollants") : jaune, bleu ciel
 * ou lilas. Règle choisie :
 * - première visite sur un appareil : fond tiré au hasard ;
 * - il est ensuite mémorisé (localStorage) et ne change plus, y compris au
 *   rechargement de la page ;
 * - l'utilisateur peut le changer à tout moment (voir ThemePicker, sur
 *   l'accueil et le profil).
 * Le fond choisi est posé sur <html data-fond="…"> ; les couleurs
 * correspondantes sont définies dans globals.css.
 */

export const THEME_STORAGE_KEY = "blindtest_fond";

export const THEMES = [
  { id: "jaune", label: "Jaune", color: "#FFE14D" },
  { id: "ciel", label: "Bleu ciel", color: "#A8DCFF" },
  { id: "lilas", label: "Lilas", color: "#C9B6FF" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

/**
 * Script exécuté dans <head> AVANT le premier rendu (voir layout.tsx), pour
 * que la page s'affiche directement dans le bon fond, sans flash du fond
 * par défaut. Volontairement autonome (pas d'import possible ici).
 */
export const THEME_INIT_SCRIPT = `(function(){var k=${JSON.stringify(THEME_STORAGE_KEY)},o=${JSON.stringify(
  THEMES.map((t) => t.id)
)},v=null;try{v=localStorage.getItem(k);}catch(e){}if(o.indexOf(v)<0){v=o[Math.floor(Math.random()*o.length)];try{localStorage.setItem(k,v);}catch(e){}}document.documentElement.setAttribute("data-fond",v);})();`;

export function readCurrentTheme(): ThemeId {
  if (typeof document === "undefined") return "jaune";
  const v = document.documentElement.getAttribute("data-fond");
  return isThemeId(v) ? v : "jaune";
}

export function applyTheme(id: ThemeId) {
  document.documentElement.setAttribute("data-fond", id);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // Stockage indisponible (navigation privée stricte) : le fond change
    // quand même pour cette page, il ne sera juste pas mémorisé.
  }
}
