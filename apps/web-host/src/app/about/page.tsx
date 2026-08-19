import Link from "next/link";
import { ChevronLeft, Heart, Wrench, Map } from "lucide-react";

/**
 * Page "à propos" : contexte du projet (perso, non-commercial), résumé
 * technique succinct, et roadmap condensée. Composant serveur statique,
 * même logique que /rules.
 *
 * Migrée vers la direction visuelle "minimal premium sombre" v3 (voir /,
 * /host, /play — même refonte) : palette ink/sage, icônes lucide au lieu
 * des emoji, cartes à bandelette de couleur. Roadmap nettoyée des points
 * déjà réalisés depuis la première rédaction (stats de fin de partie,
 * robustesse mobile).
 */
export default function AboutPage() {
  return (
    <main className="flex flex-col items-center min-h-screen gap-8 p-6 md:p-10 bg-ink">
      <div className="w-full max-w-2xl text-center">
        <Link
          href="/"
          className="text-sm text-inkMuted hover:text-sage transition inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Accueil
        </Link>
        <p className="text-3xl md:text-4xl font-black text-white mt-4 font-display">À propos</p>
      </div>

      <div className="w-full max-w-2xl flex flex-col gap-5">
        <section className="relative bg-inkSurface border border-inkBorder rounded-2xl p-6">
          <span className="absolute top-0 left-5 right-5 h-1 rounded-b-md bg-sage" />
          <p className="text-lg font-bold text-sage mb-3 font-display flex items-center gap-2">
            <Heart className="w-5 h-5" /> Le projet
          </p>
          <p className="text-white/90">
            Blindtest est un projet perso, développé pour jouer entre amis sans dépendre d’un
            générateur en ligne ou d’un tableur bricolé. Pas de compte, pas de pub, pas de
            monétisation — juste un outil gratuit pour animer une soirée.
          </p>
        </section>

        <section className="relative bg-inkSurface border border-inkBorder rounded-2xl p-6">
          <span className="absolute top-0 left-5 right-5 h-1 rounded-b-md bg-info" />
          <p className="text-lg font-bold text-info mb-3 font-display flex items-center gap-2">
            <Wrench className="w-5 h-5" /> Sous le capot
          </p>
          <p className="text-white/90">
            Next.js pour l’interface, Supabase pour la base de données et le temps réel (les
            buzzers et le score se mettent à jour instantanément sur tous les écrans), et le SDK
            Spotify pour la lecture des morceaux directement depuis un compte Premium. Hébergé
            gratuitement (Vercel Hobby).
          </p>
        </section>

        <section className="relative bg-inkSurface border border-inkBorder rounded-2xl p-6">
          <span className="absolute top-0 left-5 right-5 h-1 rounded-b-md bg-amber" />
          <p className="text-lg font-bold text-amber mb-3 font-display flex items-center gap-2">
            <Map className="w-5 h-5" /> Roadmap
          </p>
          <ul className="flex flex-col gap-2 text-white/90">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber shrink-0" />
              Historique des parties passées
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber shrink-0" />
              Statistiques de fin de partie enrichies (par joueur, sur plusieurs soirées)
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
