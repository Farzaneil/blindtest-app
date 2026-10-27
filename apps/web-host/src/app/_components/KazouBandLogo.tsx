import { KazouForTheme } from "../../lib/kazou";

/**
 * Logo Kazou Band (piste A validée) : deux autocollants inclinés, KAZOU en
 * rose et BAND en bleu, avec en pastille le Kazou du fond choisi (voir
 * KazouForTheme). Composant serveur, sans état.
 */
export function KazouBandLogo({ size = "lg" }: { size?: "lg" | "sm" }) {
  const lg = size === "lg";
  return (
    <div className={`flex flex-col items-center ${lg ? "pt-10 md:pt-12" : "pt-6"}`}>
      <h1 className="sr-only">Kazou Band</h1>
      {/* La pastille est accrochée au coin haut-droit de KAZOU, à l'extérieur :
          elle ne recouvre que la marge de l'autocollant, jamais le U. */}
      <span className="relative">
        <span
          aria-hidden
          className={`block font-display leading-none bg-logo text-fg border-[3px] border-fg rounded-2xl shadow-sticker -rotate-3 ${
            lg ? "text-5xl md:text-7xl px-5 py-2" : "text-3xl px-3 py-1.5"
          }`}
        >
          KAZOU
        </span>
        <span
          aria-hidden
          className={`kazou-badge absolute left-full rounded-full border-[3px] border-fg shadow-sticker-sm flex items-center justify-center rotate-12 ${
            lg ? "-top-9 -ml-4 w-[4.5rem] h-[4.5rem] md:-top-12 md:-ml-5 md:w-24 md:h-24" : "-top-6 -ml-3 w-12 h-12"
          }`}
        >
          <KazouForTheme size={lg ? 52 : 34} className={lg ? "mr-1.5 md:mr-2 md:w-[70px] md:h-[70px]" : "mr-1"} />
        </span>
      </span>
      <span
        aria-hidden
        className={`font-display leading-none bg-[#4D7CFF] text-white border-[3px] border-fg rounded-2xl shadow-sticker rotate-2 -mt-2 ${
          lg ? "text-5xl md:text-7xl px-5 py-2 ml-16" : "text-3xl px-3 py-1.5 ml-10"
        }`}
      >
        BAND
      </span>
    </div>
  );
}
