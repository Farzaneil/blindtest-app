import {
  Clock,
  Dice5,
  Flame,
  Gamepad2,
  Music2,
  QrCode,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { InfoCard, InfoItem, InfoPage, Pill } from "../_components/InfoPage";

export const metadata = { title: "Règles du jeu" };

/**
 * Règles du jeu, à partager avant une soirée. Contenu aligné sur le
 * comportement réel (seuils bonus/malus : migrations 0017-0019, joker :
 * JOKER_ROUND_PROBABILITY dans lib/rooms.ts, équipes : 0025, progression :
 * lib/badges.ts et lib/cosmetics.tsx). Gabarit commun : _components/InfoPage.
 */
export default function RulesPage() {
  return (
    <InfoPage
      current="/rules"
      title="Règles du jeu"
      intro="Un écran hôte diffuse la musique, chaque joueur buzze depuis son téléphone. Rien à installer."
    >
      <InfoCard icon={Music2} title="Le principe">
        <p>
          L’hôte lance un extrait. Dès que tu penses connaître le titre et/ou l’artiste, tu buzzes : le
          premier buzz coupe la musique et te donne la parole pour répondre à voix haute. L’hôte juge ta
          réponse.
        </p>
      </InfoCard>

      <InfoCard icon={QrCode} title="Rejoindre une partie" tone="c2">
        <p>
          Scanne le QR code affiché par l’hôte, ou ouvre la page « Rejoindre » et tape le code à 6
          caractères. Choisis un pseudo (il doit être unique dans la partie), et c’est parti.
        </p>
        <p className="text-sm text-inkMuted">
          Tu as fermé l’onglet ou changé de téléphone ? Reviens avec le même pseudo : avec un compte, tu
          retrouves ta place automatiquement ; en invité, l’hôte valide ton retour et tu récupères ton
          score.
        </p>
      </InfoCard>

      <InfoCard icon={Gamepad2} title="Deux modes de jeu">
        <InfoItem title="Maître du jeu">
          Une personne anime sans jouer : elle voit tous les titres à l’avance et juge les réponses.
        </InfoItem>
        <InfoItem title="Tout le monde participe">
          Les morceaux restent masqués (« Morceau 1 », « Morceau 2 »…), y compris pour l’hôte, qui peut
          jouer aussi avec un buzzer sur son propre écran.
        </InfoItem>
        <p className="text-sm text-inkMuted">Le mode est choisi avant de lancer la partie et ne change plus ensuite.</p>
      </InfoCard>

      <InfoCard icon={Users} title="En solo ou en équipes" tone="c2">
        <p>
          En équipes, l’hôte répartit les joueurs (glisser-déposer). Chacun buzze depuis son téléphone,
          et le score de l’équipe est la somme des points de ses membres. Les séries (bonus et malus)
          comptent pour toute l’équipe.
        </p>
      </InfoCard>

      <InfoCard icon={Trophy} title="Le score" tone="gold">
        <div className="flex flex-wrap gap-2">
          <Pill tone="c1">+2 titre et artiste</Pill>
          <Pill tone="c2">+1 un seul des deux</Pill>
          <Pill tone="danger">-1 rien de bon</Pill>
        </div>
        <p>
          En <span className="font-bold">Maître du jeu</span>, tant que titre et artiste ne sont pas
          tous les deux trouvés, la musique reprend là où elle s’était arrêtée : les autres peuvent
          tenter leur chance (celui qui vient de répondre attend qu’un autre ait buzzé). En{" "}
          <span className="font-bold">Tout le monde participe</span>, la manche s’arrête après la
          première réponse. Le score peut devenir négatif.
        </p>
      </InfoCard>

      <InfoCard icon={Clock} title="Le temps" tone="c2">
        <p>
          Chaque extrait dure 30 secondes, avec un compte à rebours sur l’écran de l’hôte et sur ton
          téléphone. Il se fige pendant qu’une réponse est jugée. Si personne n’a buzzé à la fin, la
          réponse s’affiche et la manche se termine sans points.
        </p>
      </InfoCard>

      <InfoCard icon={Target} title="Fin de partie">
        <p>
          Par défaut, on joue toute la playlist. L’hôte peut aussi fixer un score cible (le premier qui
          l’atteint gagne) et/ou un nombre maximum de morceaux. À la fin : podium, buzzeur le plus
          rapide et quelques distinctions.
        </p>
      </InfoCard>

      <InfoCard icon={Dice5} title="Bonus et malus" tone="gold">
        <p className="text-sm text-inkMuted">Tous activés par défaut, l’hôte peut les couper à tout moment.</p>
        <InfoItem icon={Dice5} title="Manche joker">
          Environ 1 manche sur 10 : points doublés dans les deux sens (+4 pour une réponse complète, -2
          pour une mauvaise).
        </InfoItem>
        <InfoItem icon={Zap} title="Bonus vitesse">
          +1 point pour une réponse complète buzzée en moins de 2 secondes.
        </InfoItem>
        <InfoItem icon={TrendingUp} title="Bonus remontada">
          +1 point pour une bonne réponse quand tu es seul·e dernier·ère, à plus de 5 points de
          l’avant-dernier.
        </InfoItem>
        <InfoItem icon={Flame} title="Malus série">
          3 bonnes réponses d’affilée : ton buzzer est retardé de 5 s, puis 10 s, puis 15 s, jusqu’à ce
          que quelqu’un d’autre réponde juste.
        </InfoItem>
        <InfoItem icon={XCircle} title="Malus buzzer bloqué">
          3 premiers buzz ratés d’affilée : ton buzzer est bloqué pendant la manche suivante.
        </InfoItem>
      </InfoCard>

      <InfoCard icon={Sparkles} title="Avec un compte joueur" tone="good">
        <p>
          Facultatif, il suffit d’une adresse e-mail. Tes parties te rapportent de l’XP (ton score de fin
          de partie, plus un bonus à chaque palier de badge). Tu montes de niveau, tu débloques des
          badges, des skins de buzzer et des effets d’avatar, et tu retrouves tes stats et ton historique
          dans ton profil.
        </p>
      </InfoCard>
    </InfoPage>
  );
}
