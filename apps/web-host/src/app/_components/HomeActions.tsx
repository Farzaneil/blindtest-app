"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Mic2, Play, Plus, Smartphone } from "lucide-react";
import { confirmDialog } from "./ConfirmDialog";
import { endHostGame, forgetHostGame, readOngoingHostGame, type OngoingHostGame } from "../../lib/hostSession";

/**
 * Boutons principaux de l'accueil. Si l'onglet a une partie hôte en cours
 * (voir lib/hostSession.ts), on l'affiche clairement avec "Reprendre la
 * partie", et "Créer une partie" devient "Nouvelle partie" : elle termine
 * d'abord l'ancienne pour tout le monde (écran de fin + stats/badges).
 */
export function HomeActions() {
  const router = useRouter();
  const [ongoing, setOngoing] = useState<OngoingHostGame | null>(null);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readOngoingHostGame()
      .then((g) => {
        if (!cancelled) setOngoing(g);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const startNewGame = async () => {
    if (!ongoing) return;
    if (
      !(await confirmDialog({
        title: "Lancer une nouvelle partie ?",
        message: `La partie ${ongoing.room.code} sera terminée pour tout le monde. Les scores et badges sont enregistrés.`,
        confirmLabel: "Nouvelle partie",
      }))
    ) {
      return;
    }
    setEnding(true);
    await endHostGame(ongoing.room.id);
    forgetHostGame();
    router.push("/host");
  };

  const inProgress = ongoing?.room.status === "in_progress";

  return (
    <div className="w-full max-w-lg flex flex-col gap-5">
      {ongoing && (
        <section className="bg-inkSurface border-[3px] border-fg rounded-2xl shadow-sticker px-5 py-4 flex flex-col sm:flex-row items-center gap-4 text-left">
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <p className="text-xs font-extrabold uppercase tracking-wide flex items-center justify-center sm:justify-start gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-good border-2 border-fg animate-pulse" />
              {inProgress ? "Partie en cours" : "Partie en préparation"}
            </p>
            <p className="font-display text-2xl leading-tight mt-1">{ongoing.room.code}</p>
            <p className="text-sm text-inkMuted font-bold">
              {ongoing.playerCount} joueur{ongoing.playerCount > 1 ? "s" : ""}
            </p>
          </div>
          <Link
            href="/host"
            className="bg-sage text-fg border-[3px] border-fg rounded-xl shadow-sticker-sm px-5 py-3 font-display inline-flex items-center gap-2 whitespace-nowrap transition-transform hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <Play className="w-5 h-5" strokeWidth={2.5} /> Reprendre la partie
          </Link>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {ongoing ? (
          <button
            type="button"
            onClick={startNewGame}
            disabled={ending}
            className="bg-inkSurface text-fg border-[3px] border-fg rounded-2xl px-6 py-7 flex flex-col items-center gap-2 shadow-sticker transition-transform hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none disabled:opacity-60"
          >
            <Plus className="w-8 h-8" strokeWidth={2.5} />
            <span className="text-xl font-display">{ending ? "Fermeture…" : "Nouvelle partie"}</span>
            <span className="text-sm font-bold text-inkMuted">Termine celle en cours</span>
          </button>
        ) : (
          <Link
            href="/host"
            className="bg-sage text-fg border-[3px] border-fg rounded-2xl px-6 py-7 flex flex-col items-center gap-2 shadow-sticker transition-transform hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none"
          >
            <Mic2 className="w-8 h-8" strokeWidth={2.5} />
            <span className="text-xl font-display">Créer une partie</span>
            <span className="text-sm font-bold">Je suis l’hôte</span>
          </Link>
        )}
        <Link
          href="/play"
          className="bg-info text-fg border-[3px] border-fg rounded-2xl px-6 py-7 flex flex-col items-center gap-2 shadow-sticker transition-transform hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none"
        >
          <Smartphone className="w-8 h-8" strokeWidth={2.5} />
          <span className="text-xl font-display">Rejoindre</span>
          <span className="text-sm font-bold">Je suis joueur</span>
        </Link>
      </div>
    </div>
  );
}
