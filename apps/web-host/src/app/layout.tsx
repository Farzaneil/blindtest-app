import "./globals.css";
import type { ReactNode } from "react";
import { Dela_Gothic_One, Rubik } from "next/font/google";
import { CookieConsentBanner } from "./_components/CookieConsentBanner";
import { THEME_INIT_SCRIPT } from "../lib/theme";

// Auto-hébergées par next/font (pas de <link> vers Google Fonts, pas de
// FOUC) : Rubik pour le texte courant, Dela Gothic One pour les titres, les
// scores et les gros boutons (direction "Arcade autocollants", voir
// tailwind.config.js — fontFamily.sans / fontFamily.display).
const rubik = Rubik({ subsets: ["latin"], weight: ["500", "700", "800"], variable: "--font-rubik" });
const dela = Dela_Gothic_One({ subsets: ["latin"], weight: "400", variable: "--font-dela" });

// Titre d'onglet par page (voir `metadata` / les layout.tsx de chaque
// route) : "Règles du jeu · Blindtest", etc.
export const metadata = {
  title: { default: "Blindtest", template: "%s · Blindtest" },
  description: "Le blind test entre potes : un écran hôte, les téléphones en buzzer.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning : data-fond est posé par le script ci-dessous
    // avant l'hydratation (fond mémorisé ou tiré au hasard), React ne doit
    // pas le signaler comme une différence serveur/client.
    <html lang="fr" className={`${rubik.variable} ${dela.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-page text-fg min-h-screen font-sans">
        {children}
        <CookieConsentBanner />
      </body>
    </html>
  );
}
