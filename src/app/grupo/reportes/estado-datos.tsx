"use client";

/**
 * Reportes · «Estado de los datos» (pedido de Jahnn, 1-nov-2026): los dos avisos de arriba —hasta cuándo llega el Excel
 * y lo que faltan por subir los administradores— no deben ser lo primero que roba la vista. Quedan en UNA línea
 * discreta con lo esencial; al tocarla se abre el detalle completo (las mismas dos tarjetas de siempre).
 * El punto cambia de color según lo más grave: verde al día, ámbar para revisar, rojo si faltan datos.
 */

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { BandaFrescura } from "@/components/banda-frescura";
import { VistaDatosReunion } from "@/components/estado-datos-reunion";
import { getListoParaReunion } from "@/app/actions/listo-reunion";
import type { FrescuraGrupo } from "@/lib/frescura-datos";
import { resumenEstadoDatos, type Gravedad } from "@/lib/estado-datos-resumen";
import type { ListoReunion } from "@/lib/kpis/listo-reunion";

const PUNTO: Record<Gravedad, string> = { ok: "bg-emerald-500", ojo: "bg-amber-500", mal: "bg-red-500" };

export function EstadoDatos({ frescura, start, end }: { frescura: FrescuraGrupo | null; start: string; end: string }) {
  const [abierto, setAbierto] = useState(false);
  const [res, setRes] = useState<{ clave: string; datos: ListoReunion | null } | null>(null);
  const clave = `${start}|${end}`;
  const rangoValido = !!start && !!end && end >= start;

  useEffect(() => {
    if (!rangoValido) return;
    let vivo = true;
    getListoParaReunion(start, end)
      .then((r) => { if (vivo) setRes({ clave, datos: r.ok ? r.data : null }); })
      .catch(() => { if (vivo) setRes({ clave, datos: null }); });
    return () => { vivo = false; };
  }, [start, end, clave, rangoValido]);

  const admins = res?.clave === clave ? res.datos : undefined;
  const { texto, gravedad } = resumenEstadoDatos(frescura, admins);
  if (!frescura && !rangoValido) return null;

  return (
    <div>
      <button
        type="button" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-xs text-gray-500 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[gravedad]}`} aria-hidden />
        <span className="min-w-0 flex-1 truncate"><span className="font-medium text-gray-700">Datos</span> · {texto}{admins === undefined && rangoValido ? " · revisando…" : ""}</span>
        <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-primary">{abierto ? "Ocultar" : "Ver detalle"}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden /></span>
      </button>
      {abierto && (
        <div className="mt-2 space-y-3">
          {frescura && <BandaFrescura frescura={frescura} />}
          {admins && <VistaDatosReunion datos={admins} start={start} end={end} />}
        </div>
      )}
    </div>
  );
}
