import { ImageResponse } from "next/og";
import { ICON_SVG } from "./_brand/iconSvg";

/** Icône d'écran d'accueil iOS (180 px) : Kaz sur fond rose, comme app/icon.svg. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <img src={`data:image/svg+xml;utf8,${encodeURIComponent(ICON_SVG)}`} width={180} height={180} alt="" />
    ),
    size
  );
}
