"use client";

/**
 * Los avisos de MIS acuerdos en una pantalla que no es la de acuerdos (19-nov-2026): por ejemplo la consola del
 * Highlight, que es donde entra Juani. Sin nada urgente no aparece.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMisAcuerdos, type Acuerdo } from "@/app/actions/acuerdos";
import { conAlerta, type Alerta } from "@/lib/acuerdos";
import { FranjaAlertas } from "./franja-alertas";

export function AvisoMisAcuerdos() {
  const router = useRouter();
  const [items, setItems] = useState<{ a: Acuerdo; alerta: Alerta }[] | null>(null);
  useEffect(() => {
    void getMisAcuerdos()
      .then((m) => setItems(m.ok ? conAlerta(m.acuerdos, m.hoy) : []))
      .catch(() => setItems(null));
  }, []);
  if (!items) return null;
  return <FranjaAlertas items={items} onVer={() => router.push("/grupo/acuerdos")} />;
}
