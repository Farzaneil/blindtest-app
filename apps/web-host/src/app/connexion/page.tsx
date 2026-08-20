"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useForceLoopbackHost } from "../../lib/useForceLoopbackHost";

/**
 * Écran de connexion joueur — visuel repris de la maquette validée
 * (maquette_comptes_espace_joueur.html, section 1). Spotify est le seul
 * provider actif ; Deezer/Apple Music/YouTube Music sont affichés grisés
 * "Bientôt" pour poser l'attente du multi-provider sans attendre d'avoir
 * ces intégrations branchées (voir cadrage_comptes_recompenses_rgpd.md,
 * section 1).
 *
 * `next` (où revenir une fois connecté, ou en cliquant "Continuer en
 * invité") est repris tel quel du point d'entrée qui a mené ici (voir
 * PlayerAccountCorner) et repropagé jusqu'au callback OAuth via un cookie
 * côté serveur (voir api/player-auth/login).
 *
 * Le contenu réel est dans ConnexionForm, séparé du composant exporté par
 * défaut et enveloppé dans <Suspense> : useSearchParams() dans un composant
 * client DOIT être sous une frontière Suspense, sinon `next build` échoue
 * avec "useSearchParams() should be wrapped in a suspense boundary" au
 * moment de générer les pages — même avec `dynamic = "force-dynamic"` sur
 * la page, qui ne dispense pas de cette règle. Repéré au premier `next
 * build` réel de ce fichier (jusqu'ici seulement testé via `npm run dev`,
 * qui ne fait pas cette vérification).
 */
export default function ConnexionPage() {
  return (
    <Suspense fallback={null}>
      <ConnexionForm />
    </Suspense>
  );
}

function ConnexionForm() {
  // Même garde-fou que /host (voir useForceLoopbackHost) : les cookies
  // PKCE posés ici (voir api/player-auth/login) doivent être relisibles au
  // retour du callback Spotify, qui n'existe qu'en 127.0.0.1 (policy
  // Spotify depuis fin 2025) — sans ce redirect immédiat, arriver ici via
  // "localhost" cassait la connexion joueur avec "État OAuth invalide",
  // exactement le bug déjà connu et corrigé côté hôte.
  useForceLoopbackHost();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const error = searchParams.get("error");

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-4 p-6 bg-ink">
      <div className="relative w-full max-w-sm bg-inkSurface border border-inkBorder rounded-2xl p-7 flex flex-col gap-4">
        <span className="absolute top-0 left-7 right-7 h-1 rounded-b-md bg-sage" />

        <div className="text-center">
          <p className="text-2xl font-bold font-display text-white">Connecte-toi</p>
          <p className="text-sm text-inkMuted mt-1">
            Sauvegarde tes stats, débloque des badges, grimpe au classement.
          </p>
        </div>

        {error && (
          <p className="text-danger text-xs text-center bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <a
          href={`/api/player-auth/login?next=${encodeURIComponent(next)}`}
          className="bg-sage text-sageOn hover:bg-sage/90 transition rounded-xl py-3 font-bold flex items-center justify-center gap-2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="10" />
            <path d="M7 10c3-1 7-1 10 1" stroke="#06110A" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            <path d="M7.5 13c2.5-.8 6-.6 8.5.8" stroke="#06110A" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            <path d="M8 16c2-.6 4.5-.4 6.5.8" stroke="#06110A" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </svg>
          Continuer avec Spotify
        </a>

        <div className="flex flex-col gap-2">
          <button
            disabled
            className="relative bg-inkSurface2 border border-deezer/40 text-white rounded-xl py-3 font-bold flex items-center justify-center gap-2 cursor-not-allowed"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" className="text-deezer">
              <rect x="2" y="14" width="3" height="6" fill="currentColor" />
              <rect x="7" y="10" width="3" height="10" fill="currentColor" />
              <rect x="12" y="6" width="3" height="14" fill="currentColor" />
              <rect x="17" y="10" width="3" height="10" fill="currentColor" />
            </svg>
            Deezer
            <span className="absolute right-3 bg-inkSurface3 text-inkMuted text-[11px] font-semibold px-2 py-0.5 rounded-full">
              Bientôt
            </span>
          </button>
          <button
            disabled
            className="relative bg-inkSurface2 border border-appleMusic/40 text-white rounded-xl py-3 font-bold flex items-center justify-center gap-2 cursor-not-allowed"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-appleMusic">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            Apple Music
            <span className="absolute right-3 bg-inkSurface3 text-inkMuted text-[11px] font-semibold px-2 py-0.5 rounded-full">
              Bientôt
            </span>
          </button>
          <button
            disabled
            className="relative bg-inkSurface2 border border-ytMusic/40 text-white rounded-xl py-3 font-bold flex items-center justify-center gap-2 cursor-not-allowed"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" className="text-ytMusic">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <polygon points="10,8.5 16,12 10,15.5" fill="currentColor" />
            </svg>
            YouTube Music
            <span className="absolute right-3 bg-inkSurface3 text-inkMuted text-[11px] font-semibold px-2 py-0.5 rounded-full">
              Bientôt
            </span>
          </button>
        </div>

        <Link href={next} className="text-sm text-inkMuted hover:text-white underline transition self-center mt-1">
          Continuer en invité
        </Link>
        <Link
          href="/"
          className="text-xs text-inkMuted hover:text-sage underline transition inline-flex items-center gap-1 self-center"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Accueil
        </Link>
      </div>
    </main>
  );
}
