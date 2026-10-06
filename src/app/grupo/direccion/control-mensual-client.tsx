"use client";

/**
 * Sistema de Dirección · Control mensual (pedido de Jahnn, 6-oct-2026, capítulo «Tu sistema
 * mensual de control financiero»). Tres piezas, todas plegadas con su resumen a la vista:
 *   · Revisión semanal (los lunes): las 4 tarjetas del libro por sede y «Marcar revisada».
 *   · Cierre de mes: las 6 preguntas del dueño y los 5 pasos de la revisión mensual.
 *   · Checklist mensual: 12 puntos; el sistema dice si los datos están listos, el dueño marca.
 * Reglas: lib/control-mensual.ts y lib/compromisos.ts · datos: actions/control-mensual.ts.
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

function Tarjeta({ n, titulo, pregunta, children }: { n: number; titulo: string; pregunta: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200/80 bg-white p-4 space-y-3 min-w-0">
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-7 h-7 rounded-full bg-primary text-white text-sm font-semibold flex items-center justify-center">{n}</span>
        <div className="min-w-0">
          <h4 className="font-semibold text-gray-900 leading-tight">{titulo}</h4>
          <p className="text-xs text-gray-500 mt-0.5 leading-snug">{pregunta}</p>
        </div>
      </div>
      <div className="divide-y divide-gray-100">{children}</div>
    </div>
  );
}

function FilaSede({ s, sede, resumen, children }: { s: Semaforo; sede: string; resumen: ReactNode; children?: ReactNode }) {
  return (
    <details className="group py-2">
      <summary className="flex cursor-pointer list-none items-start gap-2 text-sm">
        <span className="mt-1.5"><Punto s={s} /></span>
        <span className="font-medium text-gray-900 w-16 shrink-0">{sede}</span>
        <span className={`min-w-0 flex-1 ${TEXTO[s]}`}>{resumen}</span>
        {children && <span className="text-[11px] text-primary group-open:hidden shrink-0">Ver</span>}
      </summary>
      {children && <div className="mt-2 pl-6 text-xs text-gray-700 space-y-1.5">{children}</div>}
    </details>
  );
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
        <Tarjeta n={1} titulo="Saldo bancario vs. compromisos" pregunta="Saldo de hoy menos los pagos de los próximos 7–14 días. ¿Hay suficiente liquidez?">
          {d.sedes.map((s) => s.liquidez ? (
            <FilaSede key={s.businessId} s={s.liquidez.semaforo} sede={s.sede}
              resumen={<>Banco {soles(s.liquidez.saldo)} · pagos en 14 días {soles(s.liquidez.compromisos14)} · {s.liquidez.libre14 >= 0 ? `quedan ${soles(s.liquidez.libre14)}` : `faltan ${soles(s.liquidez.libre14)}`}</>}>
              <p>Saldo del banco y caja al {fechaCorta(s.liquidez.saldoAl ?? d.hoy)} (Excel): <b>{soles(s.liquidez.saldo)}</b>. Pagos en 7 días: <b>{soles(s.liquidez.compromisos7)}</b>; en 14: <b>{soles(s.liquidez.compromisos14)}</b>.</p>
              <p className="text-gray-500">Mientras tanto suelen entrar unos {soles(s.liquidez.entradas)} por ventas (90% del promedio de las últimas 4 semanas).</p>
              <Compromisos s={s} onCambio={onCambio} />
            </FilaSede>
          ) : <FilaSede key={s.businessId} s="gris" sede={s.sede} resumen="Sin lectura del banco en el Excel." />)}
        </Tarjeta>

        <Tarjeta n={2} titulo="Cobros pendientes" pregunta="¿Hay facturas de clientes vencidas o por vencer? Si es así, gestiona el cobro esta semana.">
          {d.sedes.map((s) => !s.cobros ? (
            <FilaSede key={s.businessId} s="verde" sede={s.sede} resumen="No vende al crédito: cobra al momento." />
          ) : (
            <FilaSede key={s.businessId} s={s.cobros.semaforo} sede={s.sede}
              resumen={s.cobros.diasDesdeCarga === null || s.cobros.diasDesdeCarga > DIAS_CARGA_COBROS
                ? <>Sin dato confiable: el reporte de cobros de Byte se subió hace {s.cobros.diasDesdeCarga ?? "—"} días</>
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

        <Tarjeta n={3} titulo="Ventas de la semana" pregunta="¿Vas al ritmo para alcanzar la meta del mes? ¿O hay que ajustar algo en los días que quedan?">
          {d.sedes.map((s) => {
            const r = s.ritmo;
            return (
              <FilaSede key={s.businessId} s={r.semaforo} sede={s.sede}
                resumen={r.meta === null ? <>Semana {soles(r.ventasSemana)} · sin meta del mes</> : <>Semana {soles(r.ventasSemana)} · al cierre {r.proyeccion !== null ? soles(r.proyeccion) : "—"} de {soles(r.meta)}</>}>
                <p>Semana del {fechaCorta(d.semana.desde)} al {fechaCorta(d.semana.hasta)}: <b>{soles(r.ventasSemana)}</b>. En el mes van <b>{soles(r.ventasMes)}</b>{s.ventasHasta ? ` (hasta el ${fechaCorta(s.ventasHasta)})` : ""}.</p>
                {r.proyeccion !== null && <p>Al ritmo {r.proyeccionEs === "semana" ? "de la última semana" : "del mes"}, cerraría en <b>{soles(r.proyeccion)}</b>.</p>}
                {r.meta !== null && <p>Meta: <b>{soles(r.meta)}</b> ({r.metaEs === "presupuesto" ? "venta esperada del presupuesto" : "punto de equilibrio"}){r.pe !== null && r.metaEs === "presupuesto" ? ` · equilibrio ${soles(r.pe)}` : ""}.</p>}
                {r.porDia !== null && r.falta !== null && r.falta > 0 && <p>Faltan {soles(r.falta)} en {r.diasRestantes} días: <b>{soles(r.porDia)} por día</b>.</p>}
              </FilaSede>
            );
          })}
        </Tarjeta>

        <Tarjeta n={4} titulo="Gastos no previstos" pregunta="¿Surgió algún gasto que no estaba en el plan? ¿Cómo afecta al flujo proyectado?">
          {d.sedes.map((s) => {
            const n = s.noPrevistos;
            const nada = !n.desvios.length && !n.sobreTope.length;
            return (
              <FilaSede key={s.businessId} s={n.semaforo} sede={s.sede}
                resumen={n.semaforo === "gris" ? "Sin presupuesto aprobado del mes" : nada ? "Todo dentro del plan" : <>{soles(n.total)} fuera del plan este mes{n.sobreTope.length ? ` · ${n.sobreTope.length} sobre el tope en Control de Caja` : ""}</>}>
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
    <span className={`text-[11px] ${bueno ? "text-emerald-700" : "text-red-700"}`}>
      {v.diferencia > 0 ? "▲" : "▼"} {esPct ? `${Math.abs(v.diferencia).toLocaleString("es-PE", { maximumFractionDigits: 1 })} pts` : soles(v.diferencia)}
    </span>
  );
}

function Pregunta({ titulo, explica, children }: { titulo: string; explica: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200/80 bg-white p-4 min-w-0">
      <h4 className="font-semibold text-gray-900 leading-tight">{titulo}</h4>
      <p className="text-[11px] text-gray-500 mt-0.5">{explica}</p>
      <div className="mt-2 space-y-1 text-sm">{children}</div>
    </div>
  );
}

function PorSede({ sedes, valor }: { sedes: SedeCierre[]; valor: (s: SedeCierre) => ReactNode }) {
  return <>{sedes.map((s) => <div key={s.businessId} className="flex items-baseline justify-between gap-2"><span className="text-gray-600">{s.sede}</span><span className="tabular-nums text-right">{valor(s)}</span></div>)}</>;
}

export function VistaCierre({ c }: { c: DatosCierre }) {
  const m = nombreMes(c.mes), sig = nombreMes(c.siguiente);
  const g = c.grupo;
  return (
    <div className="space-y-5">
      {g.provisional && <p className="text-xs text-amber-800">Algún Excel no llega a fin de {m}: los resultados son provisionales.</p>}
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Las preguntas que todo dueño debe poder responder · {m}</h4>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Pregunta titulo="¿Cuánto vendí este mes?" explica="Facturación total, al contado y al crédito.">
            <p className="text-lg font-semibold tabular-nums">{g.ventas.actual !== null ? soles(g.ventas.actual) : "—"} <Cambio v={g.ventas} /></p>
            <PorSede sedes={c.sedes} valor={(s) => (s.ventas.actual !== null ? soles(s.ventas.actual) : "—")} />
          </Pregunta>
          <Pregunta titulo="¿Cuánto me costó vender eso?" explica="Costos directos: insumos, productos de Atelier, packaging, delivery.">
            <p className="text-lg font-semibold tabular-nums">{g.costos.actual !== null ? soles(g.costos.actual) : "—"} <Cambio v={g.costos} inverso /></p>
            <PorSede sedes={c.sedes} valor={(s) => (s.costos.actual !== null ? soles(s.costos.actual) : "—")} />
          </Pregunta>
          <Pregunta titulo="¿Cuánto gasté en operar el negocio?" explica="Costos fijos y gastos operativos, sin los costos de venta.">
            <p className="text-lg font-semibold tabular-nums">{g.gastos.actual !== null ? soles(g.gastos.actual) : "—"} <Cambio v={g.gastos} inverso /></p>
            <PorSede sedes={c.sedes} valor={(s) => (s.gastos.actual !== null ? soles(s.gastos.actual) : "—")} />
          </Pregunta>
          <Pregunta titulo="¿Cuánto gané realmente?" explica="Ventas − costos − gastos − impuestos.">
            <p className={`text-lg font-semibold tabular-nums ${(g.ganancia.actual ?? 0) < 0 ? "text-red-700" : "text-emerald-700"}`}>{g.ganancia.actual !== null ? conSigno(g.ganancia.actual) : "—"} <Cambio v={g.ganancia} /></p>
            <PorSede sedes={c.sedes} valor={(s) => (s.ganancia.actual !== null ? <span className={s.ganancia.actual < 0 ? "text-red-700" : ""}>{conSigno(s.ganancia.actual)}{s.gananciaPct !== null ? ` · ${pct(s.gananciaPct)}` : ""}</span> : <span className="text-gray-400">{s.sinResultadoPorque ?? "—"}</span>)} />
          </Pregunta>
          <Pregunta titulo="¿Cuánto tengo libre en caja?" explica="Saldo − pagos del mes − reserva mínima (hoy, de la Matriz de decisión).">
            <PorSede sedes={c.sedes} valor={(s) => (s.libreHoy !== null ? <span className={s.libreHoy < 0 ? "text-red-700" : "text-emerald-700"}>{conSigno(s.libreHoy)}</span> : "—")} />
          </Pregunta>
          <Pregunta titulo="¿Superé mi punto de equilibrio?" explica="Ventas del mes contra el mínimo para cubrir los costos.">
            <PorSede sedes={c.sedes} valor={(s) => (s.equilibrio.superado === null ? "—" : <span className={s.equilibrio.superado ? "text-emerald-700" : "text-red-700"}>{s.equilibrio.superado ? "Sí" : "No"} · piso {soles(s.equilibrio.pe!)}</span>)} />
          </Pregunta>
        </div>
      </div>

      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Qué revisar al cierre de {m}</h4>
        <ol className="space-y-3">
          <Paso n={1} titulo="Estado de resultados simplificado" sub="Ventas − costos − gastos = ganancia real del mes">
            <PorSede sedes={c.sedes} valor={(s) => s.ganancia.actual === null ? <span className="text-gray-400">{s.sinResultadoPorque ?? "Sin resultado"}</span>
              : <>{soles(s.ventas.actual ?? 0)} − {soles(s.costos.actual ?? 0)} − {soles(s.gastos.actual ?? 0)}{s.impuestos ? ` − ${soles(s.impuestos)} imp.` : ""} = <b className={s.ganancia.actual < 0 ? "text-red-700" : ""}>{conSigno(s.ganancia.actual)}</b></>} />
          </Paso>
          <Paso n={2} titulo={`Comparación vs. ${nombreMes(mesMas(c.mes, -1))}`} sub="¿Subieron o bajaron ventas, costos y margen? ¿Por qué?">
            {c.sedes.map((s) => (
              <div key={s.businessId} className="text-sm">
                <span className="font-medium">{s.sede}:</span> ventas {s.ventas.pct !== null ? `${s.ventas.pct > 0 ? "+" : ""}${pct(s.ventas.pct)}` : "—"}, margen {s.margenPct.diferencia !== null ? `${s.margenPct.diferencia > 0 ? "+" : ""}${s.margenPct.diferencia.toLocaleString("es-PE", { maximumFractionDigits: 1 })} pts` : "—"}, ganancia <Cambio v={s.ganancia} />.
                {s.cambios.length > 0 && <span className="text-gray-500"> Lo que más se movió: {s.cambios.map((x) => `${x.categoria.charAt(0) + x.categoria.slice(1).toLowerCase()} ${x.diferencia > 0 ? "+" : "−"}${soles(x.diferencia)}`).join(", ")}.</span>}
              </div>
            ))}
          </Paso>
          <Paso n={3} titulo="Flujo de caja del mes" sub="¿Fue positivo o negativo? ¿Por qué difiere de la ganancia?">
            {c.sedes.map((s) => {
              const f = s.fuera;
              const razones = [
                f.deudas && `cuotas ${soles(f.deudas)}`, f.ahorro && `ahorro ${soles(f.ahorro)}`, f.reparto && `socios ${soles(f.reparto)}`,
                f.inversion && `inversión ${soles(f.inversion)}`, f.otrasSedes && `parte de otras sedes ${soles(f.otrasSedes)}`,
              ].filter(Boolean);
              return (
                <div key={s.businessId} className="text-sm">
                  <span className="font-medium">{s.sede}:</span> entró {soles(s.caja.entro)}, salió {soles(s.caja.salio)} → <b className={s.caja.flujo < 0 ? "text-red-700" : "text-emerald-700"}>{conSigno(s.caja.flujo)}</b>
                  {s.ganancia.actual !== null && <span className="text-gray-500"> (ganancia {conSigno(s.ganancia.actual)}){razones.length ? `. La diferencia: ${razones.join(", ")}` : ""}.</span>}
                </div>
              );
            })}
          </Paso>
          <Paso n={4} titulo="Revisión de punto de equilibrio" sub="¿Cuánto vendiste vs. cuánto necesitabas vender para cubrir costos?">
            <PorSede sedes={c.sedes} valor={(s) => s.equilibrio.pe === null || s.equilibrio.ventas === null ? "—"
              : <>{soles(s.equilibrio.ventas)} vs. piso {soles(s.equilibrio.pe)} → <b className={s.equilibrio.superado ? "text-emerald-700" : "text-red-700"}>{conSigno(s.equilibrio.ventas - s.equilibrio.pe)}</b></>} />
          </Paso>
          <Paso n={5} titulo={`Proyección de ${sig}`} sub="¿Hay compromisos grandes? ¿Cuál es la meta de ventas mínima?">
            {c.sedes.map((s) => (
              <div key={s.businessId} className="text-sm">
                <span className="font-medium">{s.sede}:</span> meta mínima (equilibrio) {s.siguiente.peReferencia !== null ? soles(s.siguiente.peReferencia) : "—"}
                {s.siguiente.ventaEsperada ? <> · venta esperada {soles(s.siguiente.ventaEsperada)}</> : null}
                {" · "}{s.siguiente.aprobado ? <span className="text-emerald-700">presupuesto aprobado</span> : <span className="text-amber-700">presupuesto sin aprobar</span>}
                {s.siguiente.compromisosFijos > 0 && <span className="text-gray-500"> · pagos fijos {soles(s.siguiente.compromisosFijos)} ({s.siguiente.detalle.slice(0, 3).map((x) => `${x.concepto} ${soles(x.monto)}`).join(", ")})</span>}
              </div>
            ))}
          </Paso>
        </ol>
      </div>
    </div>
  );
}

function Paso({ n, titulo, sub, children }: { n: number; titulo: string; sub: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-8 h-8 rounded-md bg-primary-50 text-primary font-semibold flex items-center justify-center">{n}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <div><span className="font-semibold text-gray-900">{titulo}</span> <span className="text-xs text-gray-500">· {sub}</span></div>
        {children}
      </div>
    </li>
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
                {datos ? <span className={datos.listo ? "text-emerald-700" : "text-amber-700"}>{datos.listo ? "✓ " : "Falta: "}{datos.detalle}</span> : "Lo decides tú"} · {i.donde}
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
  const conteo = (x: Semaforo) => (s ? s.sedes.reduce((t, sd) => t + [sd.liquidez?.semaforo ?? "gris", sd.cobros?.semaforo ?? "verde", sd.ritmo.semaforo, sd.noPrevistos.semaforo].filter((y) => y === x).length, 0) : 0);
  const avance = c ? avanceChecklist(new Set(c.marcados.map((x) => x.item))) : null;

  return (
    <div className="space-y-5 max-w-6xl">
      <header>
        <h1 className="text-xl font-semibold text-gray-900">Control mensual</h1>
        <p className="text-sm text-gray-600 mt-1 max-w-3xl leading-relaxed">
          La rutina para no perder el rumbo: 20–30 minutos cada lunes y 1–2 horas al cerrar el mes. Si puedes responder estas preguntas con claridad, tu sistema de control está funcionando.
        </p>
      </header>

      {!semana ? <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Armando la revisión de la semana…</p>
        : !semana.ok ? <p className="text-sm text-red-700">{semana.error}</p>
        : (
          <SeccionDesplegable
            titulo={`Revisión semanal · ${fechaCorta(s!.semana.desde)} al ${fechaCorta(s!.semana.hasta)}`}
            subtitulo="Los lunes: saldo vs. pagos que vienen, cobros, ventas contra la meta y gastos fuera del plan."
            resumen={
              <div className="flex flex-wrap gap-1.5">
                {s!.revisada ? <Pastilla tono="verde"><CheckCircle2 className="w-3 h-3" /> Revisada</Pastilla> : <Pastilla tono="ambar">Pendiente de revisar</Pastilla>}
                {s!.semanaAnteriorSinRevisar && <Pastilla tono="rojo">La semana anterior quedó sin revisar</Pastilla>}
                <Pastilla tono="verde">{conteo("verde")} en verde</Pastilla>
                {conteo("ambar") > 0 && <Pastilla tono="ambar">{conteo("ambar")} con precaución</Pastilla>}
                {conteo("rojo") > 0 && <Pastilla tono="rojo">{conteo("rojo")} en alto</Pastilla>}
                {conteo("gris") > 0 && <Pastilla>{conteo("gris")} sin datos</Pastilla>}
              </div>
            }
          >
            <div className="space-y-4">
              <VistaSemana d={s!} onCambio={cargarSemana} />
              <MarcarSemana d={s!} onCambio={cargarSemana} />
            </div>
          </SeccionDesplegable>
        )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-600">Mes que se cierra:</span>
        <select value={mes} onChange={(e) => { setCierre(null); setMes(e.target.value); }} className="rounded-lg border border-gray-300 px-2 py-1 text-sm capitalize">
          {[1, 2, 3, 4, 5, 6].map((k) => mesMas(hoy.slice(0, 7), -k)).map((m) => <option key={m} value={m} className="capitalize">{nombreMes(m)} {m.slice(0, 4)}</option>)}
        </select>
      </div>

      {!cierre ? <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Armando el cierre…</p>
        : !cierre.ok ? <p className="text-sm text-red-700">{cierre.error}</p>
        : (
          <>
            <SeccionDesplegable
              titulo={`Cierre de ${nombreMes(c!.mes)}`}
              subtitulo="Las 6 preguntas del dueño y los 5 pasos de la revisión mensual, con tus números."
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
              subtitulo="Márcala cada mes hasta que el proceso se vuelva un hábito. El sistema te dice si los datos están listos; marcar es tuyo."
              resumen={avance ? <Pastilla tono={avance.hechos === avance.total ? "verde" : "ambar"}>{avance.hechos} de {avance.total} hechos</Pastilla> : undefined}
            >
              <Checklist c={c!} onCambio={cargarCierre} />
            </SeccionDesplegable>
          </>
        )}
    </div>
  );
}
