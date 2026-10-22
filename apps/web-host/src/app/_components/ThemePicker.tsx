"use client";

import { useEffect, useState } from "react";
import { THEMES, applyTheme, readCurrentTheme, type ThemeId } from "../../lib/theme";

/**
 * Choix de la couleur du fond (jaune / bleu ciel / lilas), mémorisé sur
 * l'appareil — voir lib/theme.ts pour la règle complète. Affiché sur
 * l'accueil et le profil.
 */
export function ThemePicker({ className = "" }: { className?: string }) {
  // null au rendu serveur : le fond réel n'est connu qu'après montage (il
  // est posé par le script de layout.tsx, propre à chaque appareil).
  const [current, setCurrent] = useState<ThemeId | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrent(readCurrentTheme());
  }, []);

  return (
    <div
      role="group"
      aria-label="Couleur du fond"
      className={`flex items-center justify-between gap-3 bg-inkSurface border-[3px] border-fg rounded-2xl shadow-sticker-sm px-4 py-2.5 ${className}`}
    >
      <span className="font-extrabold text-sm">Couleur du fond</span>
      <div className="flex gap-2.5">
        {THEMES.map((t) => {
          const selected = current === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-label={`Fond ${t.label.toLowerCase()}`}
              aria-pressed={selected}
              onClick={() => {
                applyTheme(t.id);
                setCurrent(t.id);
              }}
              className="w-11 h-11 rounded-full border-[3px] border-fg transition-transform active:scale-90"
              style={{
                background: t.color,
                boxShadow: selected ? "0 0 0 3px #FFFFFF, 0 0 0 6px #111111" : "3px 3px 0 #111111",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
