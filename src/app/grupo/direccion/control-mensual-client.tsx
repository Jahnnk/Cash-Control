"use client";

/**
 * Sistema de Dirección · Control mensual (pedido de Jahnn, 6-oct-2026, capítulo «Tu sistema
 * mensual de control financiero»). Tres piezas, todas plegadas con su resumen a la vista:
 *   · Revisión semanal (los lunes): las 4 tarjetas del libro por sede y «Marcar revisada».
 *   · Cierre de mes: las 6 preguntas del dueño y los 5 pasos de la revisión mensual.
 *   · Checklist mensual: 12 puntos; el sistema dice si los datos están listos, el dueño marca.
 * Reglas: lib/control-mensual.ts y lib/compromisos.ts · datos: actions/control-mensual.ts.
 *
 * Rediseño UX (8-oct-2026): cada tarjeta semanal se titula con su pregunta y cada sede responde
 * primero con la conclusión (el detalle, al tocar). Cerrada, la revisión dice QUÉ está en rojo
 * o ámbar, no cuántas casillas. El cierre junta las 6 preguntas en UNA tabla (que además es el
 * estado de resultados y el punto de equilibrio) y deja en texto solo lo que no cabe en ella.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Loader2, CheckCircle2, AlertTriangle, Trash2 } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import {
  agregarCompromiso, getCierreMes, getRevisionSemanal, marcarCheck, marcarSemanaRevisada, quitarCompromiso,
  type DatosCierre, type DatosSemana, type SedeCierre, type SedeSemana,
} from "@/app/actions/control-mensual";
import { avanceChecklist, CHECKLIST, DIAS_CARGA_COBROS, type Semaforo, type Variacion } from "@/lib/control-mensual";
import { Pastilla, SeccionDesplegable } from "@/components/productos/ui";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (m: string) => MESES[Number(m.slice(5, 7)) - 1];
const soles = (n: number) => `S/${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const conSigno = (n: number) => `${n < 0 ? "−" : ""}${soles(n)}`;
const pct = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;
const dia = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const fechaCorta = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "UTC" });
const mesMas = (mes: string, n: number) => {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const PUNTO: Record<Semaforo, string> = { verde: "bg-emerald-600", ambar: "bg-amber-500", rojo: "bg-red-600", gris: "bg-gray-300" };
const TEXTO: Record<Semaforo, string> = { verde: "text-emerald-700", ambar: "text-amber-700", rojo: "text-red-700", gris: "text-gray-500" };
function Punto({ s }: { s: Semaforo }) {
  return <span aria-hidden className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${PUNTO[s]}`} />;
}

// ── Revisión semanal: las 4 tarjetas del libro ─────────────────────────────

function Tarjeta({ titulo, libro, children }: { titulo: string; libro: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200/80 bg-white p-4 min-w-0">
      <h4 className="font-semibold text-gray-900 leading-tight">{titulo}</h4>
      <p className="text-[11px] text-gray-400 mt-0.5">{libro}</p>
      <div className="divide-y divide-gray-100 mt-2">{children}</div>
    </div>
  );
}

function FilaSede({ s, sede, resumen, children }: { s: Semaforo; sede: string; resumen: ReactNode; children?: ReactNode }) {
  return (
    <details className="group py-2">
      <summary className="flex cursor-pointer list-none items-start gap-2 text-sm">
        <span className="mt-1.5"><Punto s={s} /></span>
        <span className="font-medium text-gray-900 w-14 sm:w-16 shrink-0">{sede}</span>
        <span className={`min-w-0 flex-1 ${TEXTO[s]}`}>{resumen}</span>
        {children && <span className="text-[11px] text-primary group-open:hidden shrink-0">Ver</span>}
      </summary>
      {children && <div className="mt-2 pl-6 text-xs text-gray-700 space-y-1.5">{children}</div>}
    </details>
  );
}

/** La conclusión primero: ¿el saldo cubre los pagos? (antes decía «quedan S/28,868» sumando ventas
 *  futuras sin avisarlo, y parecía más plata de la que hay en el banco). */
function resumenLiquidez(l: NonNullable<SedeSemana["liquidez"]>): string {
  if (l.libre14 < 0) return `Faltan ${soles(l.libre14)} para los pagos de 14 días, aun con las ventas`;
  if (l.saldo < l.compromisos7) return `El saldo (${soles(l.saldo)}) no cubre los pagos de esta semana (${soles(l.compromisos7)}): depende de las ventas`;
  return `Saldo ${soles(l.saldo)} · cubre los pagos de 14 días (${soles(l.compromisos14)})`;
}

/** Lo que no está en verde, para el resumen de la revisión cerrada («Atelier · ventas»). */
function pendientesSemana(d: DatosSemana): { texto: string; s: Semaforo }[] {
  const out: { texto: string; s: Semaforo }[] = [];
  for (const sd of d.sedes) {
    const temas: [Semaforo, string][] = [
      [sd.liquidez?.semaforo ?? "gris", "pagos"], [sd.cobros?.semaforo ?? "verde", "cobros"],
      [sd.ritmo.semaforo, "ventas"], [sd.noPrevistos.semaforo, "gastos"],
    ];
    for (const [s, t] of temas) if (s === "rojo" || s === "ambar") out.push({ texto: `${sd.sede} · ${t}`, s });
  }
  return out.sort((a, b) => (a.s === b.s ? 0 : a.s === "rojo" ? -1 : 1));
}

function Compromisos({ s, onCambio }: { s: SedeSemana; onCambio: () => void }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ fecha: "", concepto: "", monto: "" });
  const [busy, setBusy] = useState(false);
  async function agregar() {
    setBusy(true);
    const r = await agregarCompromiso({ businessId: s.businessId, fecha: form.fecha, concepto: form.concepto, monto: Number(form.monto) });
    setBusy(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    setForm({ fecha: "", concepto: "", monto: "" });
    onCambio();
  }
  async function quitar(c: SedeSemana["compromisos"][number]) {
    const r = await quitarCompromiso({ businessId: s.businessId, id: c.id, clave: c.clave });
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(c.origen === "manual" ? "Compromiso borrado." : "No se cuenta este mes.", "success");
    onCambio();
  }
  return (
    <>
      {s.compromisos.length === 0 ? <p className="text-gray-500">Ningún pago fijo detectado en estos días.</p> : (
        <table className="w-full">
          <tbody>
            {s.compromisos.map((c, k) => (
              <tr key={k} className="align-top">
                <td className="py-0.5 pr-2 whitespace-nowrap text-gray-500">{fechaCorta(c.fecha)}</td>
                <td className="py-0.5 pr-2">{c.concepto}{c.origen === "manual" && <span className="text-gray-400"> · anotado</span>}</td>
                <td className="py-0.5 text-right tabular-nums whitespace-nowrap">{soles(c.monto)}</td>
                <td className="py-0.5 pl-1">
                  {c.origen !== "credito" && (
                    <button type="button" onClick={() => quitar(c)} title={c.origen === "manual" ? "Borrar" : "No contar este mes"} className="text-gray-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex flex-wrap items-end gap-1.5 pt-1">
        <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} aria-label="Fecha del pago" className="rounded border border-gray-300 px-1.5 py-1 text-xs" />
        <input value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} placeholder="Qué se paga" aria-label="Qué se paga" className="w-32 rounded border border-gray-300 px-1.5 py-1 text-xs" />
        <input value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} inputMode="decimal" placeholder="S/" aria-label="Monto" className="w-20 rounded border border-gray-300 px-1.5 py-1 text-xs tabular-nums" />
        <button type="button" onClick={agregar} disabled={busy} className="rounded bg-primary px-2 py-1 text-xs font-medium text-white disabled:opacity-50">Anotar pago</button>
      </div>
    </>
  );
}

export function VistaSemana({ d, onCambio }: { d: DatosSemana; onCambio: () => void }) {
  return (
    <div className="space-y-4">
      {d.avisos.map((a, k) => <p key={k} className="flex gap-1.5 text-xs text-amber-800"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{a}</p>)}
      <div className="grid gap-3 lg:grid-cols-2">
        <Tarjeta titulo="¿Alcanza la plata para los pagos que vienen?" libro="Saldo bancario vs. compromisos">
          {d.sedes.map((s) => s.liquidez ? (
            <FilaSede key={s.businessId} s={s.liquidez.semaforo} sede={s.sede} resumen={resumenLiquidez(s.liquidez)}>
              <p>Saldo del banco y caja al {fechaCorta(s.liquidez.saldoAl ?? d.hoy)} (Excel): <b>{soles(s.liquidez.saldo)}</b>. Pagos en 7 días: <b>{soles(s.liquidez.compromisos7)}</b>; en 14: <b>{soles(s.liquidez.compromisos14)}</b>.</p>
              <p className="text-gray-500">Mientras tanto suelen entrar unos {soles(s.liquidez.entradas)} por ventas (90% del promedio de las últimas 4 semanas): al cabo de 14 días {s.liquidez.libre14 >= 0 ? `quedarían ${soles(s.liquidez.libre14)}` : `faltarían ${soles(s.liquidez.libre14)}`}.</p>
              <Compromisos s={s} onCambio={onCambio} />
            </FilaSede>
          ) : <FilaSede key={s.businessId} s="gris" sede={s.sede} resumen="Sin lectura del banco en el Excel." />)}
        </Tarjeta>

        <Tarjeta titulo="¿Hay cobros por gestionar esta semana?" libro="Cobros pendientes">
          {d.sedes.map((s) => !s.cobros ? (
            <FilaSede key={s.businessId} s="verde" sede={s.sede} resumen="No vende al crédito" />
          ) : (
            <FilaSede key={s.businessId} s={s.cobros.semaforo} sede={s.sede}
              resumen={s.cobros.diasDesdeCarga === null || s.cobros.diasDesdeCarga > DIAS_CARGA_COBROS
                ? <>Sin dato: el reporte de cobros tiene {s.cobros.diasDesdeCarga ?? "—"} días</>
                : <>Por cobrar {soles(s.cobros.porCobrar)} · atrasado {soles(s.cobros.atrasado)}</>}>
              {s.cobros.diasDesdeCarga === null || s.cobros.diasDesdeCarga > DIAS_CARGA_COBROS ? (
                <p className="text-amber-800">Luis tiene que subir cada sábado, en su panel, el «Reporte de Ventas» y el «Consolidado de Facturas» de Byte. Lo último que hay{s.cobros.ultimaCarga ? ` (${fechaCorta(s.cobros.ultimaCarga)})` : ""}: {soles(s.cobros.porCobrar)} por cobrar.</p>
              ) : null}
              {s.cobros.deudores.map((x) => (
                <p key={x.cliente} className="flex justify-between gap-2"><span>{x.cliente}{x.esSede ? " (sede)" : ""}</span><span className="tabular-nums">{soles(x.deuda)}{x.atrasado > 0 ? <span className="text-red-700"> · {soles(x.atrasado)} atrasado</span> : null}</span></p>
              ))}
            </FilaSede>
          ))}
        </Tarjeta>

        <Tarjeta titulo="¿Vamos al ritmo de la meta del mes?" libro="Ventas de la semana">
          {d.sedes.map((s) => {
            const r = s.ritmo;
            return (
              <FilaSede key={s.businessId} s={r.semaforo} sede={s.sede}
                resumen={r.meta === null || r.proyeccion === null ? <>Semana {soles(r.ventasSemana)} · sin meta del mes</> : <>Cerraría en {soles(r.proyeccion)} · meta {soles(r.meta)}</>}>
                <p>Semana del {fechaCorta(d.semana.desde)} al {fechaCorta(d.semana.hasta)}: <b>{soles(r.ventasSemana)}</b>. En el mes van <b>{soles(r.ventasMes)}</b>{s.ventasHasta ? ` (hasta el ${fechaCorta(s.ventasHasta)})` : ""}.</p>
                {r.proyeccion !== null && <p>Al ritmo {r.proyeccionEs === "semana" ? "de la última semana" : "del mes"}, cerraría en <b>{soles(r.proyeccion)}</b>.</p>}
                {r.meta !== null && <p>Meta: <b>{soles(r.meta)}</b> ({r.metaEs === "presupuesto" ? "venta esperada del presupuesto" : "punto de equilibrio"}){r.pe !== null && r.metaEs === "presupuesto" ? ` · equilibrio ${soles(r.pe)}` : ""}.</p>}
                {r.porDia !== null && r.falta !== null && r.falta > 0 && <p>Faltan {soles(r.falta)} en {r.diasRestantes} días: <b>{soles(r.porDia)} por día</b>.</p>}
              </FilaSede>
            );
          })}
        </Tarjeta>

        <Tarjeta titulo="¿Hubo gastos fuera del plan?" libro="Gastos no previstos">
          {d.sedes.map((s) => {
            const n = s.noPrevistos;
            const nada = !n.desvios.length && !n.sobreTope.length;
            return (
              <FilaSede key={s.businessId} s={n.semaforo} sede={s.sede}
                resumen={n.semaforo === "gris" ? "Sin presupuesto aprobado" : nada ? "Todo dentro del plan" : <>{soles(n.total)} fuera del plan{n.sobreTope.length ? ` · ${n.sobreTope.length} sobre el tope en Control de Caja` : ""}</>}>
                {n.desvios.map((x) => (
                  <p key={x.categoria} className="flex justify-between gap-2"><span>{x.categoria.charAt(0) + x.categoria.slice(1).toLowerCase()} {x.sinPlan ? "(sin presupuesto)" : `(${pct(x.ejecucion ?? 0)})`}</span><span className="tabular-nums text-red-700">+{soles(x.variacion)}</span></p>
                ))}
                {n.sobreTope.map((x, k) => <p key={k}>Control de Caja · {x.tipo === "lista" ? "lista" : x.descripcion}{x.monto ? ` ${soles(x.monto)}` : ""} ({fechaCorta(x.fecha)}): «{x.motivo}»</p>)}
                {!nada && n.total > 0 && <p className="text-gray-500">Si no se compensa, el flujo del mes baja en {soles(n.total)}.</p>}
              </FilaSede>
            );
          })}
        </Tarjeta>
      </div>
    </div>
  );
}

function MarcarSemana({ d, onCambio }: { d: DatosSemana; onCambio: () => void }) {
  const { showToast } = useToast();
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  async function marcar(revisada: boolean) {
    setBusy(true);
    const r = await marcarSemanaRevisada({ semana: d.semana.desde, nota, revisada });
    setBusy(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(revisada ? "Semana marcada como revisada." : "Revisión deshecha.", "success");
    onCambio();
  }
  if (d.revisada) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-emerald-700">
        <CheckCircle2 className="w-4 h-4" /> Revisada el {dia(d.revisada.el)}{d.revisada.por ? ` por ${d.revisada.por === "jahnn" ? "Jahnn" : "Kelly"}` : ""}{d.revisada.nota ? ` · «${d.revisada.nota}»` : ""}
        <button type="button" onClick={() => marcar(false)} disabled={busy} className="text-xs text-gray-500 underline underline-offset-2">Deshacer</button>
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-gray-600 flex-1 min-w-48"><span className="block mb-1">Nota (opcional): qué decidiste esta semana</span>
        <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: pedir a Luis que cobre a Fonavi antes del viernes" className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
      </label>
      <button type="button" onClick={() => marcar(true)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Marcar semana como revisada
      </button>
    </div>
  );
}

// ── Cierre de mes ─────────────────────────────────────────────────────────

function Cambio({ v, inverso = false, esPct = false }: { v: Variacion; inverso?: boolean; esPct?: boolean }) {
  if (v.diferencia === null || Math.abs(v.diferencia) < 0.5) return null;
  const bueno = inverso ? v.diferencia < 0 : v.diferencia > 0;
  return (
    <span className={`text-[11px] font-normal whitespace-nowrap ${bueno ? "text-emerald-700" : "text-red-700"}`}>
      {v.diferencia > 0 ? "▲" : "▼"} {esPct ? `${Math.abs(v.diferencia).toLocaleString("es-PE", { maximumFractionDigits: 1 })} pts` : soles(v.diferencia)}
    </span>
  );
}

/** Una fila de la tabla del cierre: la pregunta del libro (corta en el celular) y su respuesta por sede. */
function Fila({ pregunta, corta, grupo, valor, sedes, fuerte = false }: {
  pregunta: string; corta: string; grupo?: ReactNode; valor: (s: SedeCierre) => ReactNode; sedes: SedeCierre[]; fuerte?: boolean;
}) {
  return (
    <tr className={fuerte ? "border-t border-gray-300" : ""}>
      <th scope="row" className="text-left font-normal py-2 pr-2 align-top">
        <span className={`hidden sm:inline ${fuerte ? "font-semibold text-gray-900" : "text-gray-700"}`}>{pregunta}</span>
        <span className={`sm:hidden ${fuerte ? "font-semibold text-gray-900" : "text-gray-700"}`}>{corta}</span>
      </th>
      <td className={`py-2 px-2 text-right tabular-nums align-top ${fuerte ? "font-semibold" : ""}`}>{grupo ?? <span className="text-gray-300">·</span>}</td>
      {sedes.map((s) => <td key={s.businessId} className={`py-2 pl-2 text-right tabular-nums align-top ${fuerte ? "font-semibold" : ""}`}>{valor(s)}</td>)}
    </tr>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-gray-900">{titulo}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function PorSedeTexto({ sede, children }: { sede: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[3.5rem_1fr] sm:grid-cols-[4.5rem_1fr] gap-2 text-sm leading-snug">
      <span className="font-medium text-gray-900">{sede}</span>
      <span className="text-gray-700 min-w-0">{children}</span>
    </div>
  );
}

const cat = (c: string) => c.charAt(0) + c.slice(1).toLowerCase();

export function VistaCierre({ c }: { c: DatosCierre }) {
  const m = nombreMes(c.mes), sig = nombreMes(c.siguiente), ant = nombreMes(mesMas(c.mes, -1));
  const g = c.grupo;
  const conImpuestos = c.sedes.some((s) => s.impuestos > 0);
  const monto = (v: number | null) => (v !== null ? soles(v) : "—");
  return (
    <div className="space-y-7">
      {g.provisional && <p className="text-xs text-amber-800">Algún Excel no llega a fin de {m}: los resultados son provisionales.</p>}

      {/* Pasos 1 y 4 del libro: el estado de resultados y el punto de equilibrio, con las 6 preguntas. */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900">Estado de resultados simplificado</h4>
        <p className="text-xs text-gray-500 mt-0.5">Las 6 preguntas que todo dueño debe poder responder, con los números de {m}. Las flechas comparan con {ant}.</p>
        <div className="mt-3 -mx-1 px-1 overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="text-[10px] sm:text-[11px] uppercase tracking-wide text-gray-500">
                <th className="text-left font-medium pb-1.5"><span className="sr-only">Pregunta</span></th>
                <th className="text-right font-medium pb-1.5 px-2">Grupo</th>
                {c.sedes.map((s) => <th key={s.businessId} className="text-right font-medium pb-1.5 pl-2">{s.sede}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <Fila pregunta="¿Cuánto vendí este mes?" corta="Ventas" sedes={c.sedes}
                grupo={<>{monto(g.ventas.actual)} <span className="hidden sm:inline"><Cambio v={g.ventas} /></span></>} valor={(s) => monto(s.ventas.actual)} />
              <Fila pregunta="¿Cuánto me costó vender eso?" corta="Costos" sedes={c.sedes}
                grupo={<>{monto(g.costos.actual)} <span className="hidden sm:inline"><Cambio v={g.costos} inverso /></span></>} valor={(s) => monto(s.costos.actual)} />
              <Fila pregunta="¿Cuánto gasté en operar el negocio?" corta="Gastos" sedes={c.sedes}
                grupo={<>{monto(g.gastos.actual)} <span className="hidden sm:inline"><Cambio v={g.gastos} inverso /></span></>} valor={(s) => monto(s.gastos.actual)} />
              {conImpuestos && <Fila pregunta="Impuestos" corta="Impuestos" sedes={c.sedes} valor={(s) => (s.impuestos ? soles(s.impuestos) : <span className="text-gray-300">·</span>)} />}
              <Fila fuerte pregunta="¿Cuánto gané realmente?" corta="Ganancia" sedes={c.sedes}
                grupo={g.ganancia.actual !== null ? <><span className={g.ganancia.actual < 0 ? "text-red-700" : "text-emerald-700"}>{conSigno(g.ganancia.actual)}</span> <span className="hidden sm:inline"><Cambio v={g.ganancia} /></span></> : "—"}
                valor={(s) => s.ganancia.actual !== null
                  ? <span className={s.ganancia.actual < 0 ? "text-red-700" : "text-emerald-700"}>{conSigno(s.ganancia.actual)}{s.gananciaPct !== null && <span className="block text-[10px] sm:text-[11px] font-normal text-gray-500">{pct(s.gananciaPct)}<span className="hidden sm:inline"> de lo vendido</span></span>}</span>
                  : <span className="text-gray-400 font-normal">{s.sinResultadoPorque ?? "—"}</span>} />
              <Fila pregunta="¿Superé mi punto de equilibrio?" corta="Equilibrio" sedes={c.sedes}
                valor={(s) => s.equilibrio.pe === null || s.equilibrio.ventas === null ? "—" : (
                  <span className={s.equilibrio.superado ? "text-emerald-700" : "text-red-700"}>
                    {s.equilibrio.superado ? "Sí" : "No"}<span className="hidden sm:inline"> · </span><span className="block sm:inline">{conSigno(s.equilibrio.ventas - s.equilibrio.pe)}</span>
                    <span className="hidden sm:block text-[11px] text-gray-500">piso {soles(s.equilibrio.pe)}</span>
                  </span>
                )} />
              <Fila pregunta="¿Cuánto tengo libre en caja? (hoy)" corta="Libre hoy" sedes={c.sedes}
                valor={(s) => (s.libreHoy !== null ? <span className={s.libreHoy < 0 ? "text-red-700" : "text-emerald-700"}>{conSigno(s.libreHoy)}</span> : "—")} />
            </tbody>
          </table>
        </div>
      </div>

      <Bloque titulo={`Comparación vs. ${ant}`}>
        {c.sedes.map((s) => (
          <PorSedeTexto key={s.businessId} sede={s.sede}>
            Ventas {s.ventas.pct !== null ? `${s.ventas.pct > 0 ? "+" : ""}${pct(s.ventas.pct)}` : "—"}, margen {s.margenPct.diferencia !== null ? `${s.margenPct.diferencia > 0 ? "+" : ""}${s.margenPct.diferencia.toLocaleString("es-PE", { maximumFractionDigits: 1 })} pts` : "—"}, ganancia <Cambio v={s.ganancia} />
            {s.cambios.length > 0 && <span className="block text-xs text-gray-500 mt-0.5">Lo que más se movió: {s.cambios.map((x) => `${cat(x.categoria)} ${x.diferencia > 0 ? "+" : "−"}${soles(x.diferencia)}`).join(", ")}</span>}
          </PorSedeTexto>
        ))}
      </Bloque>

      <Bloque titulo="Flujo de caja del mes">
        {c.sedes.map((s) => {
          const f = s.fuera;
          const razones = [
            f.deudas && `cuotas ${soles(f.deudas)}`, f.ahorro && `ahorro ${soles(f.ahorro)}`, f.reparto && `socios ${soles(f.reparto)}`,
            f.inversion && `inversión ${soles(f.inversion)}`, f.otrasSedes && `parte de otras sedes ${soles(f.otrasSedes)}`,
          ].filter(Boolean);
          return (
            <PorSedeTexto key={s.businessId} sede={s.sede}>
              <b className={s.caja.flujo < 0 ? "text-red-700" : "text-emerald-700"}>{conSigno(s.caja.flujo)}</b> (entró {soles(s.caja.entro)}, salió {soles(s.caja.salio)})
              {s.ganancia.actual !== null && razones.length > 0 && <span className="block text-xs text-gray-500 mt-0.5">No es la ganancia ({conSigno(s.ganancia.actual)}) por: {razones.join(", ")}</span>}
            </PorSedeTexto>
          );
        })}
      </Bloque>

      <Bloque titulo={`Proyección de ${sig}`}>
        {c.sedes.map((s) => (
          <PorSedeTexto key={s.businessId} sede={s.sede}>
            Meta mínima (equilibrio) {s.siguiente.peReferencia !== null ? soles(s.siguiente.peReferencia) : "—"}
            {s.siguiente.ventaEsperada ? <> · venta esperada {soles(s.siguiente.ventaEsperada)}</> : null}
            {" · "}{s.siguiente.aprobado ? <span className="text-emerald-700">presupuesto aprobado</span> : <span className="text-amber-700">presupuesto sin aprobar</span>}
            {s.siguiente.compromisosFijos > 0 && <span className="block text-xs text-gray-500 mt-0.5">Pagos fijos {soles(s.siguiente.compromisosFijos)}: {s.siguiente.detalle.slice(0, 3).map((x) => `${x.concepto} ${soles(x.monto)}`).join(", ")}</span>}
          </PorSedeTexto>
        ))}
      </Bloque>
    </div>
  );
}

// ── Checklist mensual ─────────────────────────────────────────────────────

export function Checklist({ c, onCambio }: { c: DatosCierre; onCambio: () => void }) {
  const { showToast } = useToast();
  const marcados = new Map(c.marcados.map((x) => [x.item, x]));
  async function toggle(item: string, marcado: boolean) {
    const r = await marcarCheck({ mes: c.mes, item, marcado });
    if (!r.ok) { showToast(r.error, "error"); return; }
    onCambio();
  }
  const grupo = (g: "cierre" | "analisis", titulo: string) => (
    <div className="space-y-2">
      <h4 className="font-semibold text-gray-900">{titulo}</h4>
      {CHECKLIST.filter((i) => i.grupo === g).map((i) => {
        const m = marcados.get(i.id);
        const datos = i.datos ? i.datos(c.estado) : null;
        return (
          <label key={i.id} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" checked={!!m} onChange={(e) => toggle(i.id, e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
            <span className="min-w-0">
              <span className={`text-sm ${m ? "text-gray-500 line-through" : "text-gray-900"}`}>{i.texto}</span>
              <span className="block text-[11px] text-gray-500">
                {datos && <><span className={datos.listo ? "text-emerald-700" : "text-amber-700"}>{datos.listo ? "✓ " : "Falta: "}{datos.detalle}</span> · </>}{i.donde}
                {m ? ` · marcado el ${fechaCorta(m.el)}` : ""}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
  return <div className="grid gap-5 md:grid-cols-2">{grupo("cierre", "Cierre mensual")}{grupo("analisis", "Análisis estratégico")}</div>;
}

// ── La pestaña ────────────────────────────────────────────────────────────

export function ControlMensualClient() {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const [mes, setMes] = useState(mesMas(hoy.slice(0, 7), -1));
  const [semana, setSemana] = useState<Awaited<ReturnType<typeof getRevisionSemanal>> | null>(null);
  const [cierre, setCierre] = useState<Awaited<ReturnType<typeof getCierreMes>> | null>(null);
  const cargarSemana = useCallback(async () => setSemana(await getRevisionSemanal()), []);
  const cargarCierre = useCallback(async () => setCierre(await getCierreMes(mes)), [mes]);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    cargarSemana();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargarSemana]);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al cambiar de mes */
    cargarCierre();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargarCierre]);

  const s = semana?.ok ? semana.data : null;
  const c = cierre?.ok ? cierre.data : null;
  const pendientes = s ? pendientesSemana(s) : [];
  const avance = c ? avanceChecklist(new Set(c.marcados.map((x) => x.item))) : null;

  return (
    <div className="space-y-5 max-w-6xl">
      <header>
        <h1 className="text-xl font-semibold text-gray-900">Control mensual</h1>
        <p className="text-sm text-gray-500 mt-1">La rutina para no perder el rumbo: 20–30 minutos cada lunes y 1–2 horas al cerrar el mes.</p>
      </header>

      {!semana ? <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Armando la revisión de la semana…</p>
        : !semana.ok ? <p className="text-sm text-red-700">{semana.error}</p>
        : (
          <SeccionDesplegable
            titulo={`Revisión semanal · ${fechaCorta(s!.semana.desde)} al ${fechaCorta(s!.semana.hasta)}`}
            subtitulo="Pagos que vienen, cobros, ritmo de ventas y gastos fuera del plan."
            resumen={
              <div className="flex flex-wrap gap-1.5">
                {s!.revisada ? <Pastilla tono="verde"><CheckCircle2 className="w-3 h-3" /> Revisada</Pastilla> : <Pastilla tono="ambar">Pendiente de revisar</Pastilla>}
                {s!.semanaAnteriorSinRevisar && <Pastilla tono="rojo">La semana anterior quedó sin revisar</Pastilla>}
                {pendientes.length === 0 ? <Pastilla tono="verde">Todo en verde</Pastilla>
                  : pendientes.map((x) => <Pastilla key={x.texto} tono={x.s === "rojo" ? "rojo" : "ambar"}>{x.texto}</Pastilla>)}
              </div>
            }
          >
            <div className="space-y-4">
              <VistaSemana d={s!} onCambio={cargarSemana} />
              <MarcarSemana d={s!} onCambio={cargarSemana} />
            </div>
          </SeccionDesplegable>
        )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Cierre de mes</h2>
        <select aria-label="Mes que se cierra" value={mes} onChange={(e) => { setCierre(null); setMes(e.target.value); }} className="rounded-lg border border-gray-300 px-2 py-1 text-sm capitalize">
          {[1, 2, 3, 4, 5, 6].map((k) => mesMas(hoy.slice(0, 7), -k)).map((m) => <option key={m} value={m} className="capitalize">{nombreMes(m)} {m.slice(0, 4)}</option>)}
        </select>
      </div>

      {!cierre ? <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Armando el cierre…</p>
        : !cierre.ok ? <p className="text-sm text-red-700">{cierre.error}</p>
        : (
          <>
            <SeccionDesplegable
              titulo={`Cierre de ${nombreMes(c!.mes)}`}
              subtitulo="Resultado, comparación, flujo de caja y lo que viene."
              resumen={
                <div className="flex flex-wrap gap-1.5">
                  {c!.grupo.ganancia.actual !== null && <Pastilla tono={c!.grupo.ganancia.actual < 0 ? "rojo" : "verde"}>Ganancia {conSigno(c!.grupo.ganancia.actual)}</Pastilla>}
                  <Pastilla tono={c!.grupo.flujo.actual !== null && c!.grupo.flujo.actual < 0 ? "rojo" : "verde"}>Flujo {c!.grupo.flujo.actual !== null ? conSigno(c!.grupo.flujo.actual) : "—"}</Pastilla>
                  {c!.sedes.filter((x) => x.equilibrio.superado === false).map((x) => <Pastilla key={x.businessId} tono="rojo">{x.sede} bajo el equilibrio</Pastilla>)}
                </div>
              }
            >
              <VistaCierre c={c!} />
            </SeccionDesplegable>

            <SeccionDesplegable
              titulo={`Checklist de control · ${nombreMes(c!.mes)}`}
              subtitulo="El sistema dice si los datos están listos; marcar es tuyo."
              resumen={avance ? <Pastilla tono={avance.hechos === avance.total ? "verde" : "ambar"}>{avance.hechos} de {avance.total} hechos</Pastilla> : undefined}
            >
              <Checklist c={c!} onCambio={cargarCierre} />
            </SeccionDesplegable>
          </>
        )}
    </div>
  );
}
