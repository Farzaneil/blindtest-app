import "./globals.css";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { CookieConsentBanner } from "./_components/CookieConsentBanner";
import { ConfirmDialogHost } from "./_components/ConfirmDialog";
import { THEME_INIT_SCRIPT } from "../lib/theme";

// Polices incluses dans le dépôt (src/app/_fonts, sous-ensemble latin, qui
// couvre le français) et servies par next/font/local : le build ne dépend
// plus de Google Fonts (next/font/google faisait échouer des builds Vercel
// au hasard : "Can't resolve '@vercel/turbopack-next/internal/font/google/font'").
// Rubik (police variable 300-900) pour le texte courant, Dela Gothic One pour
// les titres, les scores et les gros boutons (direction "Arcade
// autocollants", voir tailwind.config.js — fontFamily.sans / fontFamily.display).
// Licence : SIL Open Font License 1.1 (redistribution autorisée).
const rubik = localFont({
  src: "./_fonts/rubik-latin.woff2",
  weight: "300 900",
  display: "swap",
  variable: "--font-rubik",
});
const dela = localFont({
  src: "./_fonts/dela-gothic-one-latin.woff2",
  weight: "400",
  display: "swap",
  variable: "--font-dela",
});

// Titre d'onglet par page (voir `metadata` / les layout.tsx de chaque
// route) : "Règles du jeu · Kazou Band", etc. Icônes : app/icon.svg et
// app/apple-icon.tsx ; aperçu de lien : app/opengraph-image.tsx.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kazouband.fr";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Kazou Band · le blind test entre potes", template: "%s · Kazou Band" },
  description: "Le blind test entre potes : un écran pour la musique, vos téléphones en buzzer. Rien à installer.",
  applicationName: "Kazou Band",
  openGraph: {
    title: "Kazou Band · le blind test entre potes",
    description: "Un écran pour la musique, vos téléphones en buzzer. Rien à installer.",
    siteName: "Kazou Band",
    locale: "fr_FR",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
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
        <ConfirmDialogHost />
      </body>
    </html>
  );
}
