"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Kazou } from "../../../lib/kazou";
import { usePlayerAccount } from "../../../lib/usePlayerAccount";
import { syncProgress } from "../../../lib/solo/progress";

/**
 * Porte d'entrée du mode solo : il faut être connecté pour jouer (la
 * progression est enregistrée sur le compte, on la retrouve sur tous ses
 * appareils). Une fois connecté, la progression du compte est récupérée et
 * fusionnée avec celle de l'appareil AVANT d'afficher la carte ou le niveau.
 */
export function SoloGate({ children }: { children: ReactNode }) {
  const { account, loading } = usePlayerAccount();
  const pathname = usePathname();
  const [syncedFor, setSyncedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    syncProgress(account.id).then(() => {
      if (!cancelled) setSyncedFor(account.id);
    });
    return () => {
      cancelled = true;
    };
  }, [account]);

  if (loading || (account && syncedFor !== account.id)) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center gap-3 bg-page">
        <Kazou who="zou" mood="joie" size={96} />
        <p className="font-display text-xl">Chargement de ta tournée…</p>
      </main>
    );
  }

  if (!account) {
    const next = encodeURIComponent(pathname || "/solo");
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center bg-logo px-4 py-10">
        <div className="w-full max-w-md flex flex-col gap-4">
          <Link
            href="/"
            aria-label="Retour à l'accueil"
            className="self-start bg-inkSurface border-[3px] border-fg rounded-full shadow-sticker-sm w-11 h-11 flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={3} />
          </Link>
          <section className="bg-inkSurface border-4 border-fg rounded-3xl shadow-sticker p-6 text-center flex flex-col items-center">
            <Kazou who="zou" mood="champion" size={110} />
            <p className="text-xs font-extrabold tracking-[0.18em] uppercase mt-2">Mode solo</p>
            <h1 className="font-display text-3xl leading-tight mt-1">Connecte-toi pour partir en tournée</h1>
            <p className="font-bold text-sm mt-3">
              Ta progression (étoiles, records, bonus, boss battus) est enregistrée sur ton compte : tu la retrouves sur tous tes appareils.
            </p>
            <Link
              href={`/connexion?next=${next}`}
              className="mt-5 w-full bg-fg text-white font-display text-xl rounded-2xl py-4 border-4 border-fg active:translate-y-0.5"
            >
              Me connecter
            </Link>
            <p className="text-xs font-semibold text-inkMuted mt-3">Gratuit, avec un simple lien reçu par e-mail.</p>
          </section>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
