/**
 * Écran hôte / "TV" — pensé pour être projeté (laptop branché en HDMI, ou
 * navigateur ouvert sur une TV connectée) pendant qu'une enceinte diffuse le
 * son (Spotify Connect / Web Playback SDK piloté par le compte Premium de
 * l'hôte).
 *
 * RÈGLE IMPORTANTE (cf. blueprint, section 2 et discussion sur le modèle) :
 * cette page ne doit JAMAIS afficher les réponses privées d'un joueur avant
 * que la manche passe en statut "revealed". Elle n'affiche que l'état commun :
 * question en cours, ordre des buzz, classement. Ça reste vrai même si
 * l'hôte joue depuis son propre téléphone en parallèle (voir
 * apps/mobile/src/screens/BuzzerScreen.tsx) — les deux écrans sont
 * indépendants et alimentés par les mêmes tables partagées (`rooms`,
 * `rounds`), jamais par `answers`.
 *
 * TODO: brancher sur Supabase Realtime (table `rounds` + `players` du room
 * courant) pour remplacer ces données statiques.
 */
export default function HostScreen() {
  const roomCode = "BZR482"; // TODO: généré à la création de la room
  const scoreboard = [
    { name: "Léa", score: 30 },
    { name: "Tom", score: 20 },
    { name: "Sam", score: 10 },
  ];

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-10 p-10">
      <div className="text-center">
        <p className="text-lg text-gray-400">Rejoignez la partie avec le code</p>
        <p className="text-6xl font-black tracking-widest text-accent">{roomCode}</p>
      </div>

      <div className="w-full max-w-xl">
        <h2 className="text-2xl font-bold mb-4">Classement</h2>
        <ul className="space-y-2">
          {scoreboard.map((p, i) => (
            <li key={p.name} className="flex justify-between bg-white/5 rounded-lg px-4 py-3 text-xl">
              <span>{i + 1}. {p.name}</span>
              <span className="font-bold">{p.score} pts</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
