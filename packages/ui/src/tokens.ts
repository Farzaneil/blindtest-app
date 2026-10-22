/**
 * Design tokens partagés entre l'écran hôte (Tailwind, apps/web-host) et
 * l'appli mobile (NativeWind, apps/mobile). Reflète la direction "minimal premium
 * sombre" actuelle de l'écran web.
 *
 * Si tu changes une couleur ici, reporte-la aussi dans
 * apps/web-host/tailwind.config.js pour rester synchro.
 */
export const colors = {
  // Direction "minimal premium sombre" (miroir de apps/web-host/tailwind.config.js).
  ink: "#0A0A0C", // fond de l'app
  inkSurface: "#1C1C23", // cartes
  inkSurface2: "#27272F",
  inkSurface3: "#303039",
  inkBorder: "#3A3A45",
  inkBorderStrong: "#4D4D5A",
  inkMuted: "#8B8B96", // texte secondaire
  silver: "#C7CBD1", // texte courant atténué, argent du podium
  sage: "#3ECF7E", // accent principal (actions, buzz, bonne réponse)
  info: "#4FB6C2",
  amber: "#D6A15A", // joker, séries
  danger: "#F43F5E", // mauvaise réponse, erreurs
  gold: "#F5A524", // podium, MVP
  bronze: "#C97B4A",
  textPrimary: "#FFFFFF",
  // Couleurs d'équipe (mode équipes, voir supabase/migrations/0027) :
  // volontairement distinctes des couleurs d'état ci-dessus.
  teams: ["#6E93D6", "#F0874A", "#A78BFA", "#E879A6"],
};

export const typography = {
  scoreDisplay: { fontSize: 48, fontWeight: "900" as const }, // écran hôte, lu à distance
  heading: { fontSize: 24, fontWeight: "800" as const },
  body: { fontSize: 16, fontWeight: "400" as const },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
};

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  full: 9999,
};
