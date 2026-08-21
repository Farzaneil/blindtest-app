import Link from "next/link";
import { ChevronLeft, Database, Cookie, Trash2 } from "lucide-react";

/**
 * Page confidentialité (RGPD) — Phase 6 du plan cadrage_comptes_
 * recompenses_rgpd.md (section 6) : une page simple et transparente, pas
 * un pavé juridique, qui explique ce qui est stocké, pourquoi, et comment
 * l'effacer. Même logique et même direction visuelle que /rules et
 * /about : composant serveur statique, cartes à bandelette de couleur.
 *
 * Le contenu ci-dessous reflète l'implémentation réelle (voir migrations
 * 0020 à 0023, playerAuth.ts, api/player-account/*) plutôt qu'un texte
 * générique : rien n'est décrit ici qui ne soit pas vraiment fait dans le
 * code, notamment sur les jetons Spotify (protégés par les règles d'accès
 * de la base, jamais envoyés au navigateur — pas de claim de chiffrement
 * applicatif qui n'existe pas).
 */
export default function ConfidentialitePage() {
  return (
    <main className="flex flex-col items-center min-h-screen gap-8 p-6 md:p-10 bg-ink">
      <div className="w-full max-w-2xl text-center">
        <Link
          href="/"
          className="text-sm text-inkMuted hover:text-sage transition inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Accueil
        </Link>
        <p className="text-3xl md:text-4xl font-black text-white mt-4 font-display">Confidentialité</p>
        <p className="text-inkMuted mt-2 text-sm">
          Blindtest est un projet perso, sans structure commerciale ni finalité publicitaire. Cette page
          liste simplement ce qui est stocké, pourquoi, et comment l’effacer.
        </p>
      </div>

      <div className="w-full max-w-2xl flex flex-col gap-5">
        <section className="relative bg-inkSurface border border-inkBorder rounded-2xl p-6">
          <span className="absolute top-0 left-5 right-5 h-1 rounded-b-md bg-sage" />
          <p className="text-lg font-bold text-sage mb-3 font-display flex items-center gap-2">
            <Database className="w-5 h-5" /> Ce qui est stocké, et pourquoi
          </p>
          <ul className="flex flex-col gap-3 text-white/90">
            <li>
              <span className="font-semibold text-white">Pseudo et avatar</span> — repris depuis ton compte
              Spotify au moment de la connexion, pour t’identifier auprès des autres joueurs (classement,
              historique de parties).
            </li>
            <li>
              <span className="font-semibold text-white">XP, niveau, badges et cosmétiques débloqués</span> —
              calculés à la fin de chaque partie à partir de tes résultats, pour faire vivre l’espace joueur
              (progression, skins de buzzer) d’une soirée à l’autre.
            </li>
            <li>
              <span className="font-semibold text-white">Jetons de connexion Spotify</span> — stockés
              uniquement côté serveur, protégés par les règles d’accès de la base : ni toi ni les autres
              joueurs n’y avez accès depuis l’application. Ils servent uniquement à parler à l’API Spotify en
              ton nom (lecture des morceaux) et ne sont jamais affichés.
            </li>
          </ul>
          <p className="text-white/70 text-sm mt-3">
            Ces données ne sont ni revendues, ni partagées avec un tiers, ni utilisées à des fins publicitaires.
            Base légale : ton consentement, donné en te connectant volontairement avec ton compte Spotify.
          </p>
        </section>

        <section className="relative bg-inkSurface border border-inkBorder rounded-2xl p-6">
          <span className="absolute top-0 left-5 right-5 h-1 rounded-b-md bg-info" />
          <p className="text-lg font-bold text-info mb-3 font-display flex items-center gap-2">
            <Cookie className="w-5 h-5" /> Cookies
          </p>
          <p className="text-white/90">
            Aujourd’hui, le site pose un seul cookie : un cookie de session qui te garde connecté à ton
            compte joueur. C’est un cookie strictement nécessaire au fonctionnement du site — il ne
            demande pas de consentement, au même titre que n’importe quel cookie de connexion.
          </p>
          <p className="text-white/70 text-sm mt-3">
            Si un outil de mesure d’audience est ajouté un jour, un bandeau te demandera explicitement ton
            accord avant de poser le moindre cookie non essentiel, et tu pourras l’accepter ou le refuser
            librement — le site fonctionnera à l’identique dans les deux cas.
          </p>
        </section>

        <section className="relative bg-inkSurface border border-inkBorder rounded-2xl p-6">
          <span className="absolute top-0 left-5 right-5 h-1 rounded-b-md bg-danger" />
          <p className="text-lg font-bold text-danger mb-3 font-display flex items-center gap-2">
            <Trash2 className="w-5 h-5" /> Tes droits
          </p>
          <p className="text-white/90">
            Tu peux supprimer ton compte et tes données à tout moment, sans avoir à te justifier : rends-toi
            dans <span className="font-semibold text-white">/profil → Réglages → « Supprimer mon compte et
            mes données »</span>. Ton pseudo, ton avatar et ta connexion Spotify sont alors définitivement
            effacés. Les parties déjà jouées restent visibles pour les autres joueurs (scores, classement de
            manche), mais ne sont plus rattachées à ton compte.
          </p>
          <p className="text-white/70 text-sm mt-3">
            Ce projet n’a ni structure commerciale ni délégué à la protection des données : c’est un outil
            perso, développé pour jouer entre amis. Pour toute question sur tes données, le plus simple est
            d’en parler directement avec la personne qui héberge tes parties.
          </p>
        </section>
      </div>
    </main>
  );
}
