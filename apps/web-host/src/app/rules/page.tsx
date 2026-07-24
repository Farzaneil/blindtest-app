import Link from "next/link";

/**
 * Page statique expliquant les règles du jeu — utile à partager avant une
 * soirée pour que tout le monde comprenne les 2 modes et le système de
 * score sans avoir à le réexpliquer à voix haute à chaque fois. Composant
 * serveur, pas d'interactivité au-delà des liens.
 */
export default function RulesPage() {
  return (
    <main className="flex flex-col items-center min-h-screen gap-8 p-6 md:p-10">
      <div className="w-full max-w-2xl text-center">
        <Link href="/" className="text-sm text-muted hover:text-accentSoft underline transition">
          ← Accueil
        </Link>
        <p className="text-3xl md:text-4xl font-black text-accentSoft mt-4">Règles du jeu</p>
      </div>

      <div className="w-full max-w-2xl flex flex-col gap-6">
        <section className="bg-surface border border-surfaceBorder rounded-3xl p-6">
          <p className="text-xl font-bold text-accentSoft mb-3">🎵 Le principe</p>
          <p className="text-white/90">
            L’hôte lance un morceau depuis Spotify. Les joueurs buzzent depuis leur téléphone dès
            qu’ils pensent connaître le titre et/ou l’artiste. Le premier à buzzer coupe le son et
            a la parole pour donner sa réponse à voix haute.
          </p>
        </section>

        <section className="bg-surface border border-surfaceBorder rounded-3xl p-6">
          <p className="text-xl font-bold text-accentSoft mb-3">🕹️ Deux modes de jeu</p>
          <div className="flex flex-col gap-4">
            <div>
              <p className="font-bold text-accent2Soft">🎙️ Maître du jeu</p>
              <p className="text-white/90">
                Une personne gère la partie (playlist, manches) sans jouer elle-même : elle voit
                tous les titres à l’avance. Utile en soirée avec quelqu’un qui anime.
              </p>
            </div>
            <div>
              <p className="font-bold text-accent2Soft">🎧 Tout le monde participe</p>
              <p className="text-white/90">
                L’hôte joue aussi ! Les morceaux de la file d’attente restent masqués (juste
                “Morceau 1”, “Morceau 2”…) pour qu’il ne se spoile pas lui-même.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-surface border border-surfaceBorder rounded-3xl p-6">
          <p className="text-xl font-bold text-accentSoft mb-3">🏆 Le score</p>
          <ul className="flex flex-col gap-2 text-white/90">
            <li>
              <span className="font-bold text-accent2Soft">+2 points</span> — titre ET artiste
              trouvés : la manche se termine, on enchaîne sur la suivante.
            </li>
            <li>
              <span className="font-bold text-accent2Soft">+1 point</span> — un seul des deux
              trouvé.
            </li>
            <li>
              <span className="font-bold text-danger">-1 point</span> — aucun des deux trouvé.
            </li>
          </ul>
          <p className="text-white/90 mt-3">
            En mode <span className="font-bold">Maître du jeu</span>, tant que titre et artiste ne
            sont pas tous les deux trouvés, la musique reprend exactement là où elle s’était
            arrêtée pour laisser une autre chance — le joueur qui vient de répondre doit alors
            attendre qu’un autre buzze avant de pouvoir retenter. En mode{" "}
            <span className="font-bold">Tout le monde participe</span>, la manche se termine dans
            tous les cas dès le premier buzz. Le score peut descendre en négatif.
          </p>
        </section>

        <section className="bg-surface border border-surfaceBorder rounded-3xl p-6">
          <p className="text-xl font-bold text-accentSoft mb-3">⏱ Le temps</p>
          <p className="text-white/90">
            Chaque manche dure 30 secondes. Si personne n’a buzzé à la fin du compte à rebours, la
            réponse s’affiche et la manche se termine sans gagnant. Le temps de réflexion pendant
            qu’une réponse est jugée n’est jamais décompté du budget de 30 secondes.
          </p>
        </section>
      </div>
    </main>
  );
}
