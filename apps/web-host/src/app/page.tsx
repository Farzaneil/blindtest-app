import Link from "next/link";
import { Mic2, Smartphone, BookOpen, Info, ShieldCheck } from "lucide-react";
import { PlayerAccountCorner } from "./_components/PlayerAccountCorner";

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
 * Direction visuelle "minimal premium sombre" v3 (voir /host, /play — même
 * refonte, validée via maquette avant dev) : cartes à bandelette de couleur
 * en haut (span absolu plutôt qu'une classe CSS custom, pour rester
 * cohérent avec le tout-Tailwind du reste du projet), liens secondaires en
 * pastille pleine plutôt qu'en simple texte souligné. "Créer une partie"
 * reprend le sauge en permanence (couleur de "la partie" partout ailleurs
 * sur le site), "Rejoindre une partie" reste en contour neutre bleu info —
 * les deux cartes se distinguent par le contraste plein/contour plutôt que
 * par une 2e couleur de marque.
 */
export default function HomePage() {
  return (
    <main className="relative flex flex-col items-center justify-center min-h-screen gap-8 p-6 text-center bg-ink">
      <PlayerAccountCorner />
      <div>
        <p className="text-4xl md:text-5xl font-black tracking-wide font-display">BLINDTEST</p>
        <p className="text-inkMuted mt-2">Le blind-test entre potes, sans prise de tête.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-lg">
        <Link
          href="/host"
          className="relative bg-inkSurface border border-inkBorder hover:border-sage transition rounded-2xl px-6 py-8 flex flex-col items-center gap-2"
        >
          <span className="absolute top-0 left-5 right-5 h-1 rounded-b-md bg-sage" />
          <Mic2 className="w-7 h-7 text-sage" />
          <span className="text-lg font-bold text-sage font-display">Créer une partie</span>
          <span className="text-sm text-inkMuted">Je suis l’hôte</span>
        </Link>
        <Link
          href="/play"
          className="relative bg-inkSurface border border-inkBorderStrong hover:border-white transition rounded-2xl px-6 py-8 flex flex-col items-center gap-2"
        >
          <span className="absolute top-0 left-5 right-5 h-1 rounded-b-md bg-info" />
          <Smartphone className="w-7 h-7 text-white" />
          <span className="text-lg font-bold text-white font-display">Rejoindre une partie</span>
          <span className="text-sm text-inkMuted">Je suis joueur</span>
        </Link>
      </div>

      <div className="flex gap-3">
        <Link
          href="/rules"
          className="bg-inkSurface2 border border-inkBorder hover:border-sage transition rounded-full px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5"
        >
          <BookOpen className="w-3.5 h-3.5" /> Règles du jeu
        </Link>
        <Link
          href="/about"
          className="bg-inkSurface2 border border-inkBorder hover:border-sage transition rounded-full px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5"
        >
          <Info className="w-3.5 h-3.5" /> À propos
        </Link>
        <Link
          href="/confidentialite"
          className="bg-inkSurface2 border border-inkBorder hover:border-sage transition rounded-full px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5"
        >
          <ShieldCheck className="w-3.5 h-3.5" /> Confidentialité
        </Link>
      </div>
    </main>
  );
}
