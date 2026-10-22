import "./globals.css";
import type { ReactNode } from "react";
import { Inter, Space_Grotesk } from "next/font/google";
import { CookieConsentBanner } from "./_components/CookieConsentBanner";

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

// Titre d'onglet par page (voir `metadata` / les layout.tsx de chaque
// route) : "Règles du jeu · Blindtest", etc.
export const metadata = {
  title: { default: "Blindtest", template: "%s · Blindtest" },
  description: "Le blind test entre potes : un écran hôte, les téléphones en buzzer.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="bg-ink text-white min-h-screen font-sans">
        {children}
        <CookieConsentBanner />
      </body>
    </html>
  );
}
