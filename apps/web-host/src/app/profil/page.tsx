"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Award,
  BarChart3,
  History,
  Lock,
  Settings,
  Trophy,
} from "lucide-react";
import { usePlayerAccount } from "../../lib/usePlayerAccount";
import { usePlayerProfileData } from "../../lib/usePlayerProfileData";
import { usePlayerBadges } from "../../lib/usePlayerBadges";
import { usePlayerCosmetics } from "../../lib/usePlayerCosmetics";
import { usePlayerLeaderboard } from "../../lib/usePlayerLeaderboard";
import { BADGE_DEFINITIONS, type BadgeCategory, nextThreshold, levelForXp, xpIntoCurrentLevel, XP_PER_LEVEL } from "../../lib/badges";
import {
  COSMETIC_DEFINITIONS,
  COSMETIC_CATEGORY_LABEL,
  type CosmeticCategory,
} from "../../lib/cosmetics";

/**
 * Espace joueur /profil — visuel repris de la maquette validée
 * (maquette_comptes_espace_joueur.html, section 2 : 5 onglets Réglages/
 * Stats/Badges/Historique/Classement). Phases 2 à 4 du plan (voir
 * cadrage_comptes_recompenses_rgpd.md, section 7) :
 *
 *   - Réglages (pseudo + suppression de compte) et Stats/Historique
 *     tournent sur des données RÉELLES depuis la phase 2 : le pseudo existe
 *     déjà sur player_accounts (migration 0020), les stats/l'historique se
 *     calculent depuis players/rounds/round_attempts, qui existent depuis le
 *     tout début du projet (migrations 0001/0008) — voir
 *     usePlayerProfileData.
 *   - Badges et le pill "Niveau X" + barre d'XP du header tournent sur des
 *     données réelles depuis la phase 3 : voir player_badge_progress
 *     (migration 0021) et player_accounts.xp, alimentés par
 *     award_game_rewards() en fin de partie (voir
 *     lib/rooms.ts:awardGameRewards, appelé depuis app/host/page.tsx).
 *   - Le "Skin du buzzer" (catégories Uni/Nature/Cosmique/Slay) tourne
 *     désormais lui aussi sur des données réelles (phase 4) : voir
 *     player_cosmetics (migration 0022), alimentée par
 *     award_cosmetic_unlocks() dans le même flux de fin de partie, et la
 *     route api/player-account/equip-cosmetic pour changer de skin équipé.
 *   - Classement tourne désormais lui aussi sur des données réelles
 *     (phase 5) : voir get_player_leaderboard() (migration 0023). Comme
 *     précisé dans le cadrage (section 5.4) et la maquette validée, ce
 *     n'est pas un classement 100% global : sans système d'amis, il
 *     rassemble les comptes avec qui le joueur a déjà partagé au moins une
 *     partie, trié par XP total.
 */

type TabKey = "reglages" | "stats" | "badges" | "historique" | "classement";

const TABS: { key: TabKey; label: string; icon: typeof Settings }[] = [
  { key: "reglages", label: "Réglages", icon: Settings },
  { key: "stats", label: "Stats", icon: BarChart3 },
  { key: "badges", label: "Badges", icon: Award },
  { key: "historique", label: "Historique", icon: History },
  { key: "classement", label: "Classement", icon: Trophy },
];

const SKIN_CATEGORIES: CosmeticCategory[] = ["uni", "nature", "cosmique", "slay"];

const SKIN_CATEGORY_HINT: Record<CosmeticCategory, string> = {
  uni: "Toutes les couleurs de base sont disponibles dès le départ, sans condition. Seules les 3 teintes « palier » se débloquent en cours de route.",
  nature: "Toute la catégorie reste verrouillée avant le Niveau 5 ; une fois ce cap passé, chaque motif se débloque ensuite individuellement au palier or du badge auquel il est lié.",
  cosmique: "Toute la catégorie reste verrouillée avant le Niveau 5 ; ensuite, chaque motif se débloque au fur et à mesure de ses propres conditions (niveau plus élevé ou badge rare).",
  slay: "Débloqués tous ensemble dès le Niveau 5, comme Nature et Cosmique.",
};

function ComingSoonNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-inkMuted bg-inkSurface3 rounded-lg px-3 py-2 flex items-start gap-2">
      <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{children}</span>
    </p>
  );
}

export default function ProfilPage() {
  const router = useRouter();
  const { account, loading: accountLoading, refresh: refreshAccount } = usePlayerAccount();
  const [tab, setTab] = useState<TabKey>("reglages");

  useEffect(() => {
    if (!accountLoading && !account) {
      router.replace("/connexion?next=" + encodeURIComponent("/profil"));
    }
  }, [accountLoading, account, router]);

  if (accountLoading || !account) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-ink">
        <div className="w-full max-w-3xl h-64 mx-6 rounded-2xl bg-inkSurface2 animate-pulse" />
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center min-h-screen gap-4 p-6 bg-ink">
      <div className="w-full max-w-3xl flex justify-start">
        <Link
          href="/"
          className="text-xs text-inkMuted hover:text-sage underline transition inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Accueil
        </Link>
      </div>

      <div className="relative w-full max-w-3xl bg-inkSurface2 border border-inkBorder rounded-2xl p-7 flex flex-col gap-6">
        <span className="absolute top-0 left-7 right-7 h-1 rounded-b-md bg-sage" />

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-full bg-inkSurface3 border border-inkBorder overflow-hidden flex items-center justify-center font-display font-black text-xl text-sage shrink-0">
              {account.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={account.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                account.pseudo.charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-display font-bold text-lg truncate text-white">{account.pseudo}</p>
                <span className="text-[11px] font-bold text-sage bg-sage/10 border border-sage/30 rounded-full px-2 py-0.5 whitespace-nowrap">
                  Niveau {levelForXp(account.xp)}
                </span>
              </div>
              <div className="mt-1.5 max-w-[10rem]">
                <div className="h-1.5 rounded-full bg-inkSurface3 overflow-hidden">
                  <div
                    className="h-full bg-sage rounded-full"
                    style={{ width: `${(xpIntoCurrentLevel(account.xp) / XP_PER_LEVEL) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-inkMuted mt-1">
                  {xpIntoCurrentLevel(account.xp)} / {XP_PER_LEVEL} XP
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={async () => {
              await fetch("/api/player-auth/logout?next=" + encodeURIComponent("/"), { method: "POST" });
              router.push("/");
            }}
            className="text-xs text-inkMuted hover:text-white underline transition whitespace-nowrap shrink-0 mt-1"
          >
            Se déconnecter
          </button>
        </div>

        <div className="flex gap-1.5 sm:gap-2 border-t border-inkBorder/60 pt-4 overflow-x-auto">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={
                "flex-1 whitespace-nowrap text-xs sm:text-sm font-bold px-2 sm:px-3 py-2 sm:py-2.5 rounded-xl border transition " +
                (tab === key
                  ? "border-sage text-sage bg-sage/10"
                  : "border-inkBorder text-inkMuted hover:border-inkBorderStrong")
              }
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "reglages" && (
          <ReglagesPanel accountId={account.id} pseudo={account.pseudo} xp={account.xp} onPseudoSaved={refreshAccount} />
        )}
        {tab === "stats" && <StatsPanel accountId={account.id} />}
        {tab === "badges" && <BadgesPanel accountId={account.id} />}
        {tab === "historique" && <HistoriquePanel accountId={account.id} />}
        {tab === "classement" && <ClassementPanel accountId={account.id} />}
      </div>
    </main>
  );
}

function ReglagesPanel({
  accountId,
  pseudo,
  xp,
  onPseudoSaved,
}: {
  accountId: string;
  pseudo: string;
  xp: number;
  onPseudoSaved: () => void;
}) {
  const router = useRouter();
  const [pseudoInput, setPseudoInput] = useState(pseudo);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { unlockedKeys, equippedKey, loading: cosmeticsLoading, refresh: refreshCosmetics } = usePlayerCosmetics(accountId);
  const [skinCategory, setSkinCategory] = useState<CosmeticCategory>("uni");
  const [equipping, setEquipping] = useState<string | null>(null);
  const [equipError, setEquipError] = useState<string | null>(null);
  const level = levelForXp(xp);

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
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-inkMuted">Pseudo</p>
        <div className="flex items-center gap-2 max-w-xs">
          <div className="flex items-center gap-2 bg-inkSurface3 rounded-xl px-4 py-2.5 flex-1 min-w-0">
            <input
              value={pseudoInput}
              onChange={(e) => setPseudoInput(e.target.value)}
              maxLength={24}
              className="w-full bg-transparent border-0 focus:ring-0 text-white font-medium p-0"
            />
          </div>
          <button
            onClick={savePseudo}
            disabled={saving || !pseudoInput.trim() || pseudoInput.trim() === pseudo}
            className="bg-sage text-sageOn hover:bg-sage/90 disabled:opacity-40 disabled:cursor-not-allowed transition rounded-xl px-4 py-2.5 text-sm font-bold whitespace-nowrap"
          >
            {saving ? "..." : "Enregistrer"}
          </button>
        </div>
        {saveMessage && (
          <p className={"text-xs " + (saveMessage.kind === "ok" ? "text-sage" : "text-danger")}>{saveMessage.text}</p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-inkMuted">Skin du buzzer</p>
          <p className="text-[11px] text-inkMuted flex items-center gap-1">
            <Lock className="w-2.5 h-2.5" /> = verrouillé, survole pour savoir comment débloquer
          </p>
        </div>

        <div className="flex gap-1.5 sm:gap-2">
          {SKIN_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSkinCategory(cat)}
              className={
                "flex-1 text-xs sm:text-sm font-bold px-2 sm:px-3 py-2 rounded-xl border transition " +
                (skinCategory === cat
                  ? "border-sage text-sage bg-sage/10"
                  : "border-inkBorder text-inkMuted hover:border-inkBorderStrong")
              }
            >
              {COSMETIC_CATEGORY_LABEL[cat]}
            </button>
          ))}
        </div>

        <div className="bg-inkSurface3 rounded-xl px-4 py-4 flex flex-col gap-3">
          <p className="text-xs text-inkMuted">{SKIN_CATEGORY_HINT[skinCategory]}</p>

          {cosmeticsLoading ? (
            <div className="flex flex-wrap gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="w-11 h-11 rounded-full bg-inkSurface2 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {COSMETIC_DEFINITIONS.filter((c) => c.category === skinCategory).map((c) => {
                const unlocked = c.unlock.type === "always" || unlockedKeys.has(c.key);
                const isEquipped = equippedKey === c.key;
                return (
                  <button
                    key={c.key}
                    disabled={!unlocked || equipping === c.key}
                    onClick={() => equipCosmetic(c.key)}
                    title={unlocked ? `${c.label} — ${isEquipped ? "équipé" : "cliquer pour équiper"}` : `${c.label} — ${c.unlockHint}`}
                    className="relative w-11 h-11 rounded-full flex items-center justify-center overflow-hidden shrink-0 transition disabled:cursor-not-allowed"
                    style={{
                      background: unlocked ? c.swatch : undefined,
                      boxShadow: isEquipped ? `0 0 0 3px #303039, 0 0 0 5px ${c.accentColor}` : undefined,
                    }}
                  >
                    {!unlocked && (
                      <span className="absolute inset-0 rounded-full bg-inkSurface2 border-2 border-dashed border-inkBorderStrong flex items-center justify-center">
                        <Lock className="w-4 h-4 text-inkMuted" />
                      </span>
                    )}
                    {unlocked && c.icon && c.icon({ size: 22 })}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {equipError && <p className="text-xs text-danger">{equipError}</p>}
        {level < 5 && skinCategory !== "uni" && (
          <p className="text-[11px] text-inkMuted">Niveau actuel : {level} — encore {5 - level} niveau(x) avant de débloquer cette catégorie.</p>
        )}
      </div>

      <div className="pt-3 border-t border-inkBorder/60 flex flex-col gap-2 items-start">
        {!confirmingDelete ? (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="text-xs text-inkMuted/70 hover:text-danger transition"
          >
            Supprimer mon compte et mes données
          </button>
        ) : (
          <div className="flex flex-col gap-2 bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 max-w-md">
            <p className="text-xs text-white">
              Cette action supprime définitivement ton compte joueur (pseudo, avatar, connexion Spotify liée). Tes
              parties déjà jouées restent visibles pour les autres joueurs, mais sans être rattachées à ton compte.
              Impossible à annuler.
            </p>
            {deleteError && <p className="text-xs text-danger">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                onClick={deleteAccount}
                disabled={deleting}
                className="bg-danger text-white hover:bg-danger/90 disabled:opacity-50 transition rounded-lg px-3 py-1.5 text-xs font-bold"
              >
                {deleting ? "Suppression..." : "Confirmer la suppression"}
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="text-xs text-inkMuted hover:text-white underline transition"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="bg-inkSurface3 rounded-xl px-4 py-3 flex flex-col gap-1">
      <p className="text-xs text-inkMuted">{label}</p>
      <p className={"text-2xl font-display font-black " + (valueClassName ?? "")}>{value}</p>
    </div>
  );
}

function StatsPanel({ accountId }: { accountId: string }) {
  const { loading, error, stats } = usePlayerProfileData(accountId);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-inkSurface3 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard label="Parties jouées" value={String(stats.gamesPlayed)} />
      <StatCard label="Bonnes réponses" value={String(stats.correctAnswers)} />
      <StatCard label="Meilleur streak" value={String(stats.bestStreak)} valueClassName="text-amber" />
      <StatCard label="Taux de réussite" value={`${stats.successRate}%`} valueClassName="text-sage" />
    </div>
  );
}

const BADGE_CATEGORIES: BadgeCategory[] = ["Performance en jeu", "Assiduité", "Social", "Côté hôte"];

const TIER_COLOR: Record<string, string> = {
  or: "text-gold",
  argent: "text-silver",
  bronze: "text-bronze",
  none: "text-inkMuted",
};

const TIER_BORDER: Record<string, string> = {
  or: "border-gold",
  argent: "border-silver",
  bronze: "border-bronze",
  none: "border-dashed border-inkBorderStrong",
};

const TIER_LABEL: Record<string, string> = {
  or: "Or",
  argent: "Argent",
  bronze: "Bronze",
  none: "Verrouillé",
};

function BadgesPanel({ accountId }: { accountId: string }) {
  const { loading, error, progressByKey } = usePlayerBadges(accountId);

  if (loading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-5 gap-y-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-inkSurface3 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <ComingSoonNote>
        Les badges se débloquent en fin de partie (voir Réglages pour la connexion Spotify) — reviens ici après avoir
        joué pour voir ta progression grimper.
      </ComingSoonNote>
      {BADGE_CATEGORIES.map((category) => {
        const defs = BADGE_DEFINITIONS.filter((d) => d.category === category);
        return (
          <div key={category} className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-inkMuted">{category}</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-5 gap-y-6">
              {defs.map((def) => {
                const row = progressByKey[def.key];
                const progress = row?.progress ?? 0;
                const tier = row?.tier ?? "none";
                const next = nextThreshold(def, progress);
                return (
                  <div
                    key={def.key}
                    className={"flex flex-col items-center gap-1.5 text-center " + (tier === "none" ? "opacity-50" : "")}
                    title={def.description}
                  >
                    <div className={"w-16 h-16 rounded-full bg-inkSurface3 border-2 flex items-center justify-center " + TIER_BORDER[tier]}>
                      {tier === "none" ? (
                        <Lock className="w-5 h-5 text-inkMuted" />
                      ) : (
                        <Award className={"w-6 h-6 " + TIER_COLOR[tier]} />
                      )}
                    </div>
                    <p className="text-xs font-bold text-white">{def.label}</p>
                    <p className={"text-[11px] font-semibold " + TIER_COLOR[tier]}>{TIER_LABEL[tier]}</p>
                    <p className="text-[10px] text-inkMuted">
                      {next !== null ? `${progress} / ${next}` : `${progress} (max)`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistoriquePanel({ accountId }: { accountId: string }) {
  const { loading, error, history } = usePlayerProfileData(accountId);

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-inkSurface3 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>;
  }

  if (history.length === 0) {
    return <p className="text-xs text-inkMuted bg-inkSurface3 rounded-lg px-3 py-2">Aucune partie terminée pour l&rsquo;instant — reviens ici après ta prochaine partie !</p>;
  }

  const rankColor = (rank: number) => (rank === 1 ? "text-gold" : rank === 2 ? "text-silver" : rank === 3 ? "text-bronze" : "text-sage");
  const ordinal = (rank: number) => (rank === 1 ? "1er" : `${rank}e`);

  return (
    <div className="flex flex-col gap-2">
      {history.map((entry) => (
        <div key={entry.roomId} className="flex justify-between items-center bg-inkSurface3 rounded-xl px-4 py-3">
          <div>
            <p className="font-bold text-white">
              {new Date(entry.playedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            </p>
            <p className="text-xs text-inkMuted">
              Room {entry.roomCode} · {entry.playerCount} joueur{entry.playerCount > 1 ? "s" : ""}
            </p>
          </div>
          <span className={"font-display font-black " + rankColor(entry.rank)}>
            {ordinal(entry.rank)} · {entry.score} pts
          </span>
        </div>
      ))}
    </div>
  );
}

const PODIUM_ROW_STYLE: Record<number, string> = {
  1: "bg-gold text-goldOn",
  2: "bg-silver text-silverOn",
  3: "bg-bronze text-bronzeOn",
};

function ClassementPanel({ accountId }: { accountId: string }) {
  const { loading, error, entries } = usePlayerLeaderboard(accountId);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-11 rounded-xl bg-inkSurface3 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-inkMuted bg-inkSurface3 rounded-lg px-3 py-2">
        Pas encore de système d&rsquo;amis : ce classement rassemble pour l&rsquo;instant tous les comptes avec qui tu
        as déjà partagé au moins une partie. Une liste d&rsquo;amis explicite (ajouter/retirer qui tu veux) pourra
        remplacer ce fonctionnement plus tard.
      </p>

      {entries.length <= 1 ? (
        <p className="text-xs text-inkMuted bg-inkSurface3 rounded-lg px-3 py-2">
          Tu n&rsquo;as encore croisé aucun autre compte connecté en partie — les joueurs que tu rencontres
          apparaîtront ici après une partie jouée ensemble.
        </p>
      ) : (
        entries.map((entry, i) => {
          const rank = i + 1;
          const podiumClass = PODIUM_ROW_STYLE[rank];
          return (
            <div
              key={entry.accountId}
              className={
                "rounded-xl flex items-center justify-between pl-4 pr-5 py-2.5 " +
                (podiumClass ?? "bg-inkSurface3 text-white")
              }
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="font-display font-black w-4 shrink-0">{rank}</span>
                <span className="font-display font-bold truncate">
                  {entry.pseudo}
                  {entry.accountId === accountId ? " (toi)" : ""}
                </span>
              </span>
              <span className="font-display font-black text-sm whitespace-nowrap">Niveau {levelForXp(entry.xp)}</span>
            </div>
          );
        })
      )}
    </div>
  );
}
