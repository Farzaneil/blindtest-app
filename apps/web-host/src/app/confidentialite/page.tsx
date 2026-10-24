import { Cookie, Database, Server, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { InfoCard, InfoItem, InfoPage } from "../_components/InfoPage";

export const metadata = { title: "Confidentialité" };

/**
 * Confidentialité (RGPD) : ce qui est stocké, pourquoi, chez qui, et
 * comment l'effacer. Ne décrit que ce que fait réellement le code :
 * - compte : player_accounts (e-mail, pseudo, avatar, XP — migrations
 *   0020, 0029, 0030), badges (0021), skin équipé (0022), utilisateur
 *   Supabase Auth pour la connexion par e-mail ;
 * - suppression : api/player-account/delete (compte + utilisateur Auth) ;
 * - cookies : player_session (180 j), player_magic_verifier (le temps de
 *   la connexion), spotify_* (hôte Spotify uniquement), bt_analytics_consent
 *   (inutilisé tant qu'ANALYTICS_ENABLED = false) ;
 * - stockage du navigateur : thème (localStorage), partie en cours
 *   (sessionStorage).
 * À mettre à jour à chaque nouvelle donnée collectée.
 */
const LAST_UPDATE = "24 octobre 2026";

export default function ConfidentialitePage() {
  return (
    <InfoPage
      current="/confidentialite"
      title="Confidentialité"
      intro="Ce qui est stocké, pourquoi, et comment l’effacer. Ni revente, ni pub, ni partage avec des annonceurs."
    >
      <InfoCard icon={UserRound} title="Sans compte" tone="c2">
        <p>
          Tu peux jouer sans compte. On garde alors seulement ce qu’il faut pour faire tourner la
          partie : ton pseudo, ton score et tes réponses jugées, rattachés à la partie et visibles par
          ses participants.
        </p>
      </InfoCard>

      <InfoCard icon={Database} title="Avec un compte joueur">
        <InfoItem title="Ton adresse e-mail">
          Elle sert uniquement à te connecter (lien ou code envoyé par e-mail). Elle n’est jamais
          affichée aux autres joueurs, et tu ne recevras aucune newsletter.
        </InfoItem>
        <InfoItem title="Pseudo et avatar">
          Pour te reconnaître en partie, au classement et sur les podiums.
        </InfoItem>
        <InfoItem title="Progression">
          XP, niveau, badges et skin équipé, calculés à la fin de chaque partie à partir de tes
          résultats.
        </InfoItem>
        <InfoItem title="Historique et stats">
          Les parties auxquelles tu as participé avec ton compte (date, place, score), pour ton profil.
        </InfoItem>
        <p className="text-sm text-inkMuted">
          Base légale : ton consentement, donné en créant volontairement ton compte. Les données sont
          conservées tant que le compte existe.
        </p>
      </InfoCard>

      <InfoCard icon={Cookie} title="Cookies et stockage" tone="gold">
        <p>
          Uniquement ce qui est nécessaire au fonctionnement, donc sans bandeau de consentement :
        </p>
        <ul className="flex flex-col gap-1.5 text-sm">
          <li>
            <span className="font-bold">Session joueur</span> : te garde connecté jusqu’à 6 mois.
          </li>
          <li>
            <span className="font-bold">Connexion par e-mail</span> : un cookie temporaire, le temps de
            valider le lien ou le code.
          </li>
          <li>
            <span className="font-bold">Côté hôte</span> : la partie en cours (pour la reprendre après un
            rechargement) et, si l’hôte utilise Spotify, sa connexion Spotify.
          </li>
          <li>
            <span className="font-bold">Préférences</span> : la couleur de fond choisie, gardée dans ton
            navigateur.
          </li>
        </ul>
        <p className="text-sm text-inkMuted">
          Aucun outil de mesure d’audience pour l’instant. S’il y en a un un jour, un bandeau te demandera
          ton accord avant, et le site marchera pareil si tu refuses.
        </p>
      </InfoCard>

      <InfoCard icon={Server} title="Qui héberge quoi" tone="c2">
        <ul className="flex flex-col gap-1.5 text-sm">
          <li>
            <span className="font-bold">Supabase</span> : base de données et connexion par e-mail.
          </li>
          <li>
            <span className="font-bold">Vercel</span> : hébergement du site.
          </li>
          <li>
            <span className="font-bold">Brevo</span> : envoi des e-mails de connexion.
          </li>
          <li>
            <span className="font-bold">Deezer</span> : extraits musicaux. Les requêtes passent par nos
            serveurs, Deezer ne reçoit aucune donnée te concernant.
          </li>
        </ul>
      </InfoCard>

      <InfoCard icon={Trash2} title="Tes droits" tone="danger">
        <p>
          Tu peux supprimer ton compte quand tu veux, sans te justifier : dans ton{" "}
          <Link href="/profil" className="font-bold underline">
            profil
          </Link>
          , onglet Réglages, « Supprimer mon compte et mes données ». Ton adresse e-mail, ton pseudo, ton
          avatar et ta progression sont alors effacés définitivement. Les parties déjà jouées restent
          visibles pour les autres participants, mais ne sont plus rattachées à toi.
        </p>
        <p className="text-sm text-inkMuted">
          Pour toute autre demande (accès, rectification), le plus simple est de passer par la personne
          qui t’a invité à jouer.
        </p>
      </InfoCard>

      <p className="text-xs font-bold text-center text-inkMuted">Dernière mise à jour : {LAST_UPDATE}</p>
    </InfoPage>
  );
}
