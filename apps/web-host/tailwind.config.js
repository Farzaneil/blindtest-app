/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Doit rester synchro avec packages/ui/src/tokens.ts
        // Dominante néon vert (accent), touches néon violet (accent2) — cf.
        // demande explicite de rééquilibrer la DA vers le vert Spotify.
        background: "#120E1A",
        backgroundVia: "#1A1330",
        surface: "#211A33",
        surfaceBorder: "#3A2E58",
        accent: "#1DB954",
        accentSoft: "#4ADE80",
        accent2: "#7C3AED",
        accent2Soft: "#A78BFA",
        danger: "#F43F5E",
        gold: "#F5A524",
        muted: "#9CA3AF",
        dark: "#1A1A1A", // conservé pour compat, non utilisé par les nouveaux écrans

        // ------------------------------------------------------------------
        // Nouvelle direction "minimal premium sombre" (voir la maquette
        // validée direction_visuelle_minimal_premium.html) : un fond quasi
        // noir sans dégradé, un seul accent (vert Spotify désaturé, jamais
        // en glow), or/argent/bronze réservés au podium. Volontairement
        // AJOUTÉE à côté des tokens ci-dessus plutôt qu'en remplacement :
        // seul /host migre vers ces tokens pour l'instant, les autres
        // écrans (/, /play, /rules, /about) gardent l'ancienne palette
        // jusqu'à leur passe de refonte à venir — pas de risque de casser
        // leur rendu en touchant ce fichier partagé.
        // Valeurs de contraste corrigees suite au retour "trop sombre, on
        // ne distingue rien" (validees dans direction_visuelle_minimal_premium.html
        // mais jamais reellement portees ici a l'epoque -- oubli corrige
        // maintenant) : ecart fond/carte nettement plus marque.
        ink: "#0A0A0C",
        inkSurface: "#1C1C23",
        inkSurface2: "#27272F",
        inkSurface3: "#303039",
        inkBorder: "#3A3A45",
        inkBorderStrong: "#4D4D5A",
        inkMuted: "#8B8B96",
        sage: "#3ECF7E",
        sageOn: "#06110A",
        goldOn: "#1A1508",
        silver: "#C7CBD1",
        silverOn: "#24262B",
        bronze: "#C97B4A",
        bronzeOn: "#2B1608",
        info: "#6E93D6",
        infoOn: "#0A1526",
        amber: "#D6A15A",
        amberOn: "#2B1B08",
      },
      boxShadow: {
        glowAccent: "0 0 32px rgba(29, 185, 84, 0.45)",
        glowAccent2: "0 0 32px rgba(124, 58, 237, 0.45)",
        glowDanger: "0 0 32px rgba(244, 63, 94, 0.45)",
        glowGold: "0 0 32px rgba(245, 165, 36, 0.45)",
      },
      backgroundImage: {
        // Ancien halo néon vert/violet — conservé tel quel pour les écrans
        // pas encore migrés vers la direction "minimal premium sombre".
        arcade:
          "radial-gradient(ellipse 65% 55% at 20% -10%, rgba(29, 185, 84, 0.32) 0%, transparent 60%), " +
          "radial-gradient(ellipse 45% 35% at 85% 105%, rgba(124, 58, 237, 0.22) 0%, transparent 60%), " +
          "#120E1A",
      },
      fontFamily: {
        // Chargées via @fontsource dans layout.tsx (fichiers de police
        // livrés avec le bundle npm, pas de fetch réseau au build — voir
        // le commentaire dans layout.tsx pour le contexte du changement).
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Space Grotesk"', "Inter", "sans-serif"],
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 24px rgba(29, 185, 84, 0.45)" },
          "50%": { boxShadow: "0 0 48px rgba(29, 185, 84, 0.75)" },
        },
      },
      animation: {
        pulseGlow: "pulseGlow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
