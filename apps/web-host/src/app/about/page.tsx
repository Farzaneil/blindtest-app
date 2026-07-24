import Link from "next/link";

/**
 * Page "à propos" : contexte du projet (perso, non-commercial), résumé
 * technique succinct, et roadmap condensée. Composant serveur statique,
 * même logique que /rules.
 */
export default function AboutPage() {
  return (
    <main className="flex flex-col items-center min-h-screen gap-8 p-6 md:p-10">
      <div className="w-full max-w-2xl text-center">
        <Link href="/" className="text-sm text-muted hover:text-accentSoft underline transition">
          ← Accueil
        </Link>
        <p className="text-3xl md:text-4xl font-black text-accentSoft mt-4">À propos</p>
      </div>

      <div className="w-full max-w-2xl flex flex-col gap-6">
        <section className="bg-surface border border-surfaceBorder rounded-3xl p-6">
          <p className="text-xl font-bold text-accentSoft mb-3">🎈 Le projet</p>
          <p className="text-white/90">
            Blindtest est un projet perso, développé pour jouer entre amis sans dépendre d’un
            générateur en ligne ou d’un tableur bricolé. Pas de compte, pas de pub, pas de
            monétisation — juste un outil gratuit pour animer une soirée.
          </p>
        </section>

        <section className="bg-surface border border-surfaceBorder rounded-3xl p-6">
          <p className="text-xl font-bold text-accentSoft mb-3">🛠️ Sous le capot</p>
          <p className="text-white/90">
            Next.js pour l’interface, Supabase pour la base de données et le temps réel (les
            buzzers et le score se mettent à jour instantanément sur tous les écrans), et le SDK
            Spotify pour la lecture des morceaux directement depuis un compte Premium. Hébergé
            gratuitement (Vercel Hobby).
          </p>
        </section>

        <section className="bg-surface border border-surfaceBorder rounded-3xl p-6">
          <p className="text-xl font-bold text-accentSoft mb-3">🗺️ Roadmap</p>
          <ul className="flex flex-col gap-2 text-white/90 list-disc list-inside">
            <li>Améliorer l’expérience mobile des joueurs</li>
            <li>Plus de statistiques de fin de partie</li>
            <li>Historique des parties passées</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
