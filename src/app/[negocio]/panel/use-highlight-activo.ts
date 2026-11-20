"use client";

import { useEffect, useState } from "react";
import { getHighlightActivo } from "@/app/actions/ajustes";

/**
 * ¿Se muestra el Highlight en el panel? Archivado desde el 20-nov-2026; Jahnn lo reactiva en Grupo → Highlight.
 * Mientras no se sabe, false: así nunca aparece un instante y desaparece.
 */
export function useHighlightActivo(): boolean {
  const [activo, setActivo] = useState(false);
  useEffect(() => {
    void getHighlightActivo().then(setActivo).catch(() => setActivo(false));
  }, []);
  return activo;
}
