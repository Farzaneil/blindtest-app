import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, BookOpen, Info, ShieldCheck, type LucideIcon } from "lucide-react";

/**
 * Gabarit commun des pages d'information (/rules, /about, /confidentialite),
 * direction "Arcade autocollants" (comme /profil) : titre en autocollant
 * incliné, cartes blanches à gros contour noir et ombre décalée, icône de
 * section dans une pastille de couleur. Composant serveur, sans état.
 */

const PAGES = [
  { href: "/rules", label: "Règles du jeu", Icon: BookOpen },
  { href: "/about", label: "À propos", Icon: Info },
  { href: "/confidentialite", label: "Confidentialité", Icon: ShieldCheck },
] as const;

export function InfoPage({
  current,
  title,
  intro,
  children,
}: {
  current: (typeof PAGES)[number]["href"];
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex flex-col items-center min-h-screen gap-6 px-4 py-6 sm:py-10 bg-page">
      <div className="w-full max-w-2xl flex flex-col gap-5">
        <Link href="/" className="text-sm font-extrabold inline-flex items-center gap-1 hover:underline w-fit">
          <ArrowLeft className="w-4 h-4" strokeWidth={2.5} /> Accueil
        </Link>

        <header className="flex flex-col items-center gap-3 text-center">
          <h1 className="font-display text-3xl sm:text-4xl bg-sage border-[3px] border-fg rounded-2xl shadow-sticker px-5 py-2 -rotate-2">
            {title}
          </h1>
          {intro && <p className="max-w-lg text-sm font-bold text-fg/80">{intro}</p>}
        </header>

        <div className="flex flex-col gap-4">{children}</div>

        <nav aria-label="Autres pages d’information" className="flex flex-wrap justify-center gap-2 pt-2">
          {PAGES.filter((p) => p.href !== current).map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className="bg-inkSurface border-2 border-fg shadow-sticker-sm rounded-full px-4 py-2 text-sm font-bold inline-flex items-center gap-1.5 transition-transform hover:-translate-y-0.5"
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={2.5} /> {label}
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}

const TONES = {
  c1: "bg-sage",
  c2: "bg-info",
  gold: "bg-gold",
  good: "bg-good",
  danger: "bg-danger text-white",
} as const;

export function InfoCard({
  icon: Icon,
  title,
  tone = "c1",
  children,
}: {
  icon: LucideIcon;
  title: string;
  tone?: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <section className="bg-inkSurface border-[3px] border-fg rounded-[20px] shadow-sticker p-5 sm:p-6 flex flex-col gap-3">
      <h2 className="font-display text-lg flex items-center gap-2.5">
        <span className={`w-9 h-9 shrink-0 rounded-full border-2 border-fg shadow-sticker-sm flex items-center justify-center -rotate-6 ${TONES[tone]}`}>
          <Icon className="w-[18px] h-[18px]" strokeWidth={2.5} />
        </span>
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-[15px] leading-relaxed">{children}</div>
    </section>
  );
}

/** Ligne "icône + titre + explication" (bonus/malus, données stockées…). */
export function InfoItem({ icon: Icon, title, children }: { icon?: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      {Icon && (
        <span className="w-7 h-7 shrink-0 mt-0.5 rounded-lg border-2 border-fg bg-inkSurface3 flex items-center justify-center">
          <Icon className="w-4 h-4" strokeWidth={2.5} />
        </span>
      )}
      <div className="min-w-0">
        <p className="font-display text-[15px]">{title}</p>
        <p className="text-sm text-inkMuted">{children}</p>
      </div>
    </div>
  );
}

/** Pastille autocollant (barème des points). */
export function Pill({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={`rounded-full font-display text-sm px-4 py-1.5 border-2 border-fg shadow-sticker-sm ${TONES[tone]}`}>
      {children}
    </span>
  );
}
