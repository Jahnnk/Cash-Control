"use client";

/**
 * Panel de Sede → «Mis acuerdos y tareas» (19-nov-2026). Va debajo del Highlight: el Highlight es lo MÁS
 * importante de la semana; aquí está todo lo demás que le asignaron al administrador. Plegada por defecto,
 * con el resumen visible. Lo urgente (vencido, vence hoy o mañana, nuevo) va en una franja siempre
 * visible encima. Sin acuerdos asignados, no se muestra.
 */

import { useCallback, useEffect, useState } from "react";
import { getMisAcuerdos, type Acuerdo, type YoSesion } from "@/app/actions/acuerdos";
import { conAlerta, conteos, ordenAcuerdos } from "@/lib/acuerdos";
import { FilaAcuerdo } from "@/components/acuerdos/fila-acuerdo";
import { DetalleAcuerdo } from "@/components/acuerdos/detalle-acuerdo";
import { FranjaAlertas } from "@/components/acuerdos/franja-alertas";
import { Pastilla, SeccionDesplegable } from "@/components/productos/ui";

export function MisAcuerdosCard() {
  const [d, setD] = useState<{ hoy: string; yo: YoSesion; acuerdos: Acuerdo[] } | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);

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
  // Lo urgente se ve siempre, sin abrir nada (Jahnn, 19-nov-2026: los avisos en cada panel, no por correo).
  const alertas = conAlerta(d.acuerdos, d.hoy);
  const enDetalle = abierto !== null ? d.acuerdos.find((a) => a.id === abierto) ?? null : null;

  return (
    <>
    <FranjaAlertas items={alertas} />
    <SeccionDesplegable
      titulo="Mis acuerdos y tareas"
      subtitulo="Lo que te asignaron, con su fecha límite."
      resumen={
        <div className="flex flex-wrap gap-1.5">
          <Pastilla>{c.abiertos} {c.abiertos === 1 ? "abierto" : "abiertos"}</Pastilla>
          {c.vencidos > 0 && <Pastilla tono="rojo">{c.vencidos} {c.vencidos === 1 ? "vencido" : "vencidos"}</Pastilla>}
          {c.venceHoy > 0 && <Pastilla tono="ambar">{c.venceHoy} vence{c.venceHoy === 1 ? "" : "n"} hoy</Pastilla>}
        </div>
      }
    >
      <p className="text-xs text-gray-500 mb-1">Cambia el estado con el botón de color: No iniciado, En progreso o Hecho. Toca la tarea para ver el detalle o comentar.</p>
      <ul>
        {lista.map((a) => (
          <FilaAcuerdo key={a.id} a={a} yo={d.yo} hoy={d.hoy} comoResponsable mostrarResponsable={false} onAbrir={() => setAbierto(a.id)} onCambio={() => void cargar()} />
        ))}
      </ul>
    </SeccionDesplegable>
    {enDetalle && <DetalleAcuerdo key={enDetalle.id} a={enDetalle} yo={d.yo} hoy={d.hoy} comoResponsable onCambio={() => void cargar()} onCerrar={() => setAbierto(null)} />}
    </>
  );
}
