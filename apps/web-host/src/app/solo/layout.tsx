import type { ReactNode } from "react";
import { SoloGate } from "./_components/SoloGate";

export const metadata = { title: "La Tournée · mode solo" };

/** Tout le mode solo (carte et niveaux) exige d'être connecté : voir SoloGate. */
export default function SoloLayout({ children }: { children: ReactNode }) {
  return <SoloGate>{children}</SoloGate>;
}
