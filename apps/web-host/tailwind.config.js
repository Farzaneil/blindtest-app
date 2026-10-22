/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Direction "minimal premium sombre" — seule palette du projet
        // (l'ancienne palette néon a été retirée lors de l'audit design
        // d'octobre 2026, plus aucun écran ne l'utilisait). Doit rester
        // synchro avec packages/ui/src/tokens.ts.
        // États : danger (mauvaise réponse, erreurs), gold (podium, MVP).
        danger: "#F43F5E",
        gold: "#F5A524",
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
        // Teal plutôt que bleu : l'ancien #6E93D6 était identique à la
        // couleur de l'équipe des Bleus (mode équipes), on ne distinguait
        // plus "info" d'"équipe".
        info: "#4FB6C2",
        infoOn: "#06181B",
        amber: "#D6A15A",
        amberOn: "#2B1B08",
        // Couleurs de marque des providers de connexion joueur (écran
        // /connexion) — Spotify utilise déjà "sage" pour son bouton actif ;
        // celles-ci ne servent qu'aux boutons désactivés "Bientôt".
        deezer: "#B34A9E",
        appleMusic: "#D6497A",
        ytMusic: "#C8503F",
      },
      fontFamily: {
        // var(--font-…) : noms générés par next/font (voir layout.tsx). Les
        // noms en dur "Inter"/"Space Grotesk" ne correspondaient à aucune
        // police chargée, le texte retombait sur la police système.
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-space-grotesk)", "var(--font-inter)", "sans-serif"],
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 24px rgba(62, 207, 126, 0.25)" },
          "50%": { boxShadow: "0 0 44px rgba(62, 207, 126, 0.45)" },
        },
      },
      animation: {
        pulseGlow: "pulseGlow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
