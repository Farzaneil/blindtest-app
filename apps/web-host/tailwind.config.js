/** @type {import('tailwindcss').Config} */

// Couleur pilotée par une variable CSS (canaux RGB, voir globals.css) :
// permet les modificateurs d'opacité Tailwind (bg-sage/90, bg-info/10...).
const themeVar = (name) => `rgb(var(${name}) / <alpha-value>)`;

module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ------------------------------------------------------------------
        // Direction "Arcade autocollants" (refonte d'octobre 2026, voir le
        // canevas "Blindtest — Refonte Arcade") : fonds pastel, contours et
        // ombres noirs pleins, stickers légèrement de travers.
        //
        // Trio de fonds jaune / bleu ciel / lilas : l'un sert de fond de
        // page, les deux autres colorent les boutons et les stickers
        // (voir les variables --bg / --c1 / --c2 dans globals.css et le
        // choix du fond dans _components/ThemePicker.tsx).
        //
        // Les noms historiques (ink*, sage, info...) sont conservés pour ne
        // pas réécrire chaque écran : seule leur valeur change.
        // ------------------------------------------------------------------
        page: themeVar("--bg"), // fond de page (thème choisi)
        sage: themeVar("--c1"), // actions principales (boutons, buzzer)
        sageOn: "#111111",
        info: themeVar("--c2"), // décor, actions secondaires
        infoOn: "#111111",
        fg: "#111111", // texte, contours, ombres
        ink: "#111111", // texte sur couleur (historique : text-ink)
        inkSurface: "#FFFFFF", // cartes
        inkSurface2: "#F4F4F4", // lignes / champs dans une carte
        inkSurface3: "#E9E9E9",
        inkBorder: "#111111",
        inkBorderStrong: "#111111",
        inkMuted: "#4D4D4D", // texte secondaire (contraste OK sur les 3 fonds)
        // Logo uniquement ("BLIND") : jamais sur les boutons.
        logo: "#FF6FB5",
        // États : bonne / mauvaise réponse.
        good: "#39D98A",
        danger: "#D7263D",
        // Podium / MVP.
        gold: "#F5A524",
        goldOn: "#111111",
        silver: "#D6D9DE",
        silverOn: "#111111",
        bronze: "#E7B48F",
        bronzeOn: "#111111",
        // Joker, séries : fond orange vif, texte orangé foncé lisible.
        amber: "#FF9A3C",
        amberOn: "#111111",
        amberStrong: "#9A4A00",
        // Couleurs de marque des providers de connexion joueur (boutons
        // désactivés "Bientôt" de /connexion).
        deezer: "#B34A9E",
        appleMusic: "#D6497A",
        ytMusic: "#C8503F",
      },
      borderWidth: {
        // Contour "autocollant" : la classe `border` seule vaut 2px.
        DEFAULT: "2px",
      },
      boxShadow: {
        // Ombres décalées sans flou (style autocollant).
        sticker: "5px 5px 0 #111111",
        "sticker-sm": "3px 3px 0 #111111",
        "sticker-lg": "8px 8px 0 #111111",
      },
      fontFamily: {
        // var(--font-…) : noms générés par next/font (voir layout.tsx).
        sans: ["var(--font-rubik)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-dela)", "var(--font-rubik)", "sans-serif"],
      },
      keyframes: {
        // Manche en cours : l'ombre du sticker "respire".
        pulseGlow: {
          "0%, 100%": { boxShadow: "5px 5px 0 #111111" },
          "50%": { boxShadow: "9px 9px 0 #111111" },
        },
      },
      animation: {
        pulseGlow: "pulseGlow 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
