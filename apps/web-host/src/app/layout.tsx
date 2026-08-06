import "./globals.css";
import type { ReactNode } from "react";
import { Inter, Space_Grotesk } from "next/font/google";

// Auto-hébergées par next/font (pas de <link> vers Google Fonts, pas de
// FOUC) : Inter pour le texte courant, Space Grotesk pour les titres/scores
// sur les écrans migrés vers la nouvelle direction "minimal premium sombre"
// (voir tailwind.config.js — fontFamily.sans / fontFamily.display).
// Appliquées globalement dès maintenant : c'est un changement de police
// sûr même sur les écrans pas encore repensés (/, /play, /rules, /about),
// contrairement aux couleurs qui restent, elles, propres à /host pour
// l'instant.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-space-grotesk",
});

export const metadata = {
  title: "Blindtest — Écran hôte",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="bg-dark text-white min-h-screen font-sans">{children}</body>
    </html>
  );
}
