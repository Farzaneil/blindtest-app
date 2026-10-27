import { Copyright, Database, Flag, Music2, Server, UserRound } from "lucide-react";
import { InfoCard, InfoPage } from "../_components/InfoPage";
import { ContactEmail } from "../_components/ContactEmail";
import { DATABASE, HOSTING, LEGAL_LAST_UPDATE } from "../../lib/legal";

export const metadata = { title: "Mentions légales" };

/**
 * Mentions légales (loi pour la confiance dans l'économie numérique, LCEN,
 * art. 6). Éditeur particulier, non professionnel : il peut ne pas
 * publier son identité (art. 6, III, 2), à condition que l'hébergeur la
 * détienne — l'hébergeur, lui, doit être identifié ici.
 */
export default function MentionsLegalesPage() {
  return (
    <InfoPage current="/mentions-legales" title="Mentions légales">
      <InfoCard icon={UserRound} title="Éditeur">
        <p>
          Blindtest est édité à titre non professionnel par un particulier, qui a choisi de ne pas rendre
          publique son identité, comme la loi le permet. Ses coordonnées sont connues de l’hébergeur.
        </p>
        <p>
          Contact : <ContactEmail />.
        </p>
      </InfoCard>

      <InfoCard icon={Server} title="Hébergement" tone="c2">
        <p>
          <span className="font-bold">{HOSTING.name}</span>
          <br />
          {HOSTING.address}
          <br />
          {HOSTING.phone} · {HOSTING.website}
        </p>
      </InfoCard>

      <InfoCard icon={Database} title="Données" tone="c2">
        <p>
          Base de données et connexion par e-mail : <span className="font-bold">{DATABASE.name}</span> (
          {DATABASE.website}), serveurs situés en {DATABASE.region}. Le détail des données traitées est
          sur la page Confidentialité.
        </p>
      </InfoCard>

      <InfoCard icon={Music2} title="Musique" tone="gold">
        <p>
          Les extraits musicaux de 30 secondes, les titres, les pochettes et les playlists sont fournis par
          l’API publique de Deezer. Ils restent la propriété de leurs ayants droit et ne sont jamais
          stockés par Blindtest.
        </p>
      </InfoCard>

      <InfoCard icon={Copyright} title="Propriété intellectuelle">
        <p>
          Le site, son code, son design et ses illustrations (notamment les avatars « La Bande-Son ») sont
          la propriété de l’éditeur. Toute reproduction sans autorisation est interdite.
        </p>
      </InfoCard>

      <InfoCard icon={Flag} title="Signaler un contenu" tone="danger">
        <p>
          Un pseudo ou un nom d’équipe choquant, un comportement abusif ? Écris à <ContactEmail /> en
          précisant le code de la partie et le pseudo concerné. L’hôte d’une partie peut aussi lancer une
          nouvelle partie à tout moment.
        </p>
      </InfoCard>

      <p className="text-xs font-bold text-center text-inkMuted">Dernière mise à jour : {LEGAL_LAST_UPDATE}</p>
    </InfoPage>
  );
}
