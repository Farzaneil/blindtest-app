"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

/**
 * QR code qui amène un joueur directement sur /play avec le code de la
 * partie pré-rempli (voir la lecture de ?code= dans app/play/page.tsx).
 *
 * L'URL est construite à partir de l'origine réelle de la page (domaine
 * Vercel en prod, 127.0.0.1 en local) plutôt que d'une URL codée en dur,
 * pour suivre automatiquement l'environnement. Conséquence assumée : en
 * local, le QR pointe vers 127.0.0.1, donc inutilisable depuis un autre
 * appareil — il n'est vraiment testable qu'en prod.
 *
 * Fond blanc + marge volontaires : un QR posé directement sur le thème
 * sombre de l'app se scanne mal (les lecteurs attendent des modules foncés
 * sur fond clair, avec une zone calme autour).
 */
export function JoinQrCode({ code }: { code: string }) {
  // Calculée après montage : window n'existe pas au rendu serveur.
  const [joinUrl, setJoinUrl] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJoinUrl(`${window.location.origin}/play?code=${encodeURIComponent(code)}`);
  }, [code]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="bg-white rounded-2xl p-4 w-[75vw] max-w-[260px] aspect-square flex items-center justify-center">
        {joinUrl && (
          <QRCodeSVG
            value={joinUrl}
            level="M"
            className="w-full h-full"
            title={`Rejoindre la partie ${code}`}
          />
        )}
      </div>
      <p className="text-sm text-inkMuted text-center">Scanne pour rejoindre la partie</p>
    </div>
  );
}
