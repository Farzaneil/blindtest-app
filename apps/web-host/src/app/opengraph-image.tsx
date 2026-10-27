import { ImageResponse } from "next/og";
import { kazouSvgString } from "../lib/kazou";

/**
 * Image d'aperçu quand on partage le lien (WhatsApp, Messenger, réseaux) :
 * le logo Kazou Band, le trio et la signature. Générée au build.
 */
export const alt = "Kazou Band, le blind test entre potes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Dela Gothic One (titres de l'app), récupérée chez Google Fonts au build. */
async function loadDela(): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch("https://fonts.googleapis.com/css2?family=Dela+Gothic+One")).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    return await (await fetch(url)).arrayBuffer();
  } catch {
    return null;
  }
}

const img = (svg: string, s: number) => (
  <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} width={s} height={s} alt="" />
);

export default async function OpengraphImage() {
  const dela = await loadDela();
  const font = dela ? "Dela" : "sans-serif";
  const sticker = (text: string, bg: string, color: string, rotate: number, ml = 0) => (
    <div
      style={{
        display: "flex",
        marginLeft: ml,
        transform: `rotate(${rotate}deg)`,
        background: bg,
        color,
        border: "6px solid #111111",
        borderRadius: 32,
        boxShadow: "12px 12px 0 #111111",
        padding: "18px 34px",
        fontFamily: font,
        fontSize: 120,
        lineHeight: 1,
      }}
    >
      {text}
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FFE14D", padding: "0 70px", fontFamily: font }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
          {sticker("KAZOU", "#FF6FB5", "#111111", -4)}
          {sticker("BAND", "#4D7CFF", "#FFFFFF", 3, 150)}
          <div style={{ display: "flex", marginTop: 44, background: "#FFFFFF", border: "5px solid #111111", borderRadius: 999, boxShadow: "7px 7px 0 #111111", padding: "14px 30px", fontSize: 38, transform: "rotate(-2deg)" }}>
            le blind test entre potes
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
          {img(kazouSvgString("kaz"), 250)}
          <div style={{ display: "flex", marginTop: -40 }}>
            {img(kazouSvgString("zou", "buzz"), 220)}
            {img(kazouSvgString("zazou", "champion"), 220)}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: dela ? [{ name: "Dela", data: dela, style: "normal", weight: 400 }] : [] }
  );
}
