import { Heart, Map, Music2, Smile, Wrench } from "lucide-react";
import { InfoCard, InfoPage } from "../_components/InfoPage";

export const metadata = { title: "À propos" };

/**
 * À propos : contexte du projet, crédits (musique, avatars), technique en
 * bref, et ce qui arrive. Gabarit commun : _components/InfoPage.
 */
export default function AboutPage() {
  return (
    <InfoPage current="/about" title="À propos">
      <InfoCard icon={Heart} title="Le projet">
        <p>
          Blindtest est né d’une envie simple : faire des blind tests entre potes sans tableur bricolé ni
          personne coincée à lancer les sons. Un écran diffuse la musique, les téléphones servent de
          buzzers, et l’appli s’occupe du chrono, des points et du classement.
        </p>
        <p className="text-sm text-inkMuted">
          C’est un projet indépendant : sans pub, et jouable sans compte.
        </p>
      </InfoCard>

      <InfoCard icon={Music2} title="La musique" tone="c2">
        <p>
          Les extraits de 30 secondes et les playlists viennent du catalogue public de Deezer : pas
          besoin de compte ni d’abonnement pour jouer. Certains morceaux n’ont pas d’extrait disponible
          (droits selon le pays) : ils ne sont tout simplement pas proposés.
        </p>
      </InfoCard>

      <InfoCard icon={Smile} title="La Bande-Son" tone="gold">
        <p>
          Les avatars sont une petite troupe d’instruments et d’objets musicaux dessinée pour l’appli, à
          habiller d’effets que tu débloques en jouant.
        </p>
      </InfoCard>

      <InfoCard icon={Wrench} title="Sous le capot">
        <p>
          Next.js pour l’interface, Supabase pour la base de données et le temps réel (les buzz et les
          scores arrivent instantanément sur tous les écrans), hébergement sur Vercel.
        </p>
      </InfoCard>

      <InfoCard icon={Map} title="Et ensuite ?" tone="good">
        <ul className="flex flex-col gap-2">
          {[
            "Des amis : les ajouter, suivre leur progression, un classement entre vous",
            "De nouveaux skins et des défis pour les débloquer",
            "Encore plus de playlists prêtes à jouer",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="w-2.5 h-2.5 mt-2 rounded-full bg-sage border-2 border-fg shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </InfoCard>
    </InfoPage>
  );
}
