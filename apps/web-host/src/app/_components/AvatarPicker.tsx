"use client";

import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { AVATARS, AVATAR_BY_KEY, AVATAR_COLORS, Avatar, avatarForPlayer } from "../../lib/avatars";
import { usePlayerAccount } from "../../lib/usePlayerAccount";
import { usePlayerBadges } from "../../lib/usePlayerBadges";
import { AVATAR_EXTRAS, isAvatarExtraUnlocked } from "../../lib/avatarExtras";

/**
 * Choix de l'avatar du compte (profil) : grille des 12 avatars "La
 * Bande-Son" + couleur du rond + effet spécial (voir lib/avatarExtras.ts),
 * enregistrés via
 * api/player-account/update-avatar (maquette "Choisir son avatar").
 */
export function AvatarPicker({ className = "" }: { className?: string }) {
  const { account, refresh } = usePlayerAccount();
  const current = account
    ? avatarForPlayer({
        display_name: account.pseudo,
        avatar_key: account.avatarKey,
        avatar_color: account.avatarColor,
        avatar_extra: account.avatarExtra,
      })
    : null;
  const { progressByKey } = usePlayerBadges(account?.id ?? "");
  const [draft, setDraft] = useState<{ key: string; color: string; extra: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!account || !current) return null;
  const chosen = draft ?? current;
  const dirty = chosen.key !== current.key || chosen.color !== current.color || chosen.extra !== current.extra;
  const unlockCtx = { xp: account.xp, badges: progressByKey };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/player-account/update-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarKey: chosen.key, avatarColor: chosen.color, avatarExtra: chosen.extra }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Enregistrement impossible.");
      await refresh();
      setDraft(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e?.message ?? "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const def = AVATAR_BY_KEY[chosen.key];

  return (
    <section className={`bg-inkSurface border-[3px] border-fg rounded-2xl shadow-sticker p-5 flex flex-col gap-4 ${className}`}>
      <div className="flex items-center gap-4">
        <span className="block -rotate-6 drop-shadow-[5px_5px_0_#111111]">
          <Avatar avatarKey={chosen.key} color={chosen.color} extra={chosen.extra} animate size={88} title={def ? `${def.name}, ${def.what}` : undefined} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl">Ton avatar</h2>
          {def && (
            <p className="text-sm font-bold text-inkMuted">
              {def.name}, {def.what}
            </p>
          )}
        </div>
      </div>

      <div role="radiogroup" aria-label="Avatar" className="grid grid-cols-4 sm:grid-cols-6 gap-3">
        {AVATARS.map((a) => {
          const selected = a.key === chosen.key;
          return (
            <button
              key={a.key}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${a.name}, ${a.what}`}
              onClick={() => setDraft({ key: a.key, color: chosen.color, extra: chosen.extra })}
              className="flex flex-col items-center gap-1 text-[11px] font-extrabold transition-transform hover:-translate-y-0.5"
            >
              <span
                className="block rounded-full"
                style={selected ? { boxShadow: "0 0 0 3px #FFFFFF, 0 0 0 6px #111111" } : undefined}
              >
                <Avatar avatarKey={a.key} color={selected ? chosen.color : a.bg} extra={selected ? chosen.extra : null} size={60} />
              </span>
              {a.name}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-display text-sm">Couleur du rond</span>
        <div role="radiogroup" aria-label="Couleur du rond" className="flex flex-wrap gap-2">
          {AVATAR_COLORS.map((c) => {
            const selected = c === chosen.color;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`Couleur ${c}`}
                onClick={() => setDraft({ key: chosen.key, color: c, extra: chosen.extra })}
                className="w-9 h-9 rounded-full border-[3px] border-fg"
                style={{ background: c, boxShadow: selected ? "0 0 0 3px #FFFFFF, 0 0 0 6px #111111" : "2px 2px 0 #111111" }}
              />
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-display text-sm">Effet spécial</span>
        <div role="radiogroup" aria-label="Effet spécial" className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[null, ...AVATAR_EXTRAS].map((x) => {
            const key = x?.key ?? null;
            const unlocked = !x || isAvatarExtraUnlocked(x, unlockCtx);
            const selected = chosen.extra === key;
            return (
              <button
                key={key ?? "aucun"}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!unlocked}
                title={x ? (unlocked ? x.description : `À débloquer : ${x.unlockHint}`) : "Sans effet"}
                onClick={() => setDraft({ key: chosen.key, color: chosen.color, extra: key })}
                className={`group flex items-center gap-2 text-left rounded-xl border-2 border-fg px-2 py-1.5 transition-transform ${
                  selected ? "bg-sage shadow-sticker-sm" : "bg-inkSurface hover:-translate-y-0.5"
                } disabled:opacity-60 disabled:hover:translate-y-0 disabled:cursor-not-allowed`}
              >
                <span className="relative">
                  <Avatar avatarKey={chosen.key} color={chosen.color} extra={key} animate={key === "anime"} size={40} />
                  {!unlocked && (
                    <span className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full bg-gold border-2 border-fg flex items-center justify-center">
                      <Lock className="w-3 h-3" strokeWidth={3} />
                    </span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-extrabold leading-tight">{x?.label ?? "Aucun"}</span>
                  {x && <span className="block text-[10px] font-bold text-inkMuted leading-tight">{unlocked ? "Débloqué" : x.unlockHint}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="text-sm font-bold text-danger">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="bg-sage border-[3px] border-fg shadow-sticker-sm rounded-xl px-5 py-2.5 font-display transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
        >
          {saving ? "Enregistrement…" : "Garder cet avatar"}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm font-bold">
            <Check className="w-4 h-4" /> Enregistré
          </span>
        )}
      </div>
    </section>
  );
}
