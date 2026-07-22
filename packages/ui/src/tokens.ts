/**
 * Design tokens partagés entre l'écran hôte (Tailwind, apps/web-host) et
 * l'appli mobile (NativeWind, apps/mobile). Source de vérité unique pour la
 * DA "jeu télé / arcade néon" décrite dans le blueprint (section 6).
 *
 * Si tu changes une couleur ici, reporte-la aussi dans
 * apps/web-host/tailwind.config.js pour rester synchro.
 */
export const colors = {
  background: "#1A1A1A",
  accent: "#6C2BD9",   // violet néon — actions principales, buzz
  accent2: "#1DB954",  // vert Spotify — statut "en lecture"
  danger: "#E5484D",
  textPrimary: "#FFFFFF",
  textMuted: "#888888",
  teams: ["#6C2BD9", "#1DB954", "#F5A524", "#E5484D"], // couleurs par équipe
};

export const typography = {
  scoreDisplay: { fontSize: 48, fontWeight: "900" as const },   // écran hôte, lu à distance
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
