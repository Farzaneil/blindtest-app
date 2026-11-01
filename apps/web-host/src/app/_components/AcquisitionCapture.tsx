"use client";

import { useEffect } from "react";
import { captureSource } from "../../lib/acquisition";

/** Lit ?src= à l'arrivée sur le site (voir lib/acquisition.ts). Rien à l'écran. */
export function AcquisitionCapture() {
  useEffect(() => {
    captureSource();
  }, []);
  return null;
}
