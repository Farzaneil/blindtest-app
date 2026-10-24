"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock, Pencil, X } from "lucide-react";
import { usePlayerAccount } from "../../lib/usePlayerAccount";
import { ThemePicker } from "../_components/ThemePicker";
import { PlayerAvatar } from "../../lib/avatars";
import { AvatarPicker } from "../_components/AvatarPicker";
import { SkinSwatch } from "../_components/SkinSwatch";
import { usePlayerProfileData, type PlayerHistoryEntry } from "../../lib/usePlayerProfileData";
import { usePlayerBadges, type BadgeProgressRow } from "../../lib/usePlayerBadges";
import { usePlayerCosmetics } from "../../lib/usePlayerCosmetics";
import { usePlayerLeaderboard } from "../../lib/usePlayerLeaderboard";
import {
  BADGE_DEFINITIONS,
  type BadgeCategory,
  type BadgeDefinition,
  nextThreshold,
  levelForXp,
  xpIntoCurrentLevel,
  XP_PER_LEVEL,
} from "../../lib/badges";
import {
  COSMETIC_BY_KEY,
  COSMETIC_CATEGORIES,
  COSMETIC_CATEGORY_LABEL,
  COSMETIC_DEFINITIONS,
  isCosmeticUnlocked,
  type CosmeticCategory,
} from "../../lib/cosmetics";

/**
 * Espace joueur /profil — refonte "Arcade autocollants" (maquettes : canvas
 * "Blindtest — Refonte Arcade", page Profil v2). En-tête commun (avatar
 * cliquable pour le changer, niveau, barre d'XP) + 5 onglets :
 *   - Réglages : pseudo, skin du buzzer (7 familles, déblocages calculés à
 *     la volée, voir lib/cosmetics.tsx), couleur du fond, compte.
 *   - Stats : chiffres clés, forme du moment (10 dernières parties),
 *     records.
 *   - Badges : paliers obtenus, prochain objectif, médailles par catégorie.
 *   - Historique : parties groupées par mois, filtre victoires.
 *   - Classement : podium + liste, avec avatars (migration 0031).
 * Données : usePlayerProfileData (stats/historique depuis players/rounds),
 * usePlayerBadges (player_badge_progress), usePlayerCosmetics (skin
 * équipé), get_player_leaderboard().
 */

type TabKey = "reglages" | "stats" | "badges" | "historique" | "classement";

const TABS: { key: TabKey; label: string }[] = [
  { key: "reglages", label: "Réglages" },
  { key: "stats", label: "Stats" },
  { key: "badges", label: "Badges" },
  { key: "historique", label: "Historique" },
  { key: "classement", label: "Classement" },
];

const CARD = "bg-inkSurface border-[3px] border-fg rounded-[20px] shadow-sticker";
const TIER_FILL: Record<string, string> = { bronze: "#E7B48F", argent: "#D6D9DE", or: "#F5A524" };
const TIER_ORDER = ["none", "bronze", "argent", "or"] as const;
const TIER_LABEL: Record<string, string> = { bronze: "bronze", argent: "argent", or: "or" };

function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-display text-[17px]">{children}</h2>
      {right && <span className="text-xs font-extrabold">{right}</span>}
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return <p className="text-sm font-bold text-danger bg-inkSurface border-2 border-danger rounded-xl px-3 py-2">{text}</p>;
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className={`${CARD} px-4 py-3 text-sm font-bold text-inkMuted`}>{children}</p>;
}

function Skeleton({ className }: { className: string }) {
  return <div className={`rounded-2xl bg-inkSurface border-[3px] border-fg/20 animate-pulse ${className}`} />;
}

export default function ProfilPage() {
  const router = useRouter();
  const { account, loading: accountLoading, refresh: refreshAccount } = usePlayerAccount();
  const [tab, setTab] = useState<TabKey>("reglages");
  const [avatarOpen, setAvatarOpen] = useState(false);
  const profile = usePlayerProfileData(account?.id ?? "");
  const badges = usePlayerBadges(account?.id ?? "");

  useEffect(() => {
    if (!accountLoading && !account) {
      router.replace("/connexion?next=" + encodeURIComponent("/profil"));
    }
  }, [accountLoading, account, router]);

  useEffect(() => {
    if (!avatarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAvatarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [avatarOpen]);

  if (accountLoading || !account) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-page px-4">
        <Skeleton className="w-full max-w-2xl h-64" />
      </main>
    );
  }

  const level = levelForXp(account.xp);
  const xpIn = xpIntoCurrentLevel(account.xp);
  const wins = profile.history.filter((h) => h.rank === 1).length;

  const logout = async () => {
    try {
      await fetch("/api/player-auth/logout", { method: "POST" });
    } catch (e) {
      console.error("[profil] déconnexion échouée", e);
    }
    // Sans ce rafraîchissement, le compte restait affiché après la
    // redirection (état partagé côté navigateur, voir usePlayerAccount).
    await refreshAccount();
    router.push("/");
  };

  return (
    <main className="flex flex-col items-center min-h-screen gap-4 px-4 py-6 sm:py-10 bg-page">
      <div className="w-full max-w-2xl flex flex-col gap-4">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-sm font-extrabold inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="w-4 h-4" strokeWidth={2.5} /> Accueil
          </Link>
          <button type="button" onClick={logout} className="text-sm font-extrabold underline hover:text-danger transition">
            Se déconnecter
          </button>
        </header>

        {/* En-tête : avatar cliquable (ouvre le choix d'avatar), niveau, XP. */}
        <section className={`${CARD} shadow-sticker-lg p-4 sm:p-5 flex flex-col gap-3`}>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setAvatarOpen(true)}
              aria-label="Changer d’avatar"
              className="relative shrink-0 transition-transform hover:-translate-y-0.5 hover:-rotate-2"
            >
              <span className="block -rotate-6 drop-shadow-[4px_4px_0_#111111]">
                <PlayerAvatar
                  player={{
                    display_name: account.pseudo,
                    avatar_key: account.avatarKey,
                    avatar_color: account.avatarColor,
                    avatar_extra: account.avatarExtra,
                  }}
                  size={84}
                  animate
                />
              </span>
              <span className="absolute -right-1 bottom-0 w-7 h-7 rounded-full bg-inkSurface border-2 border-fg shadow-sticker-sm flex items-center justify-center">
                <Pencil className="w-3.5 h-3.5" strokeWidth={2.6} />
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[26px] leading-tight truncate">{account.pseudo}</p>
              <p className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="font-display text-[13px] bg-info border-2 border-fg rounded-full px-2.5 py-0.5 -rotate-2 inline-block">
                  Niv. {level}
                </span>
                {!profile.loading && (
                  <span className="text-xs font-extrabold border-2 border-fg rounded-full px-2.5 py-0.5">
                    {profile.stats.gamesPlayed} partie{profile.stats.gamesPlayed > 1 ? "s" : ""} · {wins} victoire
                    {wins > 1 ? "s" : ""}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div>
            <div
              className="h-4 border-[3px] border-fg rounded-full overflow-hidden bg-inkSurface"
              role="img"
              aria-label={`${xpIn} XP sur ${XP_PER_LEVEL} avant le niveau ${level + 1}`}
            >
              <div className="h-full bg-good border-r-[3px] border-fg" style={{ width: `${Math.max(4, (xpIn / XP_PER_LEVEL) * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs font-extrabold flex justify-between">
              <span>
                {xpIn} / {XP_PER_LEVEL} XP
              </span>
              <span>
                Niveau {level + 1} dans {XP_PER_LEVEL - xpIn} XP
              </span>
            </p>
          </div>
        </section>

        <nav
          aria-label="Sections du profil"
          className="flex gap-1 bg-inkSurface border-[3px] border-fg rounded-2xl p-1 overflow-x-auto"
        >
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
              className={`flex-1 whitespace-nowrap min-h-[40px] px-3 rounded-xl text-sm font-extrabold transition ${
                tab === key ? "bg-sage border-2 border-fg shadow-sticker-sm" : "text-inkMuted hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === "reglages" && (
          <ReglagesPanel
            accountId={account.id}
            pseudo={account.pseudo}
            xp={account.xp}
            badges={badges.progressByKey}
            onPseudoSaved={refreshAccount}
          />
        )}
        {tab === "stats" && <StatsPanel profile={profile} wins={wins} />}
        {tab === "badges" && <BadgesPanel loading={badges.loading} error={badges.error} progressByKey={badges.progressByKey} />}
        {tab === "historique" && <HistoriquePanel loading={profile.loading} error={profile.error} history={profile.history} />}
        {tab === "classement" && <ClassementPanel accountId={account.id} />}
      </div>

      {avatarOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-start sm:items-center justify-center p-4 overflow-y-auto bg-[rgb(17_17_17/0.45)]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAvatarOpen(false);
          }}
        >
          <div role="dialog" aria-modal="true" aria-label="Changer d’avatar" className="relative w-full max-w-2xl my-6">
            <button
              type="button"
              onClick={() => setAvatarOpen(false)}
              aria-label="Fermer"
              className="absolute -top-3 -right-2 z-10 w-10 h-10 rounded-full bg-inkSurface border-[3px] border-fg shadow-sticker-sm flex items-center justify-center"
            >
              <X className="w-5 h-5" strokeWidth={3} />
            </button>
            <AvatarPicker className="w-full" />
          </div>
        </div>
      )}
    </main>
  );
}

// ============================================================================
// Réglages
// ============================================================================

function ReglagesPanel({
  accountId,
  pseudo,
  xp,
  badges,
  onPseudoSaved,
}: {
  accountId: string;
  pseudo: string;
  xp: number;
  badges: Record<string, BadgeProgressRow>;
  onPseudoSaved: () => void;
}) {
  const router = useRouter();
  const [pseudoInput, setPseudoInput] = useState(pseudo);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { equippedKey, loading: cosmeticsLoading, refresh: refreshCosmetics } = usePlayerCosmetics(accountId);
  const [skinCategory, setSkinCategory] = useState<CosmeticCategory>(() => COSMETIC_BY_KEY[equippedKey]?.category ?? "uni");
  const [equipping, setEquipping] = useState<string | null>(null);
  const [equipError, setEquipError] = useState<string | null>(null);

  const unlockCtx = { xp, badges };
  const unlockedCount = COSMETIC_DEFINITIONS.filter((c) => isCosmeticUnlocked(c, unlockCtx)).length;
  const equipped = COSMETIC_BY_KEY[equippedKey] ?? COSMETIC_BY_KEY["uni_sage"];

  const equipCosmetic = async (key: string) => {
    setEquipping(key);
    setEquipError(null);
    try {
      const res = await fetch("/api/player-account/equip-cosmetic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cosmeticKey: key }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Échec de l'équipement.");
      refreshCosmetics();
    } catch (e: any) {
      setEquipError(e?.message ?? "Échec de l'équipement.");
    } finally {
      setEquipping(null);
    }
  };

  const savePseudo = async () => {
    const trimmed = pseudoInput.trim();
    if (!trimmed || trimmed === pseudo) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/player-account/update-pseudo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pseudo: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Échec de l'enregistrement.");
      setSaveMessage({ kind: "ok", text: "Pseudo mis à jour." });
      onPseudoSaved();
    } catch (e: any) {
      setSaveMessage({ kind: "error", text: e?.message ?? "Échec de l'enregistrement." });
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/player-account/delete", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Échec de la suppression.");
      router.push("/");
    } catch (e: any) {
      setDeleteError(e?.message ?? "Échec de la suppression.");
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className={`${CARD} px-4 py-3.5`}>
        <label className="flex flex-col gap-1.5 font-display text-[15px]">
          Pseudo
          <span className="flex gap-2">
            <input
              value={pseudoInput}
              onChange={(e) => setPseudoInput(e.target.value)}
              maxLength={24}
              className="flex-1 min-w-0 border-[3px] border-fg rounded-xl px-3 py-2 font-sans font-bold text-base outline-none focus:bg-inkSurface3"
            />
            <button
              type="button"
              onClick={savePseudo}
              disabled={saving || !pseudoInput.trim() || pseudoInput.trim() === pseudo}
              className="min-h-[44px] px-4 bg-sage border-[3px] border-fg rounded-xl shadow-sticker-sm font-sans font-extrabold text-sm disabled:opacity-40"
            >
              {saving ? "…" : "OK"}
            </button>
          </span>
        </label>
        {saveMessage && (
          <p className={`mt-1.5 text-xs font-bold ${saveMessage.kind === "ok" ? "text-fg" : "text-danger"}`}>{saveMessage.text}</p>
        )}
      </section>

      <section className={`${CARD} px-4 py-3.5 flex flex-col gap-3`}>
        <SectionTitle right={`${unlockedCount} / ${COSMETIC_DEFINITIONS.length} débloqués`}>Skin du buzzer</SectionTitle>
        <div className="flex items-center gap-4">
          <span className="block drop-shadow-[0_9px_0_#111111]">
            <SkinSwatch def={equipped} size={110} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-xl">{equipped.label}</p>
            <p className="text-xs font-bold text-inkMuted">Famille {COSMETIC_CATEGORY_LABEL[equipped.category]} · équipé</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Familles de skins">
          {COSMETIC_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={skinCategory === cat}
              onClick={() => setSkinCategory(cat)}
              className={`min-h-[36px] px-3 rounded-full border-2 border-fg text-xs font-extrabold transition ${
                skinCategory === cat ? "bg-sage shadow-sticker-sm" : "bg-inkSurface hover:-translate-y-0.5"
              }`}
            >
              {COSMETIC_CATEGORY_LABEL[cat]}
            </button>
          ))}
        </div>

        {cosmeticsLoading ? (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-x-2 gap-y-4 pt-1">
            {COSMETIC_DEFINITIONS.filter((c) => c.category === skinCategory).map((c) => {
              const unlocked = isCosmeticUnlocked(c, unlockCtx);
              const isEquipped = equippedKey === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  disabled={!unlocked || equipping !== null}
                  onClick={() => equipCosmetic(c.key)}
                  aria-pressed={isEquipped}
                  aria-label={unlocked ? c.label : `${c.label} — à débloquer : ${c.unlockHint}`}
                  className="flex flex-col items-center gap-1.5 text-center text-[11px] font-extrabold leading-tight transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed"
                >
                  <span
                    className="relative block rounded-full"
                    style={isEquipped ? { boxShadow: "0 0 0 3px #FFFFFF, 0 0 0 6px #111111" } : { filter: "drop-shadow(0 4px 0 #111111)" }}
                  >
                    <span className={`block ${unlocked ? "" : "opacity-45"}`}>
                      <SkinSwatch def={c} size={56} />
                    </span>
                    {!unlocked && (
                      <span className="absolute -right-1 -bottom-0.5 w-[22px] h-[22px] rounded-full bg-gold border-2 border-fg flex items-center justify-center">
                        <Lock className="w-3 h-3" strokeWidth={3} />
                      </span>
                    )}
                  </span>
                  {unlocked ? c.label : c.unlockHint}
                </button>
              );
            })}
          </div>
        )}
        {equipError && <p className="text-xs font-bold text-danger">{equipError}</p>}
      </section>

      <ThemePicker className="w-full" />

      <section className={`${CARD} px-4 py-3.5 flex flex-col gap-2 text-sm font-extrabold`}>
        <h2 className="font-display text-[17px]">Compte</h2>
        <span className="font-bold text-inkMuted">Connexion par e-mail (lien ou code)</span>
        <Link href="/confidentialite" className="underline w-fit">
          Voir quelles données sont stockées et pourquoi
        </Link>
        {!confirmingDelete ? (
          <button type="button" onClick={() => setConfirmingDelete(true)} className="text-left underline text-danger w-fit">
            Supprimer mon compte et mes données
          </button>
        ) : (
          <div className="flex flex-col gap-2 border-2 border-danger rounded-xl px-3 py-3">
            <p className="text-xs font-bold">
              Cette action supprime définitivement ton compte joueur (pseudo, avatar, adresse e-mail). Tes parties déjà
              jouées restent visibles pour les autres joueurs, mais sans être rattachées à ton compte. Impossible à annuler.
            </p>
            {deleteError && <p className="text-xs text-danger">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={deleteAccount}
                disabled={deleting}
                className="bg-danger text-white border-2 border-fg rounded-xl px-3 py-1.5 text-xs font-extrabold disabled:opacity-50"
              >
                {deleting ? "Suppression…" : "Confirmer la suppression"}
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting} className="text-xs underline">
                Annuler
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ============================================================================
// Stats
// ============================================================================

const RANK_FILL: Record<number, string> = { 1: "#F5A524", 2: "#D6D9DE", 3: "#E7B48F" };

function BigStat({ value, label, rotate = 0, className = "bg-inkSurface" }: { value: string; label: string; rotate?: number; className?: string }) {
  return (
    <div
      className={`${className} border-[3px] border-fg rounded-[18px] shadow-sticker-sm px-2 py-3 text-center`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <p className="font-display text-[28px] leading-tight">{value}</p>
      <p className="text-xs font-extrabold">{label}</p>
    </div>
  );
}

function StatsPanel({ profile, wins }: { profile: ReturnType<typeof usePlayerProfileData>; wins: number }) {
  if (profile.loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }
  if (profile.error) return <ErrorNote text={profile.error} />;

  const { stats, history } = profile;
  const last = history.slice(0, 10).reverse();
  const lastWins = last.filter((h) => h.rank === 1).length;
  const bestScore = history.reduce((m, h) => Math.max(m, h.score), 0);
  const podiums = history.filter((h) => h.rank <= 3).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <BigStat value={String(stats.gamesPlayed)} label="parties" rotate={-1.5} />
        <BigStat value={String(wins)} label="victoires" rotate={1.5} className="bg-gold" />
        <BigStat value={String(stats.correctAnswers)} label="bonnes réponses" rotate={1} />
        <BigStat value={`${stats.successRate} %`} label="de réussite" rotate={-1} className="bg-sage" />
      </div>

      <section className={`${CARD} px-4 py-3.5 flex flex-col gap-2.5`}>
        <SectionTitle right={last.length > 0 ? `${last.length} dernière${last.length > 1 ? "s" : ""} partie${last.length > 1 ? "s" : ""}` : undefined}>
          Forme du moment
        </SectionTitle>
        {last.length === 0 ? (
          <p className="text-sm font-bold text-inkMuted">Joue une partie pour voir ta forme apparaître ici.</p>
        ) : (
          <>
            <div className="h-28 flex gap-1.5 items-stretch border-b-[3px] border-fg" role="img" aria-label="Places obtenues lors des dernières parties">
              {last.map((h) => {
                const height = h.rank === 1 ? 100 : h.rank === 2 ? 74 : h.rank === 3 ? 52 : 30;
                return (
                  <div key={h.roomId} className="flex-1 flex flex-col items-center justify-end gap-1">
                    <span className="font-display text-[11px]">{h.rank}</span>
                    <span
                      className="block w-full border-2 border-fg rounded-t-lg"
                      style={{ height: `${height}%`, background: RANK_FILL[h.rank] ?? "#FFFFFF" }}
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-xs font-extrabold">
              {lastWins === 0
                ? "Pas encore de victoire récente : la prochaine est pour toi !"
                : `${lastWins} victoire${lastWins > 1 ? "s" : ""} sur les ${last.length} dernières parties.`}
            </p>
          </>
        )}
      </section>

      <section className={`${CARD} px-4 py-3.5 flex flex-col gap-2.5`}>
        <SectionTitle>Tes records</SectionTitle>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { v: String(stats.bestStreak), l: "bonnes réponses d’affilée" },
            { v: String(bestScore), l: "points en une partie" },
            { v: String(podiums), l: "podiums" },
          ].map((r) => (
            <div key={r.l} className="border-2 border-fg rounded-2xl px-1 py-2">
              <p className="font-display text-xl">{r.v}</p>
              <p className="text-[11px] font-extrabold leading-tight">{r.l}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// Badges
// ============================================================================

const BADGE_CATEGORIES: BadgeCategory[] = ["Performance en jeu", "Assiduité", "Social", "Côté hôte"];

function BadgeTile({ def, row, index }: { def: BadgeDefinition; row?: BadgeProgressRow; index: number }) {
  const progress = row?.progress ?? 0;
  const tier = row?.tier ?? "none";
  const next = nextThreshold(def, progress);
  const tierIdx = TIER_ORDER.indexOf(tier);
  // Progression vers le palier suivant, depuis le palier atteint.
  const prev = tier === "none" ? 0 : def.thresholds[tier];
  const pct = next === null ? 100 : Math.round(((progress - prev) / Math.max(1, next - prev)) * 100);
  const rotate = [-3, 2, -1, 3][index % 4];
  const Icon = def.icon;
  return (
    <div className="flex flex-col items-center gap-1.5 text-center" title={`${def.description} : ${progress}`}>
      <span
        className={`w-[68px] h-[68px] rounded-[20px] flex items-center justify-center border-[3px] border-fg ${
          tier === "none" ? "border-dashed bg-inkSurface opacity-55" : "shadow-sticker-sm"
        }`}
        style={{ background: TIER_FILL[tier], transform: `rotate(${rotate}deg)` }}
      >
        <Icon className="w-[30px] h-[30px]" strokeWidth={2.5} />
      </span>
      <span className="font-display text-xs leading-tight">{def.label}</span>
      <span className="flex gap-[3px]" aria-label={tier === "none" ? "Aucun palier" : `Palier ${TIER_LABEL[tier]}`}>
        {(["bronze", "argent", "or"] as const).map((t, i) => (
          <span
            key={t}
            className="w-3 h-3 rounded-full border-2 border-fg"
            style={{ background: tierIdx >= i + 1 ? TIER_FILL[t] : "#FFFFFF" }}
          />
        ))}
      </span>
      <span className="w-[84%] h-2 border-2 border-fg rounded-full overflow-hidden bg-inkSurface">
        <span className="block h-full bg-good" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </span>
      <span className="text-[10.5px] font-extrabold">{next === null ? "Max !" : `${progress} / ${next}`}</span>
    </div>
  );
}

function BadgesPanel({
  loading,
  error,
  progressByKey,
}: {
  loading: boolean;
  error: string | null;
  progressByKey: Record<string, BadgeProgressRow>;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }
  if (error) return <ErrorNote text={error} />;

  const tiersObtained = BADGE_DEFINITIONS.reduce((n, d) => n + TIER_ORDER.indexOf(progressByKey[d.key]?.tier ?? "none"), 0);
  const tiersTotal = BADGE_DEFINITIONS.length * 3;

  // Prochain objectif : le badge le plus proche (en %) de son palier suivant.
  let goal: { def: BadgeDefinition; remaining: number; nextTier: string; pct: number } | null = null;
  for (const def of BADGE_DEFINITIONS) {
    const row = progressByKey[def.key];
    const progress = row?.progress ?? 0;
    const tier = row?.tier ?? "none";
    const next = nextThreshold(def, progress);
    if (next === null) continue;
    const prev = tier === "none" ? 0 : def.thresholds[tier];
    const pct = (progress - prev) / Math.max(1, next - prev);
    const nextTier = TIER_ORDER[TIER_ORDER.indexOf(tier) + 1];
    if (!goal || pct > goal.pct) goal = { def, remaining: next - progress, nextTier, pct };
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_1.5fr] gap-2.5">
        <div className={`${CARD} px-3 py-3 text-center -rotate-[1.5deg]`}>
          <p className="font-display text-[30px] leading-tight">
            {tiersObtained}
            <span className="text-base"> / {tiersTotal}</span>
          </p>
          <p className="text-xs font-extrabold">paliers obtenus</p>
        </div>
        {goal ? (
          <div className="bg-sage border-[3px] border-fg rounded-[20px] shadow-sticker px-3 py-2.5 flex flex-col gap-1">
            <p className="text-[11px] font-extrabold uppercase tracking-wide">Prochain objectif</p>
            <p className="font-display text-sm leading-tight">
              Encore {goal.remaining} pour {goal.def.label} {TIER_LABEL[goal.nextTier]}
            </p>
            <p className="text-[11px] font-bold">{goal.def.description}</p>
            <span className="h-2 border-2 border-fg rounded-full overflow-hidden bg-inkSurface">
              <span className="block h-full bg-good" style={{ width: `${Math.round(goal.pct * 100)}%` }} />
            </span>
          </div>
        ) : (
          <div className="bg-gold border-[3px] border-fg rounded-[20px] shadow-sticker px-3 py-2.5 flex items-center">
            <p className="font-display text-sm">Tous les badges sont au max. Respect !</p>
          </div>
        )}
      </div>

      {BADGE_CATEGORIES.map((category) => {
        const defs = BADGE_DEFINITIONS.filter((d) => d.category === category);
        if (defs.length === 0) return null;
        return (
          <section key={category} className={`${CARD} px-3 pt-3.5 pb-4 flex flex-col gap-3.5`}>
            <SectionTitle>{category}</SectionTitle>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-2 gap-y-5">
              {defs.map((def, i) => (
                <BadgeTile key={def.key} def={def} row={progressByKey[def.key]} index={i} />
              ))}
            </div>
          </section>
        );
      })}
      <p className="text-xs font-bold text-center">Les badges se mettent à jour à la fin de chaque partie.</p>
    </div>
  );
}

// ============================================================================
// Historique
// ============================================================================

function HistoriquePanel({ loading, error, history }: { loading: boolean; error: string | null; history: PlayerHistoryEntry[] }) {
  const [onlyWins, setOnlyWins] = useState(false);
  const [shown, setShown] = useState(10);

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }
  if (error) return <ErrorNote text={error} />;
  if (history.length === 0) return <EmptyNote>Aucune partie terminée pour l’instant : reviens ici après ta prochaine partie !</EmptyNote>;

  const list = (onlyWins ? history.filter((h) => h.rank === 1) : history).slice(0, shown);
  const total = onlyWins ? history.filter((h) => h.rank === 1).length : history.length;
  const groups: { month: string; items: PlayerHistoryEntry[] }[] = [];
  for (const h of list) {
    const month = new Date(h.playedAt).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    const g = groups[groups.length - 1];
    if (g && g.month === month) g.items.push(h);
    else groups.push({ month, items: [h] });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {[
          { v: false, l: "Toutes" },
          { v: true, l: "Victoires" },
        ].map((f) => (
          <button
            key={f.l}
            type="button"
            aria-pressed={onlyWins === f.v}
            onClick={() => {
              setOnlyWins(f.v);
              setShown(10);
            }}
            className={`min-h-[36px] px-3 rounded-full border-2 border-fg text-xs font-extrabold ${
              onlyWins === f.v ? "bg-sage shadow-sticker-sm" : "bg-inkSurface"
            }`}
          >
            {f.l}
          </button>
        ))}
      </div>

      {list.length === 0 && <EmptyNote>Pas encore de victoire, ça va venir !</EmptyNote>}

      {groups.map((g) => (
        <section key={g.month} className="flex flex-col gap-2">
          <h2 className="font-display text-[15px] first-letter:uppercase">{g.month}</h2>
          {g.items.map((h, i) => (
            <div key={h.roomId} className="bg-inkSurface border-[3px] border-fg rounded-[20px] shadow-sticker-sm px-3 py-2.5 flex items-center gap-3">
              <span
                className="w-[52px] h-[52px] shrink-0 rounded-2xl border-[3px] border-fg flex items-center justify-center font-display text-[17px]"
                style={{ background: RANK_FILL[h.rank] ?? "#FFFFFF", transform: `rotate(${[-3, 2, -1, 3][i % 4]}deg)` }}
              >
                {h.rank === 1 ? "1er" : `${h.rank}e`}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold flex items-center gap-1.5 flex-wrap">
                  <span className="first-letter:uppercase">
                    {new Date(h.playedAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" })}
                  </span>
                  {h.rank === 1 && (
                    <span className="text-[11px] font-extrabold bg-good border-2 border-fg rounded-full px-2">Victoire</span>
                  )}
                </p>
                <p className="text-xs font-bold text-inkMuted">
                  Partie {h.roomCode} · {h.playerCount} joueur{h.playerCount > 1 ? "s" : ""}
                </p>
              </div>
              <p className="font-display text-[17px] whitespace-nowrap">{h.score} pts</p>
            </div>
          ))}
        </section>
      ))}

      {shown < total && (
        <button
          type="button"
          onClick={() => setShown((n) => n + 10)}
          className="self-center min-h-[44px] px-5 bg-inkSurface border-2 border-fg rounded-2xl shadow-sticker-sm text-sm font-extrabold"
        >
          Voir plus
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Classement
// ============================================================================

function ClassementPanel({ accountId }: { accountId: string }) {
  const { loading, error, entries } = usePlayerLeaderboard(accountId);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-12" />
      </div>
    );
  }
  if (error) return <ErrorNote text={error} />;
  if (entries.length <= 1) {
    return (
      <EmptyNote>
        Tu n’as encore croisé aucun autre compte en partie. Les joueurs que tu rencontres apparaîtront ici après une partie
        jouée ensemble.
      </EmptyNote>
    );
  }

  const avatarOf = (e: (typeof entries)[number]) => ({
    display_name: e.pseudo,
    avatar_key: e.avatarKey,
    avatar_color: e.avatarColor,
    avatar_extra: e.avatarExtra,
  });
  const top = entries.slice(0, 3);
  const rest = entries.slice(3);
  const podiumOrder = [top[1], top[0], top[2]].filter(Boolean);
  const heights: Record<number, number> = { 1: 100, 2: 70, 3: 50 };
  const fills: Record<number, string> = { 1: "#F5A524", 2: "#D6D9DE", 3: "#E7B48F" };

  return (
    <div className="flex flex-col gap-3">
      <section className={`${CARD} px-3 pt-5 flex justify-center items-end gap-2`}>
        {podiumOrder.map((e) => {
          const rank = entries.indexOf(e) + 1;
          const me = e.accountId === accountId;
          return (
            <div key={e.accountId} className="flex flex-col items-center gap-1 w-[100px]">
              <span className="block drop-shadow-[3px_3px_0_#111111]" style={{ transform: `rotate(${rank === 1 ? 0 : rank === 2 ? -4 : 4}deg)` }}>
                <PlayerAvatar player={avatarOf(e)} size={rank === 1 ? 62 : 50} animate={rank === 1} />
              </span>
              <span className="font-display text-sm truncate max-w-full">
                {e.pseudo}
                {me ? " (toi)" : ""}
              </span>
              <span className="text-[11px] font-extrabold">Niv. {levelForXp(e.xp)}</span>
              <div
                className="w-full border-[3px] border-fg rounded-t-xl flex justify-center pt-1 font-display text-2xl"
                style={{ height: heights[rank], background: fills[rank] }}
              >
                {rank}
              </div>
            </div>
          );
        })}
      </section>

      {rest.map((e, i) => {
        const me = e.accountId === accountId;
        return (
          <div
            key={e.accountId}
            className={`flex items-center gap-2.5 border-2 border-fg rounded-2xl shadow-sticker-sm pl-2 pr-3 py-1.5 ${me ? "bg-sage" : "bg-inkSurface"}`}
          >
            <span className="font-display w-5 text-center">{i + 4}</span>
            <PlayerAvatar player={avatarOf(e)} size={36} />
            <span className="flex-1 font-extrabold truncate">
              {e.pseudo}
              {me ? " (toi)" : ""}
            </span>
            <span className="font-display text-sm whitespace-nowrap">Niv. {levelForXp(e.xp)}</span>
          </div>
        );
      })}
      <p className="text-xs font-bold text-inkMuted">Les joueurs avec qui tu as déjà partagé une partie.</p>
    </div>
  );
}

