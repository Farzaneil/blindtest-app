import { Clock, Cookie, Database, Scale, Server, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { InfoCard, InfoItem, InfoPage } from "../_components/InfoPage";
import { ContactEmail } from "../_components/ContactEmail";
import { DATABASE, LEGAL_LAST_UPDATE, MIN_ACCOUNT_AGE } from "../../lib/legal";

export const metadata = { title: "Confidentialité" };

/**
 * Confidentialité (RGPD) : ce qui est stocké, pourquoi, chez qui, combien
 * de temps, et comment l'effacer. Ne décrit que ce que fait réellement le
 * code :
 * - compte : player_accounts (e-mail, pseudo, avatar, XP — migrations
 *   0020, 0029, 0030 ; e-mail illisible par les clients depuis 0034),
 *   badges (0021), skin équipé (0022), utilisateur Supabase Auth ;
 * - suppression : api/player-account/delete (compte + utilisateur Auth) ;
 * - durées de conservation : purge automatique (migration 0035) ;
 * - cookies : player_session (180 j), player_magic_verifier (1 h),
 *   spotify_* (hôte Spotify uniquement), bt_analytics_consent (inutilisé
 *   tant qu'ANALYTICS_ENABLED = false) ;
 * - stockage du navigateur : thème (localStorage), partie en cours et
 *   jeton d'hôte (sessionStorage).
 * À mettre à jour à chaque nouvelle donnée collectée.
 */
export default function ConfidentialitePage() {
  return (
    <InfoPage
      current="/confidentialite"
      title="Confidentialité"
      intro="Ce qui est stocké, pourquoi, combien de temps, et comment l’effacer. Ni revente, ni pub, ni partage avec des annonceurs."
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
        <InfoItem title="Pseudo et avatar">Pour te reconnaître en partie, au classement et sur les podiums.</InfoItem>
        <InfoItem title="Progression">
          XP, niveau, badges et skin équipé, calculés à la fin de chaque partie à partir de tes résultats.
        </InfoItem>
        <InfoItem title="Historique et stats">
          Les parties auxquelles tu as participé avec ton compte (date, place, score), pour ton profil.
        </InfoItem>
        <p className="text-sm text-inkMuted">
          La création d’un compte est réservée aux personnes de {MIN_ACCOUNT_AGE} ans ou plus.
        </p>
      </InfoCard>

      <InfoCard icon={Scale} title="Pourquoi on a le droit" tone="c2">
        <p>
          Ces données sont nécessaires pour te fournir le service que tu demandes (jouer, garder ta
          progression), dans le cadre des{" "}
          <Link href="/cgu" className="font-bold underline">
            conditions d’utilisation
          </Link>
          . Elles ne servent à rien d’autre : pas de publicité, pas de profilage, pas de revente.
        </p>
      </InfoCard>

      <InfoCard icon={Clock} title="Combien de temps" tone="gold">
        <ul className="flex flex-col gap-1.5 text-sm">
          <li>
            <span className="font-bold">Compte joueur</span> : tant que tu l’utilises. Sans aucune connexion
            pendant 3 ans, il est supprimé automatiquement.
          </li>
          <li>
            <span className="font-bold">Parties</span> (pseudos, scores, réponses) : supprimées
            automatiquement 12 mois après la partie. Ton XP et tes badges, eux, restent sur ton compte.
          </li>
          <li>
            <span className="font-bold">Compteurs anti-abus</span> (adresse IP, e-mail) : effacés au bout
            d’un jour au plus.
          </li>
        </ul>
      </InfoCard>

      <InfoCard icon={Cookie} title="Cookies et stockage" tone="gold">
        <p>Uniquement ce qui est nécessaire au fonctionnement, donc sans bandeau de consentement :</p>
        <ul className="flex flex-col gap-1.5 text-sm">
          <li>
            <span className="font-bold">Session joueur</span> : te garde connecté jusqu’à 6 mois.
          </li>
          <li>
            <span className="font-bold">Connexion par e-mail</span> : un cookie temporaire (1 heure au plus),
            le temps de valider le lien ou le code.
          </li>
          <li>
            <span className="font-bold">Côté hôte</span> : la partie en cours et sa clé de pilotage, gardées
            dans l’onglet, et, si l’hôte utilise Spotify, sa connexion Spotify.
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
            <span className="font-bold">Supabase</span> : base de données et connexion par e-mail, serveurs
            en {DATABASE.region}.
          </li>
          <li>
            <span className="font-bold">Brevo</span> (France) : envoi des e-mails de connexion.
          </li>
          <li>
            <span className="font-bold">Vercel</span> (États-Unis) : hébergement du site. Les pages et les
            requêtes passent par ses serveurs ; ce transfert est encadré par les garanties prévues par le
            RGPD (clauses contractuelles types de la Commission européenne).
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
          visibles pour leurs participants jusqu’à leur suppression automatique, sans être rattachées à
          toi.
        </p>
        <p>
          Tu peux aussi demander à accéder à tes données, les corriger, les récupérer ou t’opposer à leur
          utilisation en écrivant à <ContactEmail />. Réponse sous un mois au plus.
        </p>
        <p className="text-sm text-inkMuted">
          Si tu estimes que tes droits ne sont pas respectés, tu peux adresser une réclamation à la CNIL
          (cnil.fr).
        </p>
      </InfoCard>

      <p className="text-xs font-bold text-center text-inkMuted">Dernière mise à jour : {LEGAL_LAST_UPDATE}</p>
    </InfoPage>
  );
}
