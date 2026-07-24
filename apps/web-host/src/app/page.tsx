import Link from "next/link";

/**
 * Page d'accueil neutre : jusqu'ici "/" était directement l'écran hôte, ce
 * qui ne permettait aucune navigation entre hôte et joueur (deux pages
 * complètement déconnectées). L'écran hôte a déménagé vers /host ; "/" ne
 * fait plus que présenter les deux chemins possibles (créer une partie /
 * en rejoindre une) plus deux pages d'info statiques (règles, à propos).
 *
 * Composant serveur simple (pas de "use client") : aucune interactivité au-
 * delà de la navigation via <Link>, pas besoin de state ni d'effets ici.
 */
export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-8 p-6 text-center">
      <div>
        <p className="text-4xl md:text-5xl font-black tracking-wide text-accentSoft">
          BLINDTEST
        </p>
        <p className="text-muted mt-2">Le blind-test entre potes, sans DJ dédié.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-lg">
        <Link
          href="/host"
          className="bg-surface hover:bg-surface/70 transition border-2 border-accent hover:shadow-glowAccent rounded-3xl px-6 py-8 flex flex-col items-center gap-2"
        >
          <span className="text-3xl">🎙️</span>
          <span className="text-lg font-bold text-accentSoft">Créer une partie</span>
          <span className="text-sm text-muted">Je suis l’hôte</span>
        </Link>
        <Link
          href="/play"
          className="bg-surface hover:bg-surface/70 transition border-2 border-accent2 hover:shadow-glowAccent2 rounded-3xl px-6 py-8 flex flex-col items-center gap-2"
        >
          <span className="text-3xl">📱</span>
          <span className="text-lg font-bold text-accent2Soft">Rejoindre une partie</span>
          <span className="text-sm text-muted">Je suis joueur</span>
        </Link>
      </div>

      <div className="flex gap-6">
        <Link href="/rules" className="text-sm text-muted hover:text-accentSoft underline transition">
          📖 Règles du jeu
        </Link>
        <Link href="/about" className="text-sm text-muted hover:text-accentSoft underline transition">
          ℹ️ À propos
        </Link>
      </div>
    </main>
  );
}
