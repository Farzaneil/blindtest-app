"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ANALYTICS_ENABLED, getStoredConsent, setStoredConsent, type ConsentValue } from "../../lib/analyticsConsent";

/**
 * Bandeau de consentement cookies — voir analyticsConsent.ts pour le
 * contexte complet. Monté globalement dans layout.tsx, mais ne s'affiche
 * concrètement que si ANALYTICS_ENABLED est un jour passé à true : tant
 * qu'aucun cookie non essentiel n'est posé, il n'y a rien à faire
 * consentir, donc rien à montrer (afficher un bandeau "on utilise des
 * cookies" sans cookie non essentiel serait juste trompeur).
 *
 * Lecture du cookie de consentement uniquement après montage (useEffect,
 * jamais pendant le rendu serveur) : document.cookie n'existe pas côté
 * serveur, et on veut de toute façon éviter tout mismatch d'hydratation.
 */
export function CookieConsentBanner() {
  const [choice, setChoice] = useState<ConsentValue | null | "loading">("loading");

  useEffect(() => {
    // Même contrainte/solution qu'ailleurs dans le projet (voir
    // usePlayerCosmetics.ts) : pas de setState synchrone dans le corps de
    // l'effet, même pour une lecture aussi immédiate qu'un cookie.
    Promise.resolve().then(() => setChoice(getStoredConsent()));
  }, []);

  if (!ANALYTICS_ENABLED || choice === "loading" || choice !== null) {
    return null;
  }

  const respond = (value: ConsentValue) => {
    setStoredConsent(value);
    setChoice(value);
  };

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4 flex justify-center">
      <div className="w-full max-w-2xl bg-inkSurface border border-inkBorderStrong rounded-2xl shadow-lg shadow-black/40 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <p className="text-sm text-white/90 flex-1">
          On utilise un cookie de mesure d’audience pour comprendre comment le site est utilisé. Tu peux
          l’accepter ou le refuser — le site fonctionne à l’identique dans les deux cas. Détails sur la{" "}
          <Link href="/confidentialite" className="underline hover:text-sage transition">
            page confidentialité
          </Link>
          .
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => respond("refused")}
            className="bg-inkSurface2 border border-inkBorder hover:border-white transition rounded-lg px-3 py-1.5 text-xs font-bold text-white"
          >
            Refuser
          </button>
          <button
            onClick={() => respond("accepted")}
            className="bg-sage text-ink hover:bg-sage/90 transition rounded-lg px-3 py-1.5 text-xs font-bold"
          >
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}
