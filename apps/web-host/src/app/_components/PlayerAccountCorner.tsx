"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { UserCircle2 } from "lucide-react";
import { usePlayerAccount } from "../../lib/usePlayerAccount";
import { PlayerAvatar } from "../../lib/avatars";
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
/**
 * `inline` : le bouton prend sa place en haut de la page, dans le flux
 * (calé à droite d'un parent en flex colonne), et défile avec elle — écran
 * hôte, où une position fixe ou superposée chevauchait l'encart du code de
 * partie sur téléphone.
 */
export function PlayerAccountCorner({ inline = false }: { inline?: boolean } = {}) {
  const pos = inline ? "relative self-end" : "fixed top-4 right-4";
  useForceLoopbackHost();
  const pathname = usePathname();
  const { account, loading, refresh } = usePlayerAccount();
  // Query string conservée dans `next` : un joueur arrivé via le QR code de
  // l'hôte (/play?code=ABC123) qui se connecte à son compte doit revenir
  // sur /play avec le code toujours pré-rempli. Lue depuis window.location
  // après montage (pas useSearchParams, qui imposerait un <Suspense> sur
  // chacune des pages qui rendent ce composant).
  const [search, setSearch] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearch(window.location.search);
  }, [pathname]);

  if (loading) {
    return <div className={`${pos} z-20 h-8 w-32 rounded-full bg-inkSurface2 animate-pulse`} />;
  }

  if (!account) {
    return (
      <Link
        href={`/connexion?next=${encodeURIComponent((pathname || "/") + search)}`}
        title="Ton compte joueur (stats, badges, classement) — indépendant de la connexion Spotify de l'hôte pour la musique."
        className={`${pos} z-20 bg-inkSurface2 border border-inkBorder hover:border-fg transition rounded-full pl-3 pr-3.5 py-1.5 text-xs font-semibold text-inkMuted hover:text-fg inline-flex items-center gap-1.5`}
      >
        <UserCircle2 className="w-3.5 h-3.5" /> Compte joueur
      </Link>
    );
  }

  return (
    <div
      title="Ton compte joueur (stats, badges, classement) — indépendant de la connexion Spotify de l'hôte pour la musique."
      className={`${pos} z-20 flex items-center gap-2 bg-inkSurface border-2 border-fg shadow-sticker-sm rounded-full pl-1 pr-3 py-1`}
    >
      <Link href="/profil" className="flex items-center gap-2 min-w-0">
        <PlayerAvatar
          player={{ display_name: account.pseudo, avatar_key: account.avatarKey, avatar_color: account.avatarColor, avatar_extra: account.avatarExtra }}
          size={26}
        />
        <span className="text-xs font-semibold text-fg truncate max-w-[8rem] hover:underline">{account.pseudo}</span>
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
          await refresh();
        }}
        className="text-[11px] text-inkMuted hover:text-danger underline transition"
      >
        Déconnexion
      </button>
    </div>
  );
}
