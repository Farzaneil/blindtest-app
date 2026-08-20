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

/**
 * Espace joueur /profil — visuel repris de la maquette validée
 * (maquette_comptes_espace_joueur.html, section 2 : 5 onglets Réglages/
 * Stats/Badges/Historique/Classement). Phase 2 du plan (voir
 * cadrage_comptes_recompenses_rgpd.md, section 7) :
 *
 *   - Réglages (pseudo + suppression de compte) et Stats/Historique
 *     tournent sur des données RÉELLES : le pseudo existe déjà sur
 *     player_accounts (migration 0020), les stats/l'historique se calculent
 *     depuis players/rounds/round_attempts, qui existent depuis le tout
 *     début du projet (migrations 0001/0008) — voir usePlayerProfileData.
 *   - Badges et Classement restent en état "Bientôt" : ils dépendent de
 *     systèmes pas encore construits (badges à paliers, XP/niveaux —
 *     phases 3 et 5 du cadrage), pas juste d'un écran à coder.
 *   - Le "Skin du buzzer" de la maquette (catégories Uni/Nature/Cosmique/
 *     Slay) est pour la même raison affiché verrouillé dans Réglages : les
 *     déblocages sont liés aux badges/niveaux, donc à la même dépendance
 *     que Badges/Classement. Idem pour le pill "Niveau X" + barre d'XP du
 *     header de la maquette : xp existe déjà en base mais vaut toujours 0
 *     aujourd'hui (rien ne l'incrémente encore) et il n'existe aucune
 *     formule de niveau — l'afficher tel quel aurait été trompeur, donc on
 *     l'omet plutôt que de l'inventer.
 */

type TabKey = "reglages" | "stats" | "badges" | "historique" | "classement";

const TABS: { key: TabKey; label: string; icon: typeof Settings }[] = [
  { key: "reglages", label: "Réglages", icon: Settings },
  { key: "stats", label: "Stats", icon: BarChart3 },
  { key: "badges", label: "Badges", icon: Award },
  { key: "historique", label: "Historique", icon: History },
  { key: "classement", label: "Classement", icon: Trophy },
];

const SKIN_CATEGORIES = ["Uni", "Nature", "Cosmique", "Slay"];

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
              <p className="font-display font-bold text-lg truncate text-white">{account.pseudo}</p>
              <p className="text-xs text-inkMuted mt-0.5">Niveaux, XP et cosmétiques du buzzer arrivent bientôt.</p>
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

        {tab === "reglages" && <ReglagesPanel accountId={account.id} pseudo={account.pseudo} onPseudoSaved={refreshAccount} />}
        {tab === "stats" && <StatsPanel accountId={account.id} />}
        {tab === "badges" && <BadgesPanel />}
        {tab === "historique" && <HistoriquePanel accountId={account.id} />}
        {tab === "classement" && <ClassementPanel />}
      </div>
    </main>
  );
}

function ReglagesPanel({
  accountId,
  pseudo,
  onPseudoSaved,
}: {
  accountId: string;
  pseudo: string;
  onPseudoSaved: () => void;
}) {
  const router = useRouter();
  const [pseudoInput, setPseudoInput] = useState(pseudo);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
        </div>
        <div className="flex gap-1.5 sm:gap-2">
          {SKIN_CATEGORIES.map((cat) => (
            <button
              key={cat}
              disabled
              className="relative flex-1 text-xs sm:text-sm font-bold px-2 sm:px-3 py-2 rounded-xl border border-inkBorder text-inkMuted bg-inkSurface3 cursor-not-allowed"
            >
              {cat}
            </button>
          ))}
        </div>
        <ComingSoonNote>
          Les skins de buzzer se débloquent avec les badges et les niveaux, qui arrivent dans une prochaine mise à
          jour — pas encore de sélection possible pour l&rsquo;instant.
        </ComingSoonNote>
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

function BadgesPanel() {
  return (
    <div className="flex flex-col gap-5">
      <ComingSoonNote>
        Les badges à paliers (bronze / argent / or) arrivent dans une prochaine mise à jour, une fois le système de
        progression en place.
      </ComingSoonNote>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-5 gap-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2 text-center opacity-50">
            <div className="w-16 h-16 rounded-full bg-inkSurface3 border-2 border-dashed border-inkBorderStrong flex items-center justify-center">
              <Lock className="w-5 h-5 text-inkMuted" />
            </div>
            <p className="text-xs font-bold text-inkMuted">Bientôt</p>
          </div>
        ))}
      </div>
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

function ClassementPanel() {
  return (
    <ComingSoonNote>
      Le classement entre joueurs arrive dans une prochaine mise à jour, avec le système de niveaux.
    </ComingSoonNote>
  );
}
