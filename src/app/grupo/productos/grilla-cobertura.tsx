"use client";

/**
 * La grilla sede × mes de los reportes de Byte (ventas por producto · mayor
 * rotación), como tarjetas: de abril al mes en curso, con lo vendido, si el mes
 * está completo, qué días faltan y quién lo subió y cuándo. Pedido de Jahnn,
 * 4-oct-2026: "una vista más gráfica, tipo calendario". La usan «Cargas de
 * Byte» y la ventana «Subir Reportes Gerencia». Estados: lib/productos/cobertura-rotacion.ts.
 */

import { formatCurrency } from "@/lib/utils";
import { celdaCobertura, marcarSospechosas, type CeldaCobertura, type PeriodoCargado } from "@/lib/productos/cobertura-rotacion";
import { fechaCorta, mesesDesdeAbril } from "@/lib/productos/cobertura-datos";
import { faltaDeSede } from "@/lib/productos/falta-subir";

export const SEDES_GRILLA = [
  { id: 2, nombre: "Fonavi" },
  { id: 3, nombre: "Centro" },
  { id: 1, nombre: "Atelier" },
];

const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];
const titulo = (m: string) => `${MESES_LARGOS[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;

const QUIEN: Record<NonNullable<CeldaCobertura["quien"]>, string> = {
  direccion: "subió gerencia",
  sede: "subió administración",
  ambos: "administración + gerencia",
};

function tono(c: CeldaCobertura, enCurso: boolean): string {
  if (c.sospechosa) return "bg-red-50 border-red-200 text-red-900";
  if (c.estado === "completo" || c.estado === "en-curso") return "bg-emerald-50 border-emerald-200 text-emerald-900";
  if (c.estado === "parcial") return "bg-amber-50 border-amber-300 text-amber-900";
  return enCurso ? "bg-amber-50/60 border-amber-200 text-amber-800" : "bg-red-50 border-red-200 text-red-700";
}

export function GrillaCobertura({ hoy, periodos, compacto = false, sedeElegida = null, onCelda }: {
  hoy: string;
  periodos: PeriodoCargado[];
  /** Tarjetas más angostas (dentro de la ventana de subida). */
  compacto?: boolean;
  sedeElegida?: number | null;
  onCelda: (sedeId: number) => void;
}) {
  const meses = mesesDesdeAbril(hoy);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1.5">
        <thead>
          <tr>
            <th className={`text-left font-medium text-gray-500 px-1 ${compacto ? "text-[11px]" : "text-xs"}`}>Sede</th>
            {meses.map((m) => (
              <th key={m} className={`text-left font-medium text-gray-500 px-1 whitespace-nowrap ${compacto ? "text-[11px]" : "text-xs"}`}>
                {compacto ? MESES_LARGOS[Number(m.slice(5, 7)) - 1] : titulo(m)}{m === hoy.slice(0, 7) ? " · en curso" : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SEDES_GRILLA.map((s) => {
            const celdas = marcarSospechosas(meses.map((m) => celdaCobertura(periodos.filter((p) => p.businessId === s.id), m, hoy)));
            return (
              <tr key={s.id}>
                <td className={`px-1 font-semibold whitespace-nowrap align-middle ${s.id === sedeElegida ? "text-primary" : "text-gray-800"} ${compacto ? "text-xs" : "text-sm"}`}>{s.nombre}</td>
                {celdas.map((c) => {
                  const enCurso = c.month === hoy.slice(0, 7);
                  return (
                    <td key={c.month} className="align-top">
                      <button type="button" onClick={() => onCelda(s.id)} aria-label={`${s.nombre}, ${titulo(c.month)}`}
                        className={`w-full text-left rounded-xl border hover:ring-2 hover:ring-primary/30 ${compacto ? "min-w-[5.75rem] px-2 py-1.5 text-[11px]" : "min-w-[9.5rem] px-3 py-2.5 text-xs"} ${tono(c, enCurso)} ${s.id === sedeElegida ? "ring-1 ring-primary/40" : ""}`}>
                        {c.estado === "vacio" ? (
                          <span className={`font-medium ${compacto ? "" : "text-sm"}`}>{enCurso ? "Aún sin subir" : "Sin reporte"}</span>
                        ) : (
                          <>
                            <div className={`font-semibold tabular-nums ${compacto ? "text-xs" : "text-base"}`}>{formatCurrency(c.ventas)}</div>
                            <div className="mt-0.5 font-medium">
                              {c.estado === "completo" ? "mes completo" : c.estado === "en-curso" ? `al día · ${c.diasCubiertos} días` : `${c.diasCubiertos} de ${c.diasMes} días`}
                            </div>
                            {c.faltan && <div className="font-medium">falta: {c.faltan}</div>}
                            {c.quien && !compacto && <div className="mt-0.5 opacity-80">{QUIEN[c.quien]}{c.cargadoEl ? ` · ${fechaCorta(c.cargadoEl)}` : ""}</div>}
                            {c.sospechosa && <div className="mt-0.5 font-semibold">vende muy poco: ¿carga parcial? vuelve a subirlo</div>}
                          </>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** «Falta subir: …» por sede, en palabras (debajo de la grilla). */
export function FaltaSubir({ hoy, periodos }: { hoy: string; periodos: PeriodoCargado[] }) {
  const meses = mesesDesdeAbril(hoy);
  return (
    <ul className="space-y-0.5 text-[11px] leading-snug">
      {SEDES_GRILLA.map((s) => {
        const falta = faltaDeSede(meses.map((m) => celdaCobertura(periodos.filter((p) => p.businessId === s.id), m, hoy)), hoy);
        return (
          <li key={s.id} className={falta.length === 0 ? "text-emerald-700" : "text-gray-600"}>
            <strong className="text-gray-800">{s.nombre}:</strong> {falta.length === 0 ? "al día, no falta ningún mes" : <>falta subir {falta.join(" · ")}</>}
          </li>
        );
      })}
    </ul>
  );
}
