import Link from "next/link";
import { IconAvatar, IconCalendar, IconMap, IconTrophy } from "./SoloIcons";

/**
 * Menu du bas du mode solo : barre flottante, l'onglet actif devient une
 * pastille jaune avec son nom. Défi du jour, Collection et Musicien
 * arrivent ensuite (désactivés pour l'instant).
 */
export function SoloNav({ active }: { active: "tour" }) {
  const soon = "w-14 h-12 rounded-full flex items-center justify-center opacity-45 cursor-not-allowed";
  return (
    <nav
      aria-label="Mode solo"
      className="fixed bottom-4 inset-x-4 mx-auto max-w-md bg-inkSurface border-4 border-fg rounded-full shadow-sticker p-1.5 flex items-center justify-between z-20"
    >
      <Link
        href="/solo"
        aria-current={active === "tour" ? "page" : undefined}
        className="h-12 rounded-full bg-[#FFE14D] border-[3px] border-fg pl-3 pr-4 flex items-center gap-2 font-display text-lg"
      >
        <IconMap size={32} /> Tournée
      </Link>
      <span className={soon} title="Défi du jour : bientôt" aria-label="Défi du jour (bientôt)">
        <IconCalendar size={32} />
      </span>
      <span className={soon} title="Collection : bientôt" aria-label="Collection (bientôt)">
        <IconTrophy size={32} />
      </span>
      <Link href="/profil" className="w-14 h-12 rounded-full flex items-center justify-center" aria-label="Mon Musicien">
        <IconAvatar size={32} />
      </Link>
    </nav>
  );
}
