"use client";

/**
 * Acuerdos y tareas → Resumen semanal (fase 4, 19-nov-2026). Para dirigir la reunión de los lunes: la última
 * semana cerrada (dom → sáb, la misma del deck) y lo que vence en la que empieza, con recomendaciones.
 * Se descarga en PDF. Cálculo en src/lib/acuerdos.ts → resumenSemanal.
 */

import { useMemo, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import type { Acuerdo, Reunion } from "@/app/actions/acuerdos";
import { AREA_LABEL, resumenSemanal } from "@/lib/acuerdos";
import { semanaDeLaReunion } from "@/lib/kpis/semana-reunion";
import { Kpi, Pastilla } from "@/components/productos/ui";
import { fechaLarga } from "@/components/acuerdos/acuerdo-item";

const mover = (f: string, n: number) => {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const dia = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`;
const color = (pct: number | null) => (pct === null ? "" : pct >= 80 ? "text-emerald-700" : pct >= 60 ? "text-amber-700" : "text-red-700");

export function ResumenSemanalVista({ acuerdos, reuniones, hoy }: { acuerdos: Acuerdo[]; reuniones: Reunion[]; hoy: string }) {
  const base = useMemo(() => semanaDeLaReunion(hoy), [hoy]);
  const semanas = useMemo(() => Array.from({ length: 6 }, (_, i) => ({ desde: mover(base.start, -7 * i), hasta: mover(base.end, -7 * i) })), [base]);
  const [i, setI] = useState(0);
  const [bajando, setBajando] = useState(false);
  const r = useMemo(() => resumenSemanal(acuerdos, reuniones, hoy, semanas[i]), [acuerdos, reuniones, hoy, semanas, i]);
  const c = r.cumplimiento;

  async function descargar() {
    setBajando(true);
    try {
      const { pdfResumenSemanal } = await import("@/lib/acuerdos-pdf");
      const { blob, filename } = pdfResumenSemanal(r);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBajando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={i} onChange={(e) => setI(Number(e.target.value))} aria-label="Semana"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white font-medium">
          {semanas.map((s, k) => <option key={s.desde} value={k}>Semana del {dia(s.desde)} al {dia(s.hasta)}{k === 0 ? " (la de la reunión)" : ""}</option>)}
        </select>
        <button type="button" onClick={() => void descargar()} disabled={bajando}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary border border-primary/30 hover:bg-primary/5 rounded-xl disabled:opacity-50">
          {bajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}Descargar PDF
        </button>
        <p className="text-xs text-gray-500">Semana de domingo a sábado, la misma del deck de los lunes.</p>
      </div>

      <section className="bg-white rounded-2xl border border-gray-200/80 px-4 py-4 sm:px-6">
        <h2 className="text-[15px] font-semibold text-gray-900">Qué recomendamos</h2>
        <ol className="mt-2 space-y-1.5 list-decimal pl-5 text-sm text-gray-800">
          {r.recomendaciones.map((t) => <li key={t}>{t}</li>)}
        </ol>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi etiqueta="Cumplido a tiempo" valor={<span className={color(c.pctATiempo)}>{c.pctATiempo === null ? "—" : `${c.pctATiempo}%`}</span>}
          detalle={c.juzgados ? `${c.aTiempo} de ${c.juzgados}${r.pctAnterior !== null ? ` · semana anterior ${r.pctAnterior}%` : ""}` : "nada vencía esa semana"} />
        <Kpi etiqueta="Siguen vencidos" valor={<span className={r.arrastrados.length ? "text-red-700" : ""}>{r.arrastrados.length}</span>} detalle="hoy, de cualquier semana" />
        <Kpi etiqueta="Vencen esta semana" valor={r.proximos.length} detalle={`del ${dia(mover(r.semana.hasta, 1))} al ${dia(mover(r.semana.hasta, 7))}`} />
        <Kpi etiqueta="Reuniones · tareas nuevas" valor={`${r.reuniones.length} · ${r.nuevos}`} detalle="registradas en la semana" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Lista titulo="Vencidos que arrastramos" vacio="Ninguno. Todo lo vencido se cumplió."
          filas={r.arrastrados.map((a) => ({ id: a.id, que: a.que, quien: a.responsableNombre, extra: <Pastilla tono="rojo">hace {a.diasAtraso} {a.diasAtraso === 1 ? "día" : "días"}</Pastilla> }))} />
        <Lista titulo="Vencen esta semana" vacio="Nada vence esta semana."
          filas={r.proximos.map((a) => ({ id: a.id, que: a.que, quien: a.responsableNombre, extra: <span className="text-gray-500">{fechaLarga(a.fechaLimite)}</span> }))} />
        {r.porConfirmar.length > 0 && (
          <Lista titulo="Esperan confirmación" vacio=""
            filas={r.porConfirmar.map((a) => ({ id: a.id, que: a.que, quien: a.responsableNombre, extra: <Pastilla tono="ambar">por confirmar</Pastilla> }))} />
        )}
        <section className="bg-white rounded-2xl border border-gray-200/80 px-4 py-3 sm:px-6">
          <h2 className="text-[15px] font-semibold text-gray-900">Por responsable</h2>
          <p className="text-xs text-gray-500">Lo que vencía en la semana.</p>
          {r.porResponsable.length === 0 ? <p className="text-sm text-gray-500 py-2">Nadie tenía fechas esa semana.</p> : (
            <ul className="mt-2 divide-y divide-gray-100">
              {r.porResponsable.map((p) => (
                <li key={p.clave} className="py-1.5 flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="font-medium text-gray-900 flex-1">{p.nombre}</span>
                  <span className={`font-semibold ${color(p.pctATiempo)}`}>{p.pctATiempo === null ? "en plazo" : `${p.pctATiempo}%`}</span>
                  <span className="text-gray-500">{p.aTiempo} a tiempo · {p.tarde} tarde · {p.vencidos} {p.vencidos === 1 ? "vencido" : "vencidos"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {r.reuniones.length > 0 && (
          <section className="bg-white rounded-2xl border border-gray-200/80 px-4 py-3 sm:px-6">
            <h2 className="text-[15px] font-semibold text-gray-900">Reuniones de la semana</h2>
            <ul className="mt-2 space-y-1 text-xs">
              {r.reuniones.map((x) => <li key={`${x.fecha}-${x.titulo}`}><span className="text-gray-500">{dia(x.fecha)}</span> · <span className="font-medium text-gray-900">{x.titulo}</span> · {AREA_LABEL[x.area]}</li>)}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Lista({ titulo, vacio, filas }: { titulo: string; vacio: string; filas: { id: number; que: string; quien: string; extra: React.ReactNode }[] }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200/80 px-4 py-3 sm:px-6">
      <h2 className="text-[15px] font-semibold text-gray-900">{titulo} ({filas.length})</h2>
      {filas.length === 0 ? <p className="text-sm text-gray-500 py-2">{vacio}</p> : (
        <ul className="mt-2 divide-y divide-gray-100">
          {filas.map((f) => (
            <li key={f.id} className="py-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <span className="font-medium text-gray-900 flex-1 min-w-0">{f.que}</span>
              <span className="text-gray-600">{f.quien}</span>
              {f.extra}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
