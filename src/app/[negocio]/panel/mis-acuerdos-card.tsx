"use client";

/**
 * Panel de Sede → «Mis acuerdos y tareas» (19-nov-2026). Va debajo del Highlight: el Highlight es lo MÁS
 * importante de la semana; aquí está todo lo demás que le asignaron al administrador. Plegada por defecto,
 * con el resumen visible (vencidos en rojo). Sin acuerdos asignados, no se muestra.
 */

import { useCallback, useEffect, useState } from "react";
import { getMisAcuerdos, type Acuerdo, type YoSesion } from "@/app/actions/acuerdos";
import { conteos, ordenAcuerdos } from "@/lib/acuerdos";
import { AcuerdoItem } from "@/components/acuerdos/acuerdo-item";
import { Pastilla, SeccionDesplegable } from "@/components/productos/ui";

export function MisAcuerdosCard() {
  const [d, setD] = useState<{ hoy: string; yo: YoSesion; acuerdos: Acuerdo[] } | null>(null);

  const cargar = useCallback(async () => {
    const r = await getMisAcuerdos();
    if (r.ok) setD({ hoy: r.hoy, yo: r.yo, acuerdos: r.acuerdos });
  }, []);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  if (!d || d.acuerdos.length === 0) return null;
  const c = conteos(d.acuerdos, d.hoy);
  const lista = ordenAcuerdos(d.acuerdos, d.hoy);

  return (
    <SeccionDesplegable
      titulo="Mis acuerdos y tareas"
      subtitulo="Lo que te asignaron, con su fecha límite. Márcalo cumplido cuando lo termines."
      resumen={
        <div className="flex flex-wrap gap-1.5">
          <Pastilla>{c.abiertos} {c.abiertos === 1 ? "abierto" : "abiertos"}</Pastilla>
          {c.vencidos > 0 && <Pastilla tono="rojo">{c.vencidos} {c.vencidos === 1 ? "vencido" : "vencidos"}</Pastilla>}
          {c.venceHoy > 0 && <Pastilla tono="ambar">{c.venceHoy} vence{c.venceHoy === 1 ? "" : "n"} hoy</Pastilla>}
          {c.porConfirmar > 0 && <Pastilla tono="azul">{c.porConfirmar} esperando confirmación</Pastilla>}
        </div>
      }
    >
      <ul className="divide-y divide-gray-100">
        {lista.map((a) => (
          <AcuerdoItem key={`${a.id}-${a.estado}-${a.comentarios}`} a={a} yo={d.yo} hoy={d.hoy} mostrarResponsable={false} onCambio={() => void cargar()} />
        ))}
      </ul>
    </SeccionDesplegable>
  );
}
