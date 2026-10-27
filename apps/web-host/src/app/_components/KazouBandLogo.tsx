import { KazouForTheme } from "../../lib/kazou";

/**
 * Logo Kazou Band (piste A validée) : deux autocollants inclinés, KAZOU en
 * rose et BAND en bleu, avec en pastille le Kazou du fond choisi (voir
 * KazouForTheme). Composant serveur, sans état.
 */
export function KazouBandLogo({ size = "lg" }: { size?: "lg" | "sm" }) {
  const lg = size === "lg";
  return (
    <div className={`relative flex flex-col items-center ${lg ? "pt-4" : "pt-2"}`}>
      <h1 className="sr-only">Kazou Band</h1>
      <span
        aria-hidden
        className={`font-display leading-none bg-logo text-fg border-[3px] border-fg rounded-2xl shadow-sticker -rotate-3 ${
          lg ? "text-5xl md:text-7xl px-5 py-2" : "text-3xl px-3 py-1.5"
        }`}
      >
        KAZOU
      </span>
      <span
        aria-hidden
        className={`font-display leading-none bg-[#4D7CFF] text-white border-[3px] border-fg rounded-2xl shadow-sticker rotate-2 -mt-2 ${
          lg ? "text-5xl md:text-7xl px-5 py-2 ml-16" : "text-3xl px-3 py-1.5 ml-10"
        }`}
      >
        BAND
      </span>
      <span
        aria-hidden
        className={`kazou-badge absolute rounded-full border-[3px] border-fg shadow-sticker-sm flex items-center justify-center rotate-12 ${
          lg ? "-top-4 -right-10 w-20 h-20 md:w-24 md:h-24" : "-top-3 -right-8 w-14 h-14"
        }`}
      >
        <KazouForTheme size={lg ? 76 : 50} />
      </span>
    </div>
  );
}
