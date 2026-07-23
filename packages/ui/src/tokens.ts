/**
 * Design tokens partagés entre l'écran hôte (Tailwind, apps/web-host) et
 * l'appli mobile (NativeWind, apps/mobile). Source de vérité unique pour la
 * DA "jeu télé / arcade néon" décrite dans le blueprint (section 6).
 *
 * Si tu changes une couleur ici, reporte-la aussi dans
 * apps/web-host/tailwind.config.js pour rester synchro.
 */
export const colors = {
  background: "#120E1A", // fond très sombre, légèrement teinté violet
  backgroundVia: "#1A1330", // point médian du dégradé de fond (voir globals.css)
  surface: "#211A33", // fond des cartes/panneaux
  surfaceBorder: "#3A2E58", // bordure des cartes
  accent: "#1DB954", // vert néon Spotify — dominante, actions principales, buzz
  accentSoft: "#4ADE80", // variante plus claire (survol, texte accentué)
  accent2: "#7C3AED", // violet — touche secondaire, statut "en lecture"
  accent2Soft: "#A78BFA",
  danger: "#F43F5E", // mauvaise réponse, erreurs
  gold: "#F5A524", // médaille du classement, mise en avant ponctuelle
  textPrimary: "#FFFFFF",
  textMuted: "#9CA3AF",
  teams: ["#7C3AED", "#1DB954", "#F5A524", "#F43F5E"], // couleurs par équipe
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

/**
 * Halos lumineux ("glow") utilisés sur les actions principales pour
 * renforcer l'ambiance arcade — appliqués via box-shadow côté web
 * (voir apps/web-host/tailwind.config.js), et via shadow color côté mobile.
 */
export const glow = {
  accent: "rgba(29, 185, 84, 0.45)",
  accent2: "rgba(124, 58, 237, 0.45)",
  danger: "rgba(244, 63, 94, 0.45)",
  gold: "rgba(245, 165, 36, 0.45)",
};
