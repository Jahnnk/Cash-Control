"use client";

/**
 * Panel de Sede → «Mis acuerdos y tareas» (19-nov-2026). Va debajo del Highlight: el Highlight es lo MÁS
 * importante de la semana; aquí está todo lo demás que le asignaron al administrador. Plegada por defecto,
 * con el resumen visible. Lo urgente (vencido, vence hoy o mañana, nuevo) va en una franja siempre
 * visible encima. Sin acuerdos asignados, no se muestra.
 *
 * Las mismas vistas que Grupo → Acuerdos y tareas (Jahnn, 19-nov-2026: «todos tienen las mismas vistas, según
 * sus accesos»): Mis tareas, Tablero, Cronograma y Lista. El administrador ve SOLO lo suyo y no crea tareas
 * (la dirección asigna); cambia el estado, comenta y ve el detalle.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { getMisAcuerdos, type Acuerdo, type YoSesion } from "@/app/actions/acuerdos";
import { conAlerta, conteos, ordenAcuerdos } from "@/lib/acuerdos";
import { DetalleAcuerdo } from "@/components/acuerdos/detalle-acuerdo";
import { FranjaAlertas } from "@/components/acuerdos/franja-alertas";
import { MisTareasPorUrgencia } from "@/components/acuerdos/mis-tareas";
import { Pastilla, SeccionDesplegable, Segmentado } from "@/components/productos/ui";
import { Kanban } from "@/app/grupo/acuerdos/kanban";
import { Cronograma } from "@/app/grupo/acuerdos/cronograma";
import { Agrupado } from "@/app/grupo/acuerdos/tablero";

type Vista = "mios" | "tablero" | "cronograma" | "lista";

/** `comoAdmin`: «Ver como administrador» — la dirección ve las tareas del administrador de esta sede. */
export function MisAcuerdosCard({ comoAdmin = false }: { comoAdmin?: boolean }) {
  const { negocio } = useParams<{ negocio: string }>();
  const [d, setD] = useState<{ hoy: string; yo: YoSesion; acuerdos: Acuerdo[] } | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [vista, setVista] = useState<Vista>("mios");

  const cargar = useCallback(async () => {
    const r = await getMisAcuerdos(comoAdmin ? negocio : undefined);
    if (r.ok) setD({ hoy: r.hoy, yo: r.yo, acuerdos: r.acuerdos });
  }, [comoAdmin, negocio]);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  const abiertas = useMemo(() => (d ? ordenAcuerdos(d.acuerdos.filter((a) => a.estado === "pendiente" || a.estado === "en_proceso"), d.hoy) : []), [d]);

  if (!d || d.acuerdos.length === 0) return null;
  const c = conteos(d.acuerdos, d.hoy);
  // Lo urgente se ve siempre, sin abrir nada (Jahnn, 19-nov-2026: los avisos en cada panel, no por correo).
  const alertas = conAlerta(d.acuerdos, d.hoy);
  const enDetalle = abierto !== null ? d.acuerdos.find((a) => a.id === abierto) ?? null : null;
  const recargar = () => void cargar();

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
      <div className="space-y-3">
        <Segmentado valor={vista} onChange={setVista} tamano="sm" opciones={[
          { valor: "mios", etiqueta: `Mis tareas${abiertas.length ? ` (${abiertas.length})` : ""}` },
          { valor: "tablero", etiqueta: "Tablero" },
          { valor: "cronograma", etiqueta: "Cronograma" },
          { valor: "lista", etiqueta: "Lista" },
        ]} />
        <p className="text-xs text-gray-500">
          {vista === "tablero" ? "Arrastra la tarjeta a otra columna para cambiar su estado. Toca la tarjeta para ver el detalle o comentar."
            : vista === "cronograma" ? "Cada barra va desde el inicio del plazo hasta la fecha límite. La línea marca hoy."
              : "Cambia el estado con el botón de color: No iniciado, En progreso o Hecho. Toca la tarea para ver el detalle o comentar."}
        </p>

        {vista === "mios" && <MisTareasPorUrgencia items={abiertas} yo={d.yo} hoy={d.hoy} comoResponsable onAbrir={setAbierto} onCambio={recargar} />}
        {vista === "tablero" && <Kanban acuerdos={d.acuerdos} yo={d.yo} hoy={d.hoy} comoResponsable onAbrir={setAbierto} onCambio={recargar} />}
        {vista === "cronograma" && <Cronograma acuerdos={d.acuerdos} hoy={d.hoy} onAbrir={setAbierto} />}
        {vista === "lista" && (
          <Agrupado items={ordenAcuerdos(d.acuerdos, d.hoy)} por="estado" hoy={d.hoy} yo={d.yo} comoResponsable onAbrir={setAbierto} onCambio={recargar} />
        )}
      </div>
    </SeccionDesplegable>
    {enDetalle && <DetalleAcuerdo key={enDetalle.id} a={enDetalle} yo={d.yo} hoy={d.hoy} comoResponsable onCambio={recargar} onCerrar={() => setAbierto(null)} />}
    </>
  );
}
