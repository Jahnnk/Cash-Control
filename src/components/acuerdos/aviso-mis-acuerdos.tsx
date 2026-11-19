"use client";

/**
 * Los avisos de MIS acuerdos en una pantalla que no es la de acuerdos (19-nov-2026): por ejemplo la consola del
 * Highlight, que es donde entra Juani. Lo mío urgente y, si soy de la dirección, lo que espera mi confirmación.
 * Sin nada pendiente no aparece.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAlertaAcuerdos, getMisAcuerdos, type Acuerdo } from "@/app/actions/acuerdos";
import { conAlerta, type Alerta } from "@/lib/acuerdos";
import { FranjaAlertas } from "./franja-alertas";

export function AvisoMisAcuerdos() {
  const router = useRouter();
  const [d, setD] = useState<{ items: { a: Acuerdo; alerta: Alerta }[]; porConfirmar: number } | null>(null);
  useEffect(() => {
    void Promise.all([getMisAcuerdos(), getAlertaAcuerdos()])
      .then(([m, al]) => setD({ items: m.ok ? conAlerta(m.acuerdos, m.hoy) : [], porConfirmar: al?.porConfirmar ?? 0 }))
      .catch(() => setD(null));
  }, []);
  if (!d) return null;
  return <FranjaAlertas items={d.items} porConfirmar={d.porConfirmar} onVer={() => router.push("/grupo/acuerdos")} />;
}
