"use client";

/**
 * Acuerdos y tareas → Indicadores (fase 2, 19-nov-2026).
 * ¿Cumplimos lo que prometimos? Por responsable, por área y mes a mes. El periodo se mide por fecha límite.
 * Reglas en src/lib/acuerdos.ts (indicadores): lo que aún está en plazo no se juzga; sin nada que juzgar es «—».
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { getIndicadoresAcuerdos } from "@/app/actions/acuerdos";
import { indicadores, mesesHasta, periodoMes, resumir, enPeriodo, type AcuerdoIndicador, type Periodo, type Resumen } from "@/lib/acuerdos";
import { Barra, Kpi, nombreMes } from "@/components/productos/ui";

const color = (pct: number | null) => (pct === null ? "#B6BCB8" : pct >= 80 ? "#098B5F" : pct >= 60 ? "#D97706" : "#B91C1C");
const textoPct = (pct: number | null) => (pct === null ? "—" : `${pct}%`);

export function IndicadoresAcuerdos() {
  const [d, setD] = useState<{ hoy: string; acuerdos: AcuerdoIndicador[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<string>("mes:0");

  useEffect(() => {
    void getIndicadoresAcuerdos().then((r) => (r.ok ? setD({ hoy: r.hoy, acuerdos: r.acuerdos }) : setError(r.error)));
  }, []);

  const mesActual = d?.hoy.slice(0, 7) ?? "";
  const meses = useMemo(() => (mesActual ? mesesHasta(mesActual, 6) : []), [mesActual]);
  const p: Periodo | null = useMemo(() => {
    if (!d) return null;
    if (periodo === "tres") return { desde: periodoMes(meses[3]).desde, hasta: periodoMes(mesActual).hasta };
    return periodoMes(meses[meses.length - 1 - Number(periodo.split(":")[1])]);
  }, [d, periodo, meses, mesActual]);
  const r = useMemo(() => (d && p ? indicadores(d.acuerdos, d.hoy, p) : null), [d, p]);

  if (error) return <p className="text-sm text-gray-600">{error}</p>;
  if (!d || !r) return <div className="flex justify-center py-10 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  const t = r.total;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} aria-label="Periodo"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white font-medium">
          {[...meses].reverse().map((m, i) => <option key={m} value={`mes:${i}`}>{nombreMes(m)} {m.slice(0, 4)}{i === 0 ? " (en curso)" : ""}</option>)}
          <option value="tres">Últimos 3 meses</option>
        </select>
        <p className="text-xs text-gray-500 max-w-xl">Cuenta lo que tenía fecha límite en ese periodo. Lo que aún está en plazo no se juzga.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi etiqueta="Cumplido a tiempo" valor={<span style={{ color: color(t.pctATiempo) }}>{textoPct(t.pctATiempo)}</span>}
          detalle={t.juzgados ? `${t.aTiempo} de ${t.juzgados}` : "aún nada que juzgar"} />
        <Kpi etiqueta="Cumplido (con atrasos)" valor={textoPct(t.pctCumplido)} detalle={t.tarde ? `${t.tarde} entregados tarde` : "ninguno tarde"} />
        <Kpi etiqueta="Vencidos" valor={<span className={t.vencidos ? "text-red-700" : ""}>{t.vencidos}</span>} detalle="pasó la fecha sin cumplir" />
        <Kpi etiqueta="Aún en plazo" valor={t.enPlazo} detalle="no cuentan todavía" />
      </div>

      <Tabla titulo="Por responsable" filas={r.porResponsable} vacio="Nadie tiene acuerdos con fecha en este periodo." />
      <Tabla titulo="Por área" filas={r.porArea} vacio="No hay acuerdos con fecha en este periodo." />

      <section className="bg-white rounded-2xl border border-gray-200/80 px-4 py-3 sm:px-6">
        <h2 className="text-[15px] font-semibold text-gray-900">Mes a mes</h2>
        <p className="text-xs text-gray-500">% cumplido a tiempo de lo que vencía cada mes.</p>
        <ul className="mt-3 space-y-2">
          {meses.map((m) => {
            const x = resumir(d.acuerdos.filter((a) => enPeriodo(a, periodoMes(m))), d.hoy);
            return (
              <li key={m} className="grid grid-cols-[90px_1fr_110px] items-center gap-3 text-xs">
                <span className="text-gray-700">{nombreMes(m, true)}</span>
                <Barra pct={x.pctATiempo ?? 0} color={color(x.pctATiempo)} alto="h-2" />
                <span className="text-right tabular-nums text-gray-700">{textoPct(x.pctATiempo)} <span className="text-gray-400">({x.juzgados})</span></span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Tabla({ titulo, filas, vacio }: { titulo: string; filas: (Resumen & { clave: string; nombre: string })[]; vacio: string }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200/80 px-4 py-3 sm:px-6">
      <h2 className="text-[15px] font-semibold text-gray-900">{titulo}</h2>
      {filas.length === 0 ? <p className="text-sm text-gray-500 py-2">{vacio}</p> : (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                <th className="py-1 pr-3 font-medium">Nombre</th>
                <th className="py-1 pr-3 font-medium w-40">A tiempo</th>
                <th className="py-1 pr-3 text-right font-medium">A tiempo</th>
                <th className="py-1 pr-3 text-right font-medium">Tarde</th>
                <th className="py-1 pr-3 text-right font-medium">Vencidos</th>
                <th className="py-1 text-right font-medium">En plazo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filas.map((f) => (
                <tr key={f.clave}>
                  <td className="py-2 pr-3 font-medium text-gray-900">{f.nombre}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1"><Barra pct={f.pctATiempo ?? 0} color={color(f.pctATiempo)} /></div>
                      <span className="tabular-nums w-9 text-right" style={{ color: color(f.pctATiempo) }}>{textoPct(f.pctATiempo)}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{f.aTiempo}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{f.tarde || "—"}</td>
                  <td className={`py-2 pr-3 text-right tabular-nums ${f.vencidos ? "text-red-700 font-medium" : ""}`}>{f.vencidos || "—"}</td>
                  <td className="py-2 text-right tabular-nums text-gray-500">{f.enPlazo || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
