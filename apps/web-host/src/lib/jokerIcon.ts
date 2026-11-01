import { createLucideIcon } from "lucide-react";

/**
 * Icône de la manche joker : « ×2 » (points doublés dans les deux sens).
 * Remplace le dé Dice5, dont la face 5 ne voulait rien dire. Construite
 * avec createLucideIcon pour s'utiliser comme n'importe quelle icône
 * lucide (className, strokeWidth, type LucideIcon pour InfoItem…).
 */
export const JokerIcon = createLucideIcon("joker-x2", [
  ["path", { d: "M3 9l6 6M9 9l-6 6", key: "x" }],
  ["path", { d: "M13.5 9.5a3.5 3.5 0 0 1 7 0c0 2.6-7 4.6-7 8.5h7", key: "2" }],
]);
