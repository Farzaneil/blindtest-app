import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Blindtest — Écran hôte",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-dark text-white min-h-screen">{children}</body>
    </html>
  );
}
