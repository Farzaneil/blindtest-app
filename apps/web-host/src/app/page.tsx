import Link from "next/link";
import { BookOpen, Info, ShieldCheck } from "lucide-react";
import { KazouBandLogo } from "./_components/KazouBandLogo";
import { KazouTrio } from "../lib/kazou";
import { PlayerAccountCorner } from "./_components/PlayerAccountCorner";
import { ThemePicker } from "./_components/ThemePicker";
import { HomeActions } from "./_components/HomeActions";

/**
 * Page d'accueil : présente les deux chemins (créer une partie / en
 * rejoindre une), le choix de la couleur du fond et les pages d'info.
 *
 * Direction "Arcade autocollants" (maquette validée, canvas "Blindtest —
 * Refonte Arcade") : logo Kazou Band en deux autocollants inclinés (voir
 * KazouBandLogo), le trio Kaz, Zou & Zazou (lib/kazou.tsx), gros contours
 * noirs, ombres décalées. "Créer une partie" prend la couleur d'action du thème
 * (bg-sage = --c1), "Rejoindre" la couleur de décor (bg-info = --c2). Ces
 * boutons vivent dans HomeActions (partie en cours -> "Reprendre").
 */
export default function HomePage() {
  return (
    <main className="relative flex flex-col items-center justify-center min-h-screen gap-8 px-4 pt-24 pb-16 sm:py-16 text-center bg-page">
      <PlayerAccountCorner scroll />

      <div className="flex flex-col items-center gap-5">
        <KazouBandLogo />
        <p className="bg-inkSurface border-2 border-fg rounded-full px-4 py-1.5 font-bold text-sm shadow-sticker-sm">
          le blind test entre potes
        </p>
      </div>

      <HomeActions />

      <div className="flex flex-col items-center gap-1">
        <KazouTrio size={104} />
        <p className="text-sm font-extrabold">Kaz, Zou et Zazou t’attendent !</p>
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

      <p className="-mt-4 flex gap-3 text-xs font-bold text-fg/70">
        <Link href="/cgu" className="underline hover:text-fg">
          Conditions d’utilisation
        </Link>
        <Link href="/mentions-legales" className="underline hover:text-fg">
          Mentions légales
        </Link>
      </p>
    </main>
  );
}
