"use client";

/**
 * La grilla sede × mes de los reportes de Byte, como tarjetas: de abril al mes
 * en curso. Cada tarjeta dice cuáles de los TRES reportes están (reporte de
 * ventas, mayor rotación, menor rotación) y cuáles faltan o están incompletos.
 * Pedido de Jahnn, 4-oct-2026: «una vista tipo calendario» y «saber qué archivo
 * es el que falta, para no estar subiendo los tres siempre». La usan «Cargas de
 * Byte» y la ventana «Subir Reportes Gerencia». Lógica: lib/productos/estado-reportes.ts.
 */

import { formatCurrency } from "@/lib/utils";
import { celdaCobertura, marcarSospechosas, type CeldaCobertura, type PeriodoCargado } from "@/lib/productos/cobertura-rotacion";
import { fechaCorta, mesesDesdeAbril } from "@/lib/productos/cobertura-datos";
import { NOMBRE_REPORTE, reportesQueFaltan, todoCompleto, tresReportes, type DetalleReporte, type TipoReporte, type TresReportes, type VentasDelMes } from "@/lib/productos/estado-reportes";

export const SEDES_GRILLA = [
  { id: 2, nombre: "Fonavi" },
  { id: 3, nombre: "Centro" },
  { id: 1, nombre: "Atelier" },
];

export type DatosCobertura = {
  hoy: string;
  periodos: PeriodoCargado[];
  ventas: VentasDelMes[];
  menor: { businessId: number; desde: string; hasta: string }[];
};

const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];
const titulo = (m: string) => `${MESES_LARGOS[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;
const nombreMes = (m: string) => MESES_LARGOS[Number(m.slice(5, 7)) - 1].toLowerCase();

const QUIEN: Record<NonNullable<CeldaCobertura["quien"]>, string> = {
  direccion: "subió gerencia",
  sede: "subió administración",
  ambos: "administración + gerencia",
};

/** La información completa de una casilla: la cobertura de mayor rotación más el estado de los tres reportes. */
export function casilla(datos: DatosCobertura, sedeId: number, month: string, celdaMayor?: CeldaCobertura): { celda: CeldaCobertura; tres: TresReportes } {
  const periodosSede = datos.periodos.filter((p) => p.businessId === sedeId);
  const celda = celdaMayor ?? celdaCobertura(periodosSede, month, datos.hoy);
  const tres = tresReportes({
    celda, month, hoy: datos.hoy, periodos: periodosSede.filter((p) => p.month === month),
    ventas: datos.ventas.find((v) => v.businessId === sedeId && v.month === month),
    menor: datos.menor.filter((m) => m.businessId === sedeId),
  });
  return { celda, tres };
}

const MARCA: Record<DetalleReporte["estado"], { s: string; clase: string }> = {
  completo: { s: "✓", clase: "text-emerald-700" },
  parcial: { s: "!", clase: "text-amber-700" },
  vacio: { s: "✕", clase: "text-red-600" },
};
const ETIQUETA_CORTA: Record<TipoReporte, string> = { ventas: "Ventas", mayor: "Mayor", menor: "Menor" };

function tono(celda: CeldaCobertura, tres: TresReportes, enCurso: boolean): string {
  if (celda.sospechosa) return "bg-red-50 border-red-200 text-red-900";
  if (todoCompleto(tres)) return "bg-emerald-50 border-emerald-200 text-emerald-900";
  if (tres.mayor.estado === "vacio") return enCurso ? "bg-amber-50/60 border-amber-200 text-amber-900" : "bg-red-50 border-red-200 text-red-800";
  return "bg-amber-50 border-amber-300 text-amber-900";
}

export function GrillaCobertura({ datos, compacto = false, elegido = null, onCelda }: {
  datos: DatosCobertura;
  /** Tarjetas más angostas (dentro de la ventana de subida). */
  compacto?: boolean;
  /** La sede y el mes que se van a subir: su tarjeta se resalta. */
  elegido?: { sede: number | null; mes: string | null } | null;
  onCelda: (sedeId: number, month: string) => void;
}) {
  const { hoy } = datos;
  const meses = mesesDesdeAbril(hoy);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1.5">
        <thead>
          <tr>
            <th className={`text-left font-medium text-gray-500 px-1 ${compacto ? "text-[11px]" : "text-xs"}`}>Sede</th>
            {meses.map((m) => (
              <th key={m} className={`text-left font-medium px-1 whitespace-nowrap ${compacto ? "text-[11px]" : "text-xs"} ${elegido?.mes === m ? "text-primary" : "text-gray-500"}`}>
                {compacto ? MESES_LARGOS[Number(m.slice(5, 7)) - 1] : titulo(m)}{m === hoy.slice(0, 7) ? " · en curso" : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SEDES_GRILLA.map((s) => {
            const celdas = marcarSospechosas(meses.map((m) => celdaCobertura(datos.periodos.filter((p) => p.businessId === s.id), m, hoy)));
            return (
              <tr key={s.id}>
                <td className={`px-1 font-semibold whitespace-nowrap align-middle ${s.id === elegido?.sede ? "text-primary" : "text-gray-800"} ${compacto ? "text-xs" : "text-sm"}`}>{s.nombre}</td>
                {celdas.map((c) => {
                  const enCurso = c.month === hoy.slice(0, 7);
                  const { tres } = casilla(datos, s.id, c.month, c);
                  const falta = reportesQueFaltan(tres);
                  const esElegida = s.id === elegido?.sede && c.month === elegido?.mes;
                  const resumenTitulo = falta.length === 0 ? "los 3 reportes completos" : `falta: ${falta.map((k) => `${NOMBRE_REPORTE[k].toLowerCase()} (${tres[k].texto})`).join(", ")}`;
                  return (
                    <td key={c.month} className="align-top">
                      <button type="button" onClick={() => onCelda(s.id, c.month)} aria-pressed={esElegida} aria-label={`${s.nombre}, ${titulo(c.month)}: ${resumenTitulo}`} title={resumenTitulo}
                        className={`w-full text-left rounded-xl border hover:ring-2 hover:ring-primary/30 ${compacto ? "min-w-[5.75rem] px-2 py-1.5 text-[11px]" : "min-w-[9.5rem] px-3 py-2.5 text-xs"} ${tono(c, tres, enCurso)} ${esElegida ? "ring-2 ring-primary" : ""}`}>
                        <div className={`font-semibold tabular-nums ${compacto ? "text-xs" : "text-sm"}`}>
                          {falta.length === 0 ? "✓ Completo" : `Falta${falta.length > 1 ? "n" : ""} ${falta.length} de 3`}
                        </div>
                        <ul className={`mt-1 space-y-0.5 ${compacto ? "" : "text-[11px]"}`}>
                          {(Object.keys(tres) as TipoReporte[]).map((k) => (
                            <li key={k} className="flex items-baseline justify-between gap-1.5">
                              <span className="font-medium">{ETIQUETA_CORTA[k]}</span>
                              <span className={`font-bold ${MARCA[tres[k].estado].clase}`} aria-hidden>{MARCA[tres[k].estado].s}</span>
                              <span className="sr-only">{tres[k].estado === "completo" ? "completo" : tres[k].estado === "parcial" ? "incompleto" : "falta"}</span>
                            </li>
                          ))}
                        </ul>
                        {!compacto && c.estado !== "vacio" && (
                          <div className="mt-1.5 border-t border-black/10 pt-1 opacity-90">
                            <div className="tabular-nums">{formatCurrency(c.ventas)} en productos</div>
                            {(Object.keys(tres) as TipoReporte[]).filter((k) => tres[k].estado === "parcial").map((k) => (
                              <div key={k} className="font-medium">{ETIQUETA_CORTA[k]}: {tres[k].texto}</div>
                            ))}
                            {c.quien && <div className="opacity-80">{QUIEN[c.quien]}{c.cargadoEl ? ` · ${fechaCorta(c.cargadoEl)}` : ""}</div>}
                          </div>
                        )}
                        {c.sospechosa && <div className="mt-0.5 font-semibold">vende muy poco: ¿carga parcial? vuelve a subirlo</div>}
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

/** Junta meses seguidos: «abril a agosto», «octubre». */
export function mesesEnPalabras(meses: string[]): string {
  const orden = [...meses].sort();
  const tramos: string[][] = [];
  for (const m of orden) {
    const t = tramos[tramos.length - 1];
    const [y, mo] = m.split("-").map(Number);
    const sig = t ? t[t.length - 1] : null;
    const esSiguiente = sig !== null && (() => { const [y0, m0] = sig.split("-").map(Number); return y0 * 12 + m0 + 1 === y * 12 + mo; })();
    if (t && esSiguiente) t.push(m); else tramos.push([m]);
  }
  return tramos.map((t) => (t.length === 1 ? nombreMes(t[0]) : `${nombreMes(t[0])} a ${nombreMes(t[t.length - 1])}`)).join(" · ");
}

/** Qué reporte falta en cada mes, por sede, en palabras (debajo de la grilla). */
export function FaltaSubir({ datos, soloSede = null }: { datos: DatosCobertura; soloSede?: number | null }) {
  const meses = mesesDesdeAbril(datos.hoy);
  const sedes = SEDES_GRILLA.filter((s) => soloSede === null || s.id === soloSede);
  return (
    <ul className="space-y-1.5 text-[11px] leading-snug">
      {sedes.map((s) => {
        const porReporte: Record<TipoReporte, string[]> = { ventas: [], mayor: [], menor: [] };
        // Mayor rotación: se agrupan los meses que fallan por la misma razón («abril a junio: solo de la sede, falta el tuyo»).
        const mayorPorRazon = new Map<string, string[]>();
        for (const m of meses) {
          const { tres } = casilla(datos, s.id, m);
          for (const k of reportesQueFaltan(tres)) {
            if (k === "mayor") {
              const razon = tres.mayor.estado === "vacio" ? "" : tres.mayor.texto;
              mayorPorRazon.set(razon, [...(mayorPorRazon.get(razon) ?? []), m]);
            } else porReporte[k].push(m);
          }
        }
        const detalleMayor = [...mayorPorRazon.entries()].map(([razon, ms]) => (razon ? `${mesesEnPalabras(ms)}: ${razon}` : mesesEnPalabras(ms)));
        const lineas: string[] = [];
        if (porReporte.ventas.length) lineas.push(`Reporte de ventas: ${mesesEnPalabras(porReporte.ventas)}`);
        if (detalleMayor.length) lineas.push(`Mayor rotación: ${detalleMayor.join(" · ")}`);
        if (porReporte.menor.length) lineas.push(`Menor rotación: ${mesesEnPalabras(porReporte.menor)}`);
        return (
          <li key={s.id}>
            <strong className="text-gray-800">{s.nombre}</strong>
            {lineas.length === 0
              ? <span className="text-emerald-700"> · al día, no falta ningún reporte</span>
              : <ul className="mt-0.5 space-y-0.5 pl-3 text-gray-600">{lineas.map((l) => <li key={l}>{l}</li>)}</ul>}
          </li>
        );
      })}
    </ul>
  );
}
