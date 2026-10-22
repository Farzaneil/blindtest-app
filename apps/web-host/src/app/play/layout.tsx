import type { ReactNode } from "react";

// Titre d'onglet de la page (la page elle-même est un composant client,
// qui ne peut pas exporter de metadata).
export const metadata = { title: "Rejoindre une partie" };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
