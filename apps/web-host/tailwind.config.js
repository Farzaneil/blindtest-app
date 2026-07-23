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
      },
      boxShadow: {
        glowAccent: "0 0 32px rgba(29, 185, 84, 0.45)",
        glowAccent2: "0 0 32px rgba(124, 58, 237, 0.45)",
        glowDanger: "0 0 32px rgba(244, 63, 94, 0.45)",
        glowGold: "0 0 32px rgba(245, 165, 36, 0.45)",
      },
      backgroundImage: {
        // Halo vert large et marqué (dominante), touche violette plus petite
        // et plus discrète en complément.
        arcade:
          "radial-gradient(ellipse 65% 55% at 20% -10%, rgba(29, 185, 84, 0.32) 0%, transparent 60%), " +
          "radial-gradient(ellipse 45% 35% at 85% 105%, rgba(124, 58, 237, 0.22) 0%, transparent 60%), " +
          "#120E1A",
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
