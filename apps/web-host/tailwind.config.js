/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Doit rester synchro avec packages/ui/src/tokens.ts
        accent: "#6C2BD9",
        accent2: "#1DB954",
        dark: "#1A1A1A",
      },
    },
  },
  plugins: [],
};
