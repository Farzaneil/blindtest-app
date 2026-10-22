import Link from "next/link";
import { Mic2, Smartphone, BookOpen, Info, ShieldCheck, Music2 } from "lucide-react";
import { PlayerAccountCorner } from "./_components/PlayerAccountCorner";
import { ThemePicker } from "./_components/ThemePicker";

/**
 * Page d'accueil : présente les deux chemins (créer une partie / en
 * rejoindre une), le choix de la couleur du fond et les pages d'info.
 *
 * Direction "Arcade autocollants" (maquette validée, canvas "Blindtest —
 * Refonte Arcade") : logo en deux autocollants inclinés (BLIND en rose —
 * seul usage du rose dans l'app — et TEST en bleu), gros contours noirs,
 * ombres décalées. "Créer une partie" prend la couleur d'action du thème
 * (bg-sage = --c1), "Rejoindre" la couleur de décor (bg-info = --c2).
 */
export default function HomePage() {
  return (
    <main className="relative flex flex-col items-center justify-center min-h-screen gap-8 px-4 py-16 text-center bg-page">
      <PlayerAccountCorner />

      <div className="flex flex-col items-center gap-5">
        <div className="relative flex flex-col items-center">
          <span className="font-display text-5xl md:text-7xl leading-none bg-logo text-fg border-[3px] border-fg rounded-2xl shadow-sticker px-5 py-2 -rotate-3">
            BLIND
          </span>
          <span className="font-display text-5xl md:text-7xl leading-none bg-[#4D7CFF] text-white border-[3px] border-fg rounded-2xl shadow-sticker px-5 py-2 rotate-2 -mt-2 ml-10">
            TEST
          </span>
          <span
            aria-hidden
            className="absolute -top-4 -right-8 w-12 h-12 rounded-full bg-info border-[3px] border-fg shadow-sticker-sm flex items-center justify-center rotate-12"
          >
            <Music2 className="w-6 h-6" strokeWidth={2.5} />
          </span>
        </div>
        <p className="bg-inkSurface border-2 border-fg rounded-full px-4 py-1.5 font-bold text-sm shadow-sticker-sm">
          entre potes, sans prise de tête
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-lg">
        <Link
          href="/host"
          className="bg-sage text-fg border-[3px] border-fg rounded-2xl px-6 py-7 flex flex-col items-center gap-2 shadow-sticker transition-transform hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none"
        >
          <Mic2 className="w-8 h-8" strokeWidth={2.5} />
          <span className="text-xl font-display">Créer une partie</span>
          <span className="text-sm font-bold">Je suis l’hôte</span>
        </Link>
        <Link
          href="/play"
          className="bg-info text-fg border-[3px] border-fg rounded-2xl px-6 py-7 flex flex-col items-center gap-2 shadow-sticker transition-transform hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none"
        >
          <Smartphone className="w-8 h-8" strokeWidth={2.5} />
          <span className="text-xl font-display">Rejoindre</span>
          <span className="text-sm font-bold">Je suis joueur</span>
        </Link>
      </div>

      <ThemePicker className="w-full max-w-lg" />

      <nav className="flex flex-wrap justify-center gap-3">
        {[
          { href: "/rules", label: "Règles du jeu", Icon: BookOpen },
          { href: "/about", label: "À propos", Icon: Info },
          { href: "/confidentialite", label: "Confidentialité", Icon: ShieldCheck },
        ].map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="bg-inkSurface border-2 border-fg shadow-sticker-sm rounded-full px-4 py-2 text-sm font-bold inline-flex items-center gap-1.5 transition-transform hover:-translate-y-0.5"
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={2.5} /> {label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
