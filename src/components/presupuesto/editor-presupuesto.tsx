"use client";

/**
 * Armar, guardar y aprobar el presupuesto de una sede para un mes. Fijos en soles, variables en %
 * de la venta esperada (decisión de Jahnn, 6-oct-2026). Al lado de cada categoría: lo sugerido
 * (promedio de los 3 últimos meses cerrados) y lo que salió el último mes cerrado, para decidir
 * con números y no de memoria.
 *
 * «Lo maneja el admin» (6-oct-2026): de cada categoría, la parte que pasa por las manos del
 * administrador de la sede. Al aprobar, se manda a Control de Caja como el tope de su barra.
 * Lo que se propone es lo que de verdad pasó por Control de Caja en los meses cerrados.
 */

import { useMemo, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { aprobarPresupuesto, guardarPresupuesto, reenviarAControlCaja, type DatosPresupuesto, type SedePresupuesto } from "@/app/actions/presupuesto";
import { AREAS, descripcionDe, modoPorDefecto, montoDe, sugerir, type Linea, type Modo } from "@/lib/presupuesto";
import { Segmentado } from "@/components/productos/ui";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const mesCorto = (m: string) => MESES[Number(m.slice(5, 7)) - 1];
const soles = (n: number) => `S/${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const pct = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;
const mesAnterior = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
const bonito = (c: string) => c.charAt(0) + c.slice(1).toLowerCase();
const num = (t: string) => { const v = Number(t.replace(/,/g, "").trim()); return t.trim() === "" || !Number.isFinite(v) ? null : v; };

type Campos = { modo: Modo; valor: string; caja: string };
type Borrador = { venta: string; lineas: Record<string, Campos> };

const AREAS_PLAN = AREAS.filter((a) => a.bloque !== "fuera");

function desdeLineas(venta: number | null, lineas: Linea[], cajaPrevia?: Borrador): Borrador {
  const b: Borrador = { venta: venta ? String(venta) : "", lineas: {} };
  for (const a of AREAS_PLAN) for (const c of a.categorias) b.lineas[c] = { modo: modoPorDefecto(c), valor: "", caja: cajaPrevia?.lineas[c]?.caja ?? "" };
  for (const l of lineas) b.lineas[l.categoria] = { modo: l.modo, valor: String(l.valor), caja: l.topeCaja ? String(l.topeCaja) : cajaPrevia?.lineas[l.categoria]?.caja ?? "" };
  return b;
}

/** Lo que pasó por Control de Caja por categoría: promedio de los meses cerrados con datos y el mes elegido. */
function cajaDe(s: SedePresupuesto, mes: string) {
  const out = new Map<string, { promedio: number | null; esteMes: number }>();
  if (!s.caja) return out;
  const cerrados = s.caja.meses.filter((m) => m < mes);
  // Solo cuentan los meses en que la sede ya usaba Control de Caja (algún gasto registrado).
  const conDatos = cerrados.filter((m) => Object.values(s.caja!.porCategoria).some((x) => (x[m] ?? 0) > 0));
  for (const [c, x] of Object.entries(s.caja.porCategoria)) {
    const promedio = conDatos.length ? Math.round(conDatos.reduce((t, m) => t + (x[m] ?? 0), 0) / conDatos.length / 10) * 10 : null;
    out.set(c, { promedio: promedio && promedio > 0 ? promedio : null, esteMes: x[mes] ?? 0 });
  }
  return out;
}

function EditorSede({ s, mes, onGuardado }: { s: SedePresupuesto; mes: string; onGuardado: () => void }) {
  const { showToast } = useToast();
  const inicial = useMemo(() => desdeLineas(s.cabecera?.ventaEsperada ?? null, s.lineas), [s]);
  const [b, setB] = useState<Borrador>(inicial);
  const [busy, setBusy] = useState<"guardar" | "aprobar" | null>(null);
  const sug = useMemo(() => sugerir(s.historial), [s]);
  const sugDe = new Map(sug.lineas.map((l) => [l.categoria, l]));
  const ultimo = [...s.historial].reverse().find((h) => Object.keys(h.real).length > 0) ?? null;
  const sucio = JSON.stringify(b) !== JSON.stringify(inicial);
  const caja = useMemo(() => cajaDe(s, mes), [s, mes]);
  // Revelación progresiva: se ven las categorías con presupuesto, sugerencia o gasto; las vacías, a un toque.
  const [todas, setTodas] = useState(false);
  const conAlgo = (c: string) => (num(b.lineas[c]?.valor ?? "") ?? 0) > 0 || (num(b.lineas[c]?.caja ?? "") ?? 0) > 0
    || sugDe.has(c) || (ultimo?.real[c] ?? 0) > 0 || !!caja.get(c)?.promedio;
  const vacias = AREAS_PLAN.flatMap((a) => a.categorias).filter((c) => !conAlgo(c)).length;
  const hayCaja = [...caja.values()].some((x) => x.promedio);

  const venta = num(b.venta);
  const lineas: Linea[] = Object.entries(b.lineas)
    .map(([categoria, x]) => ({ categoria, modo: x.modo, valor: num(x.valor) ?? 0, topeCaja: num(x.caja) }))
    .filter((l) => l.valor > 0);
  const totalCaja = lineas.reduce((t, l) => t + (l.topeCaja ?? 0), 0);
  const totalDe = (bloque: string) => lineas.filter((l) => AREAS.find((a) => a.categorias.includes(l.categoria))?.bloque === bloque)
    .reduce((t, l) => t + (montoDe(l, venta) ?? 0), 0);
  const operacion = totalDe("operacion");
  const resto = totalDe("deudas") + totalDe("inversion") + totalDe("ahorro");

  const set = (c: string, x: Partial<Campos>) => setB((v) => ({ ...v, lineas: { ...v.lineas, [c]: { ...v.lineas[c], ...x } } }));
  // Llenar con lo sugerido o copiar el mes anterior no borra la parte del admin ya escrita.
  const usarSugerido = () => setB(desdeLineas(sug.ventaEsperada ?? venta, sug.lineas, b));
  const copiarAnterior = () => setB(desdeLineas(s.mesAnterior.ventaEsperada ?? venta, s.mesAnterior.lineas, b));
  /** La parte del admin = lo que pasó por Control de Caja en promedio (sin pasar el presupuesto de la categoría). */
  const llenarCaja = () => setB((v) => {
    const lineasN = { ...v.lineas };
    for (const [c, x] of caja) {
      if (!x.promedio || !lineasN[c]) continue;
      const tope = montoDe({ categoria: c, modo: lineasN[c].modo, valor: num(lineasN[c].valor) ?? 0 }, num(v.venta));
      lineasN[c] = { ...lineasN[c], caja: String(tope !== null && tope > 0 ? Math.min(x.promedio, Math.round(tope)) : x.promedio) };
    }
    return { ...v, lineas: lineasN };
  });
  const [reenviando, setReenviando] = useState(false);
  async function reenviar() {
    setReenviando(true);
    const r = await reenviarAControlCaja({ businessId: s.businessId, mes });
    setReenviando(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(`Topes de ${s.sede} enviados a Control de Caja (${r.categorias} categorías).`, "success");
    onGuardado();
  }

  async function guardar(): Promise<boolean> {
    setBusy("guardar");
    const r = await guardarPresupuesto({ businessId: s.businessId, mes, ventaEsperada: venta, lineas });
    setBusy(null);
    if (!r.ok) { showToast(r.error, "error"); return false; }
    showToast(`Presupuesto de ${s.sede} guardado.`, "success");
    return true;
  }
  async function aprobar(aprobar: boolean) {
    if (aprobar && sucio && !(await guardar())) return;
    setBusy("aprobar");
    const r = await aprobarPresupuesto({ businessId: s.businessId, mes, aprobar });
    setBusy(null);
    if (!r.ok) { showToast(r.error, "error"); return; }
    if (!aprobar) showToast(`Presupuesto de ${s.sede} reabierto.`, "success");
    else if (r.caja?.enviado) showToast(`Presupuesto de ${s.sede} aprobado. Los administradores ya ven sus topes en Control de Caja (${r.caja.categorias} categorías).`, "success");
    else showToast(`Presupuesto de ${s.sede} aprobado, pero no llegó a Control de Caja: ${r.caja?.error ?? "error desconocido"}`, "error");
    onGuardado();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-gray-600">
          <span className="block mb-1 font-medium">Venta esperada del mes (S/)</span>
          <input inputMode="decimal" value={b.venta} onChange={(e) => setB({ ...b, venta: e.target.value })}
            className="w-36 rounded-lg border border-gray-300 px-3 py-1.5 text-sm tabular-nums focus:outline-2 focus:outline-primary" />
          {sug.ventaEsperada && <span className="block mt-1 text-[11px] text-gray-500">Promedio de los últimos meses: {soles(sug.ventaEsperada)}</span>}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {sug.lineas.length > 0 && <button type="button" onClick={usarSugerido} className="rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-inset ring-gray-300 hover:bg-gray-50">Llenar con lo sugerido</button>}
          {s.mesAnterior.lineas.length > 0 && <button type="button" onClick={copiarAnterior} className="rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-inset ring-gray-300 hover:bg-gray-50">Copiar el de {mesCorto(mesAnterior(mes))}</button>}
          {hayCaja && <button type="button" onClick={llenarCaja} className="rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-inset ring-sky-300 text-sky-800 hover:bg-sky-50">Llenar la parte del admin con Control de Caja</button>}
        </div>
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-gray-500">
              <th className="text-left font-medium py-2">Categoría</th>
              <th className="text-left font-medium py-2 px-2">En</th>
              <th className="text-right font-medium py-2 px-2">Presupuesto</th>
              <th className="text-right font-medium py-2 px-2" title="La parte que maneja el administrador: su tope en Control de Caja">Lo maneja el admin</th>
              <th className="text-right font-medium py-2 px-2">Sugerido</th>
              <th className="text-right font-medium py-2 pl-2">{ultimo ? `Salió en ${mesCorto(ultimo.mes)}` : "Último mes"}</th>
            </tr>
          </thead>
          <tbody>
            {AREAS_PLAN.map((a) => {
              const cats = todas ? a.categorias : a.categorias.filter(conAlgo);
              return cats.length ? <FilasArea key={a.id} nombre={a.nombre} categorias={cats} b={b} set={set} venta={venta} sugDe={sugDe} ultimo={ultimo} caja={caja} /> : null;
            })}
          </tbody>
        </table>
      </div>
      {vacias > 0 && (
        <button type="button" onClick={() => setTodas(!todas)} className="text-xs font-medium text-gray-500 hover:text-gray-800">
          {todas ? "Ocultar las categorías vacías" : `Mostrar ${vacias} ${vacias === 1 ? "categoría" : "categorías"} sin presupuesto ni historial`}
        </button>
      )}

      <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-800 leading-relaxed">
        {venta ? (
          <>Con este plan, de <b>{soles(venta)}</b> que esperas vender: la operación se lleva <b>{soles(operacion)}</b> ({pct((operacion / venta) * 100)})
            {resto > 0 && <> y deudas, inversión y ahorro <b>{soles(resto)}</b></>}.{" "}
            {venta - operacion - resto >= 0
              ? <>Quedan <b className="text-emerald-700">{soles(venta - operacion - resto)}</b> sin destino.</>
              : <>Falta <b className="text-red-700">{soles(venta - operacion - resto)}</b>: el plan gasta más de lo que esperas vender.</>}
          </>
        ) : <>Escribe la venta esperada para ver cuánto queda después del plan.</>}
        {totalCaja > 0 && <> De todo eso, <b>{soles(totalCaja)}</b> pasan por las manos del administrador (sus topes en Control de Caja).</>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={async () => { if (await guardar()) onGuardado(); }} disabled={busy !== null || !sucio}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-800 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-40">
          {busy === "guardar" && <Loader2 className="w-4 h-4 animate-spin" />} Guardar borrador
        </button>
        {s.cabecera?.aprobadoEl && !sucio ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4" /> Aprobado{s.cabecera.aprobadoPor ? ` por ${s.cabecera.aprobadoPor === "jahnn" ? "Jahnn" : "Kelly"}` : ""}</span>
            <button type="button" onClick={() => aprobar(false)} disabled={busy !== null} className="text-xs text-gray-500 underline underline-offset-2">Reabrir</button>
          </>
        ) : (
          <button type="button" onClick={() => aprobar(true)} disabled={busy !== null || !lineas.length}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
            {busy === "aprobar" && <Loader2 className="w-4 h-4 animate-spin" />} {sucio ? "Guardar y aprobar" : "Aprobar"}
          </button>
        )}
        {sucio && <span className="text-xs text-amber-700">Hay cambios sin guardar.</span>}
      </div>
      <EstadoCaja s={s} reenviando={reenviando} onReenviar={reenviar} />
    </div>
  );
}

/** Si los topes de este presupuesto ya están en Control de Caja (o por qué no). */
function EstadoCaja({ s, reenviando, onReenviar }: { s: SedePresupuesto; reenviando: boolean; onReenviar: () => void }) {
  const c = s.cabecera;
  if (!c?.aprobadoEl) return <p className="text-xs text-gray-500">Los topes llegan a Control de Caja cuando apruebas el presupuesto.</p>;
  const desactualizado = c.cajaEnviadoEl && c.actualizadoEl > c.cajaEnviadoEl;
  // Postgres entrega «2026-10-06 16:57:42.48+00»: se pasa a ISO («…T…+00:00») para que el navegador lo entienda.
  const fecha = (iso: string) => new Date(iso.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")).toLocaleString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const boton = (
    <button type="button" onClick={onReenviar} disabled={reenviando} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 disabled:opacity-50">
      {reenviando && <Loader2 className="w-3 h-3 animate-spin" />} Volver a enviar
    </button>
  );
  if (c.cajaError) {
    return <p className="text-xs text-red-700">No llegó a Control de Caja: {c.cajaError}. {boton}</p>;
  }
  if (!c.cajaEnviadoEl) return <p className="text-xs text-amber-700">Aprobado, pero los topes todavía no están en Control de Caja. {boton}</p>;
  if (desactualizado) return <p className="text-xs text-amber-700">Cambiaste el presupuesto después de enviarlo: Control de Caja todavía tiene los topes del {fecha(c.cajaEnviadoEl)}. {boton}</p>;
  return <p className="text-xs text-emerald-700">Topes en Control de Caja desde el {fecha(c.cajaEnviadoEl)}: cada administrador ya ve sus barras.</p>;
}

function FilasArea({ nombre, categorias, b, set, venta, sugDe, ultimo, caja }: {
  nombre: string; categorias: string[]; b: Borrador; set: (c: string, x: Partial<Campos>) => void;
  venta: number | null; sugDe: Map<string, Linea>; ultimo: { ventas: number | null; real: Record<string, number> } | null;
  caja: Map<string, { promedio: number | null; esteMes: number }>;
}) {
  return (
    <>
      <tr><td colSpan={6} className="pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{nombre}</td></tr>
      {categorias.map((c) => {
        const x = b.lineas[c];
        const v = num(x.valor);
        const enSoles = x.modo === "pct" && v !== null ? montoDe({ categoria: c, modo: "pct", valor: v }, venta) : null;
        const sg = sugDe.get(c);
        const salio = ultimo?.real[c] ?? 0;
        return (
          <tr key={c} className="border-t border-gray-100">
            <td className="py-1.5 pr-2">
              <div className="text-gray-900">{bonito(c)}</div>
              <div className="text-[11px] text-gray-500 leading-tight">{descripcionDe(c)}</div>
            </td>
            <td className="py-1.5 px-2">
              <div className="inline-flex rounded-md bg-gray-100 p-0.5 text-[11px]">
                {(["soles", "pct"] as Modo[]).map((m) => (
                  <button key={m} type="button" onClick={() => set(c, { modo: m })} aria-pressed={x.modo === m}
                    className={`px-2 py-0.5 rounded ${x.modo === m ? "bg-white shadow-sm font-semibold text-gray-900" : "text-gray-500"}`}>{m === "soles" ? "S/" : "%"}</button>
                ))}
              </div>
            </td>
            <td className="py-1.5 px-2 text-right">
              <input inputMode="decimal" value={x.valor} onChange={(e) => set(c, { valor: e.target.value })} placeholder="0"
                aria-label={`Presupuesto de ${bonito(c)}`}
                className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm text-right tabular-nums focus:outline-2 focus:outline-primary" />
              {enSoles !== null && <div className="text-[11px] text-gray-500 tabular-nums">= {soles(enSoles)}</div>}
            </td>
            <td className="py-1.5 px-2 text-right">
              <input inputMode="decimal" value={x.caja} onChange={(e) => set(c, { caja: e.target.value })} placeholder="—"
                aria-label={`Parte de ${bonito(c)} que maneja el administrador`}
                className={`w-20 rounded-md border px-2 py-1 text-sm text-right tabular-nums focus:outline-2 focus:outline-primary ${
                  num(x.caja) !== null && (enSoles ?? (x.modo === "soles" ? v : null)) !== null && num(x.caja)! > (enSoles ?? v ?? 0) + 0.005 ? "border-red-400" : "border-sky-200"}`} />
              {caja.get(c)?.promedio ? (
                <button type="button" onClick={() => set(c, { caja: String(caja.get(c)!.promedio) })} title="Usar lo que pasó por Control de Caja en promedio"
                  className="block ml-auto text-[11px] text-sky-700 underline decoration-dotted underline-offset-2 tabular-nums">Caja: {soles(caja.get(c)!.promedio!)}/mes</button>
              ) : null}
            </td>
            <td className="py-1.5 px-2 text-right tabular-nums text-xs text-gray-600">
              {sg ? (
                <button type="button" onClick={() => set(c, { modo: sg.modo, valor: String(sg.valor) })} className="hover:text-primary underline decoration-dotted underline-offset-2" title="Usar este valor">
                  {sg.modo === "pct" ? pct(sg.valor) : soles(sg.valor)}
                </button>
              ) : "—"}
            </td>
            <td className="py-1.5 pl-2 text-right tabular-nums text-xs text-gray-600">
              {salio > 0 ? <>{soles(salio)}{x.modo === "pct" && ultimo?.ventas ? <span className="text-gray-400"> · {pct((salio / ultimo.ventas) * 100)}</span> : null}</> : "—"}
            </td>
          </tr>
        );
      })}
    </>
  );
}

export function EditorPresupuesto({ datos, onGuardado }: { datos: DatosPresupuesto; onGuardado: () => void }) {
  const [bId, setBId] = useState(datos.sedes[0]?.businessId ?? 2);
  const s = datos.sedes.find((x) => x.businessId === bId) ?? datos.sedes[0];
  if (!s) return null;
  return (
    <div className="space-y-4">
      {datos.sedes.length > 1 && (
        <Segmentado tamano="sm" opciones={datos.sedes.map((x) => ({ valor: x.businessId, etiqueta: x.sede }))} valor={bId} onChange={setBId} />
      )}
      <EditorSede key={`${s.businessId}-${datos.mes}-${s.cabecera?.actualizadoEl ?? ""}-${s.cabecera?.aprobadoEl ?? ""}`} s={s} mes={datos.mes} onGuardado={onGuardado} />
    </div>
  );
}
