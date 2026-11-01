"use client";

/**
 * Historial de cambios de la venta diaria (pedido de Jahnn, 1-nov-2026): quién cambió la venta o las
 * personas de un día, cuándo, y de qué monto a qué monto. Plegado: carga los datos recién al abrirlo.
 */

import { useState } from "react";
import { SeccionDesplegable } from "@/components/productos/ui";
import { getCambiosVentaDiaria } from "@/app/actions/venta-diaria-cambios";
import type { CambioDeVenta } from "@/lib/venta-diaria-historial";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const cuando = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function CambiosVentaDiaria({ mes, sede }: { mes: string; sede: number | null }) {
  const [estado, setEstado] = useState<"idle" | "cargando" | "listo" | "error">("idle");
  const [cambios, setCambios] = useState<CambioDeVenta[]>([]);
  const [tablaLista, setTablaLista] = useState(true);

  async function cargar() {
    setEstado("cargando");
    const r = await getCambiosVentaDiaria(mes, sede);
    if (!r.ok) { setEstado("error"); return; }
    setCambios(r.cambios); setTablaLista(r.tablaLista); setEstado("listo");
  }

  // Solo las correcciones (había un valor antes) importan para auditar; el primer registro del día va en gris.
  return (
    <div className="mt-4">
      <SeccionDesplegable
        key={`${mes}-${sede}`}
        titulo="Cambios de la venta diaria"
        subtitulo="Quién tocó la venta o las personas de un día, cuándo y de qué monto a qué monto."
        onAbrir={cargar}
      >
        {estado === "cargando" && <p className="text-sm text-gray-500">Cargando…</p>}
        {estado === "error" && <p className="text-sm text-red-700">No se pudo leer el historial.</p>}
        {estado === "listo" && !tablaLista && <p className="text-sm text-amber-700">El historial todavía no está activado: falta correr una vez el SQL de «venta_diaria_cambios».</p>}
        {estado === "listo" && tablaLista && cambios.length === 0 && <p className="text-sm text-gray-500">Sin cambios anotados en este mes. Se anotan desde que se activó el historial.</p>}
        {estado === "listo" && cambios.length > 0 && (
          <ul className="divide-y divide-gray-100 text-sm">
            {cambios.map((c, i) => {
              const delta = c.ventaAntes === null ? null : c.ventaDespues - c.ventaAntes;
              return (
                <li key={i} className="py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium text-gray-900">{c.sede} · día {dia(c.date)}</span>
                    <span className="text-xs text-gray-500">{c.quien} · {cuando(c.creadoEn)}</span>
                  </div>
                  <div className="mt-0.5 tabular-nums text-gray-700">
                    {c.ventaAntes === null ? <>Primer registro: {soles(c.ventaDespues)} · {c.personasDespues} personas</> : (
                      <>
                        Venta {soles(c.ventaAntes)} → <b>{soles(c.ventaDespues)}</b>
                        {delta !== null && delta !== 0 && <span className={delta > 0 ? "text-amber-700" : "text-gray-500"}> ({delta > 0 ? "+" : "−"}{soles(Math.abs(delta))})</span>}
                        {c.personasAntes !== c.personasDespues && <span className="text-gray-500"> · personas {c.personasAntes ?? "—"} → {c.personasDespues}</span>}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SeccionDesplegable>
    </div>
  );
}
