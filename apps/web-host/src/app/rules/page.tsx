import Link from "next/link";
import { ChevronLeft, Music2, Gamepad2, Trophy, Clock, Dice5, Zap, TrendingUp, Flame, XCircle, UserPlus } from "lucide-react";

/**
 * Page statique expliquant les règles du jeu — utile à partager avant une
 * soirée pour que tout le monde comprenne les modes, le score de base et
 * les bonus/malus sans avoir à les réexpliquer à voix haute à chaque fois.
 * Composant serveur, pas d'interactivité au-delà des liens.
 *
 * Migrée vers la direction visuelle "minimal premium sombre" v3 (voir /,
 * /host, /play — même refonte) : palette ink/sage, icônes lucide au lieu
 * des emoji, cartes à bandelette de couleur. Contenu remis à jour en même
 * temps (les bonus/malus n'existaient pas lors de la première rédaction).
 */
export default function RulesPage() {
  return (
    <main className="flex flex-col items-center min-h-screen gap-8 p-6 md:p-10 bg-ink">
      <div className="w-full max-w-2xl text-center">
        <Link
          href="/"
          className="text-sm text-inkMuted hover:text-sage transition inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Accueil
        </Link>
        <p className="text-3xl md:text-4xl font-black text-white mt-4 font-display">Règles du jeu</p>
      </div>

      <div className="w-full max-w-2xl flex flex-col gap-5">
        <section className="relative bg-inkSurface border border-inkBorder rounded-2xl p-6">
          <span className="absolute top-0 left-5 right-5 h-1 rounded-b-md bg-sage" />
          <p className="text-lg font-bold text-sage mb-3 font-display flex items-center gap-2">
            <Music2 className="w-5 h-5" /> Le principe
          </p>
          <p className="text-white/90">
            L’hôte lance un morceau depuis Spotify. Les joueurs buzzent depuis leur téléphone dès
            qu’ils pensent connaître le titre et/ou l’artiste. Le premier à buzzer coupe le son et
            a la parole pour donner sa réponse à voix haute.
          </p>
        </section>

        <section className="relative bg-inkSurface border border-inkBorder rounded-2xl p-6">
          <span className="absolute top-0 left-5 right-5 h-1 rounded-b-md bg-info" />
          <p className="text-lg font-bold text-info mb-4 font-display flex items-center gap-2">
            <Gamepad2 className="w-5 h-5" /> Deux modes de jeu
          </p>
          <div className="flex flex-col gap-4">
            <div>
              <p className="font-bold font-display">Maître du jeu</p>
              <p className="text-white/90">
                Une personne gère la partie (playlist, manches) sans jouer elle-même : elle voit
                tous les titres à l’avance. Utile en soirée avec quelqu’un qui anime.
              </p>
            </div>
            <div>
              <p className="font-bold font-display">Tout le monde participe</p>
              <p className="text-white/90">
                Les morceaux de la file d’attente restent masqués (juste “Morceau 1”, “Morceau
                2”…) pour que personne ne se spoile, y compris l’hôte s’il joue aussi.
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-inkBorder flex items-start gap-2">
            <UserPlus className="w-4 h-4 text-inkMuted shrink-0 mt-0.5" />
            <p className="text-sm text-inkMuted">
              En mode “Tout le monde participe”, l’hôte peut choisir de jouer aussi sur le même
              écran, avant le lancement de la première manche : il devient alors un joueur noté
              comme les autres, avec un buzzer sur son propre écran.
            </p>
          </div>
        </section>

        <section className="relative bg-inkSurface border border-inkBorder rounded-2xl p-6">
          <span className="absolute top-0 left-5 right-5 h-1 rounded-b-md bg-gold" />
          <p className="text-lg font-bold text-gold mb-4 font-display flex items-center gap-2">
            <Trophy className="w-5 h-5" /> Le score de base
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="rounded-full bg-sage text-sageOn font-display font-bold text-sm px-4 py-1.5">
              +2 titre et artiste
            </span>
            <span className="rounded-full bg-info text-infoOn font-display font-bold text-sm px-4 py-1.5">
              +1 un seul des deux
            </span>
            <span className="rounded-full bg-danger text-white font-display font-bold text-sm px-4 py-1.5">
              -1 aucun des deux
            </span>
          </div>
          <p className="text-white/90">
            En mode <span className="font-bold">Maître du jeu</span>, tant que titre et artiste ne
            sont pas tous les deux trouvés, la musique reprend là où elle s’était arrêtée pour
            laisser une autre chance — le joueur qui vient de répondre doit attendre qu’un autre
            buzze avant de pouvoir retenter. En mode{" "}
            <span className="font-bold">Tout le monde participe</span>, la manche se termine dans
            tous les cas dès le premier buzz. Le score peut descendre en négatif.
          </p>
        </section>

        <section className="relative bg-inkSurface border border-inkBorder rounded-2xl p-6">
          <span className="absolute top-0 left-5 right-5 h-1 rounded-b-md bg-amber" />
          <p className="text-lg font-bold text-amber mb-4 font-display flex items-center gap-2">
            <Dice5 className="w-5 h-5" /> Bonus et malus
          </p>
          <p className="text-white/90 mb-4">
            L’hôte peut activer ou désactiver chacun de ces réglages à tout moment pendant la
            partie (tous activés par défaut) :
          </p>
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <Dice5 className="w-4 h-4 text-amber shrink-0 mt-1" />
              <div>
                <p className="font-bold font-display">Manche joker</p>
                <p className="text-white/90 text-sm">
                  Environ 1 manche sur 10 double les points, dans les deux sens (bonne réponse
                  complète : 4 pts au lieu de 2 ; mauvaise réponse : -2 au lieu de -1).
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Zap className="w-4 h-4 text-sage shrink-0 mt-1" />
              <div>
                <p className="font-bold font-display">Bonus vitesse</p>
                <p className="text-white/90 text-sm">
                  +1 point si la réponse complète (titre + artiste) est buzzée en moins de 2
                  secondes.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <TrendingUp className="w-4 h-4 text-sage shrink-0 mt-1" />
              <div>
                <p className="font-bold font-display">Bonus remontada</p>
                <p className="text-white/90 text-sm">
                  +1 point si tu réponds juste alors que tu es strictement dernier·ère au
                  classement, avec plus de 5 points d’écart avec l’avant-dernier.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Flame className="w-4 h-4 text-danger shrink-0 mt-1" />
              <div>
                <p className="font-bold font-display">Malus série</p>
                <p className="text-white/90 text-sm">
                  3 bonnes réponses d’affilée par la même personne : son buzzer est retardé de 5s,
                  puis 10s, puis 15s au tour suivant, tant que personne d’autre n’a répondu juste.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <XCircle className="w-4 h-4 text-danger shrink-0 mt-1" />
              <div>
                <p className="font-bold font-display">Malus buzzer bloqué</p>
                <p className="text-white/90 text-sm">
                  3 premiers-buzz ratés d’affilée par la même personne : son buzzer est
                  complètement bloqué à la manche suivante.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="relative bg-inkSurface border border-inkBorder rounded-2xl p-6">
          <span className="absolute top-0 left-5 right-5 h-1 rounded-b-md bg-info" />
          <p className="text-lg font-bold text-info mb-3 font-display flex items-center gap-2">
            <Clock className="w-5 h-5" /> Le temps
          </p>
          <p className="text-white/90">
            Chaque manche dure 30 secondes. Si personne n’a buzzé à la fin du compte à rebours, la
            réponse s’affiche et la manche se termine sans gagnant. Le temps de jugement d’une
            réponse n’est jamais décompté du budget de 30 secondes.
          </p>
        </section>
      </div>
    </main>
  );
}
