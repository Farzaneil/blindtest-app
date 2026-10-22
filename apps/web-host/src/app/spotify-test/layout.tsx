import type { ReactNode } from "react";
import { notFound } from "next/navigation";

// Page de debug Spotify : réservée au développement local, introuvable en
// production (elle n'a pas sa place sur le site public).
export const metadata = { title: "Test Spotify" };

export default function Layout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
