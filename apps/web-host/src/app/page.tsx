import Link from "next/link";
import { Mic2, Smartphone, BookOpen, Info } from "lucide-react";

/**
 * Page d'accueil neutre : jusqu'ici "/" était directement l'écran hôte, ce
 * qui ne permettait aucune navigation entre hôte et joueur (deux pages
 * complètement déconnectées). L'écran hôte a déménagé vers /host ; "/" ne
 * fait plus que présenter les deux chemins possibles (créer une partie /
 * en rejoindre une) plus deux pages d'info statiques (règles, à propos).
 *
 * Composant serveur simple (pas de "use client") : aucune interactivité au-
 * delà de la navigation via <Link>, pas besoin de state ni d'effets ici.
 *
 * Direction visuelle "minimal premium sombre" (voir /host, même refonte,
 * validée via mockup avant dev) : plus de violet/glow/emoji. "Créer une
 * partie" reprend le sauge en permanence (couleur de "la partie" partout
 * ailleurs sur le site : code room, file d'attente, CTA), "Rejoindre une
 * partie" reste en contour neutre — les deux cartes se distinguent par le
 * contraste plein/contour plutôt que par une 2e couleur de marque.
 */
export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-8 p-6 text-center bg-ink">
      <div>
        <p className="text-4xl md:text-5xl font-bold tracking-wide font-display">BLINDTEST</p>
        <p className="text-inkMuted mt-2">Le blind-test entre potes, sans DJ dédié.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-lg">
        <Link
          href="/host"
          className="bg-gradient-to-b from-sage/10 to-sage/0 border border-sage/35 hover:border-sage transition rounded-2xl px-6 py-8 flex flex-col items-center gap-2"
        >
          <Mic2 className="w-7 h-7 text-sage" />
          <span className="text-lg font-bold text-sage">Créer une partie</span>
          <span className="text-sm text-inkMuted">Je suis l’hôte</span>
        </Link>
        <Link
          href="/play"
          className="bg-inkSurface border-2 border-inkBorderStrong hover:border-white transition rounded-2xl px-6 py-8 flex flex-col items-center gap-2"
        >
          <Smartphone className="w-7 h-7 text-white" />
          <span className="text-lg font-bold text-white">Rejoindre une partie</span>
          <span className="text-sm text-inkMuted">Je suis joueur</span>
        </Link>
      </div>

      <div className="flex gap-6">
        <Link
          href="/rules"
          className="text-sm text-inkMuted hover:text-sage underline transition inline-flex items-center gap-1.5"
        >
          <BookOpen className="w-3.5 h-3.5" /> Règles du jeu
        </Link>
        <Link
          href="/about"
          className="text-sm text-inkMuted hover:text-sage underline transition inline-flex items-center gap-1.5"
        >
          <Info className="w-3.5 h-3.5" /> À propos
        </Link>
      </div>
    </main>
  );
}
