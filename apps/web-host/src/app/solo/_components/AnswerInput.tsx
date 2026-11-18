"use client";

import { useId } from "react";

/**
 * Champ de réponse du mode solo (titre ou artiste). Pas d'autocomplétion :
 * le joueur tape sa réponse lui-même, la correction tolère les petites
 * fautes (voir lib/solo/match.ts). Un champ validé passe en vert avec ✅
 * et se fige.
 */
export function AnswerInput({
  label,
  value,
  onChange,
  ok,
  placeholder,
  dark = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  ok: boolean;
  placeholder: string;
  dark?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={`text-xs font-extrabold tracking-[0.15em] uppercase ${dark ? "text-white" : ""}`}>
        {label}
      </label>
      <div className={`mt-1 border-4 border-fg rounded-2xl px-4 py-3 flex items-center gap-2 text-fg ${ok ? "bg-[#E6F8EC]" : "bg-white"}`}>
        <input
          id={id}
          value={value}
          readOnly={ok}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
          className="flex-1 min-w-0 bg-transparent outline-none text-lg font-semibold placeholder:text-fg/35"
        />
        {ok && <span aria-label="Bonne réponse">✅</span>}
      </div>
    </div>
  );
}
