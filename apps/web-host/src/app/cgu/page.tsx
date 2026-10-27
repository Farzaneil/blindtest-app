import { AlertTriangle, FlaskConical, Gavel, Handshake, Megaphone, Music2, ScrollText, UserRound } from "lucide-react";
import Link from "next/link";
import { InfoCard, InfoPage } from "../_components/InfoPage";
import { ContactEmail } from "../_components/ContactEmail";
import { LEGAL_LAST_UPDATE, MIN_ACCOUNT_AGE } from "../../lib/legal";

export const metadata = { title: "Conditions d’utilisation" };

/**
 * Conditions générales d'utilisation, version bêta gratuite. À revoir
 * (avec un professionnel) avant toute offre payante : prix, droit de
 * rétractation, conditions de vente, accord commercial avec Deezer.
 */
export default function CguPage() {
  return (
    <InfoPage
      current="/cgu"
      title="Conditions d’utilisation"
      intro="Les règles du jeu… du site. En utilisant Blindtest, tu acceptes ces conditions."
    >
      <InfoCard icon={FlaskConical} title="Un service en bêta" tone="gold">
        <p>
          Blindtest est un service gratuit, en phase de test. Il est fourni « en l’état » : des bugs, des
          interruptions ou des changements de fonctionnalités sont possibles. Pendant la bêta, la
          progression (XP, badges, skins) pourrait exceptionnellement devoir être réinitialisée ; on fera
          tout pour l’éviter et on préviendra avant.
        </p>
      </InfoCard>

      <InfoCard icon={UserRound} title="Accès et compte">
        <p>
          On peut jouer sans compte. Le compte joueur, facultatif, est réservé aux personnes de{" "}
          {MIN_ACCOUNT_AGE} ans ou plus. Il se crée avec une adresse e-mail valide dont tu es titulaire.
          Tu restes responsable de ce qui se passe avec ton compte : ne partage pas les liens ou codes de
          connexion que tu reçois.
        </p>
        <p className="text-sm text-inkMuted">
          Tu peux supprimer ton compte à tout moment depuis ton{" "}
          <Link href="/profil" className="font-bold underline">
            profil
          </Link>
          .
        </p>
      </InfoCard>

      <InfoCard icon={Handshake} title="Bonne conduite" tone="c2">
        <p>Pour que tout le monde passe un bon moment, il est interdit :</p>
        <ul className="flex flex-col gap-1.5 text-sm list-disc pl-5">
          <li>de choisir un pseudo ou un nom d’équipe injurieux, haineux, discriminatoire ou à caractère sexuel ;</li>
          <li>d’usurper l’identité d’une autre personne ;</li>
          <li>de tricher ou de contourner le fonctionnement du jeu (scripts, requêtes automatisées, failles) ;</li>
          <li>de perturber les parties des autres ou d’utiliser le service de façon abusive.</li>
        </ul>
        <p className="text-sm text-inkMuted">
          En cas de manquement, un compte peut être suspendu ou supprimé, et les contenus concernés retirés.
        </p>
      </InfoCard>

      <InfoCard icon={Music2} title="La musique">
        <p>
          Les extraits de 30 secondes proviennent de Deezer et restent la propriété de leurs ayants droit.
          Ils ne peuvent pas être téléchargés ni réutilisés en dehors du jeu. Le catalogue peut varier : un
          morceau ou une playlist peuvent devenir indisponibles à tout moment.
        </p>
      </InfoCard>

      <InfoCard icon={Megaphone} title="Jouer en public" tone="gold">
        <p>
          Blindtest est pensé pour jouer entre proches, dans un cadre privé. Si tu organises une partie
          dans un lieu public ou lors d’un événement (bar, soirée ouverte, entreprise…), la diffusion de
          musique peut nécessiter une autorisation auprès des sociétés d’auteurs (la SACEM, en France).
          Cette démarche est à la charge de l’organisateur.
        </p>
      </InfoCard>

      <InfoCard icon={AlertTriangle} title="Responsabilité" tone="danger">
        <p>
          L’éditeur fait de son mieux pour que le service fonctionne bien, mais ne peut pas garantir qu’il
          soit disponible en permanence ni exempt d’erreurs. Sa responsabilité ne peut pas être engagée
          pour une interruption, une perte de progression ou un usage du service contraire à ces
          conditions. Chaque hôte reste responsable de la partie qu’il organise.
        </p>
      </InfoCard>

      <InfoCard icon={ScrollText} title="Données personnelles">
        <p>
          Ce que nous gardons, pourquoi et comment l’effacer :{" "}
          <Link href="/confidentialite" className="font-bold underline">
            page Confidentialité
          </Link>
          .
        </p>
      </InfoCard>

      <InfoCard icon={Gavel} title="Modifications et droit applicable" tone="c2">
        <p>
          Ces conditions peuvent évoluer, notamment à la fin de la bêta. La date de mise à jour est indiquée
          ci-dessous ; en cas de changement important, un message te préviendra. Ces conditions sont
          soumises au droit français. Une question, un désaccord ? Écris-nous d’abord à <ContactEmail />,
          on cherchera une solution à l’amiable.
        </p>
      </InfoCard>

      <p className="text-xs font-bold text-center text-inkMuted">Dernière mise à jour : {LEGAL_LAST_UPDATE}</p>
    </InfoPage>
  );
}
