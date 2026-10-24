"use client";

import { useId } from "react";
import type { CosmeticDefinition } from "../../lib/cosmetics";

/**
 * Miniature ronde d'un skin de buzzer (profil) : le dessin SVG du skin,
 * découpé en rond et cerné de noir. Le skin "Couleur du thème" suit la
 * couleur des boutons du fond choisi (variable CSS --c1).
 */
export function SkinSwatch({ def, size = 56, className = "" }: { def: CosmeticDefinition; size?: number; className?: string }) {
  const clipId = useId().replace(/:/g, "");
  const themed = def.bg.startsWith("rgb(var(");
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className={`shrink-0 overflow-visible ${className}`}>
      <defs>
        <clipPath id={`skin-${clipId}`}>
          <circle cx="50" cy="50" r="48" />
        </clipPath>
      </defs>
      <g clipPath={`url(#skin-${clipId})`}>
        {def.art ? (
          <g dangerouslySetInnerHTML={{ __html: def.art }} />
        ) : (
          <rect width="100" height="100" fill={themed ? undefined : def.bg} style={themed ? { fill: def.bg } : undefined} />
        )}
      </g>
      <circle cx="50" cy="50" r="48" fill="none" stroke="#111111" strokeWidth="5" />
    </svg>
  );
}
