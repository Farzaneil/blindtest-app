"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserCircle2 } from "lucide-react";
import { usePlayerAccount } from "../../lib/usePlayerAccount";
import { useForceLoopbackHost } from "../../lib/useForceLoopbackHost";

/**
 * Point d'entrée du "compte joueur" (profil, stats, badges — voir
 * cadrage_comptes_recompenses_rgpd.md), rendu sur /, /play et /host.
 *
 * Positionné en `fixed` (et non `absolute`) : sur /play, une carte
 * "Rejoindre une partie" étroite servait jusque-là de parent positionné, ce
 * qui faisait chevaucher le titre avec le pill (retour utilisateur direct)
 * — `fixed` ancre systématiquement au coin de l'écran, quelle que soit la
 * taille du conteneur qui l'englobe.
 *
 * Libellé "Compte joueur" (et non "Se connecter", trop générique) : sur
 * /host, l'hôte doit déjà se connecter à Spotify pour la lecture ("Se
 * connecter à Spotify pour préparer une playlist", plus bas sur la page) —
 * un second bouton simplement intitulé "Se connecter" aurait été confondu
 * avec le même geste. Le titre (attribut title, tooltip natif) rappelle
 * explicitement qu'il s'agit d'une connexion différente, indépendante du
 * compte Spotify de lecture de l'hôte.
 *
 * Applique aussi useForceLoopbackHost ici (et pas seulement sur /host et
 * /connexion) : ce composant est rendu sur /, /play ET /host, donc
 * n'importe laquelle de ces pages est un point d'entrée possible vers
 * "Compte joueur" — retour utilisateur : rester sur localhost jusqu'à
 * /connexion laissait l'impression que "rien ne redirige plus", même si
 * le clic finissait par fonctionner. Rediriger dès la première page
 * évite toute ambiguïté, avant même que l'utilisateur ait cliqué.
 *
 * Une fois connecté, l'avatar/pseudo pointe vers /profil (nouveau, phase 2 :
 * réglages/stats/badges/historique/classement) — seul "Déconnexion" reste un
 * bouton à part, pour rester cliquable sans naviguer.
 */
export function PlayerAccountCorner() {
  useForceLoopbackHost();
  const pathname = usePathname();
  const { account, loading, refresh } = usePlayerAccount();

  if (loading) {
    return <div className="fixed top-4 right-4 z-20 h-8 w-32 rounded-full bg-inkSurface2 animate-pulse" />;
  }

  if (!account) {
    return (
      <Link
        href={`/connexion?next=${encodeURIComponent(pathname || "/")}`}
        title="Ton compte joueur (stats, badges, classement) — indépendant de la connexion Spotify de l'hôte pour la musique."
        className="fixed top-4 right-4 z-20 bg-inkSurface2 border border-inkBorder hover:border-sage transition rounded-full pl-3 pr-3.5 py-1.5 text-xs font-semibold text-inkMuted hover:text-sage inline-flex items-center gap-1.5"
      >
        <UserCircle2 className="w-3.5 h-3.5" /> Compte joueur
      </Link>
    );
  }

  return (
    <div
      title="Ton compte joueur (stats, badges, classement) — indépendant de la connexion Spotify de l'hôte pour la musique."
      className="fixed top-4 right-4 z-20 flex items-center gap-2 bg-inkSurface2 border border-inkBorder rounded-full pl-1.5 pr-3 py-1.5"
    >
      <Link href="/profil" className="flex items-center gap-2 min-w-0">
        <div className="w-5 h-5 rounded-full bg-inkSurface3 overflow-hidden flex items-center justify-center text-[10px] font-black text-sage shrink-0">
          {account.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            account.pseudo.charAt(0).toUpperCase()
          )}
        </div>
        <span className="text-xs font-semibold text-white truncate max-w-[8rem] hover:underline">{account.pseudo}</span>
      </Link>
      <button
        onClick={async () => {
          // Route en JSON, pas en redirection (voir logout/route.ts) — le
          // paramètre `next` ne servait plus qu'à une redirection jamais
          // suivie par cette page (on reste sur place, refresh() suffit).
          // try/catch : un aléa réseau ne doit jamais planter le clic
          // (voir bug remonté : TypeError: Failed to fetch non rattrapé).
          try {
            await fetch("/api/player-auth/logout", { method: "POST" });
          } catch (e) {
            console.error("[PlayerAccountCorner] déconnexion échouée", e);
          }
          refresh();
        }}
        className="text-[11px] text-inkMuted hover:text-danger underline transition"
      >
        Déconnexion
      </button>
    </div>
  );
}
