"use client";

/**
 * Armar, guardar y aprobar el presupuesto de una sede para un mes. Fijos en soles, variables en %
 * de la venta esperada (decisión de Jahnn, 6-oct-2026). Al lado de cada categoría: lo sugerido
 * (promedio de los 3 últimos meses cerrados) y lo que salió el último mes cerrado, para decidir
 * con números y no de memoria.
 */

import { useMemo, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { aprobarPresupuesto, guardarPresupuesto, type DatosPresupuesto, type SedePresupuesto } from "@/app/actions/presupuesto";
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

type Borrador = { venta: string; lineas: Record<string, { modo: Modo; valor: string }> };

const AREAS_PLAN = AREAS.filter((a) => a.bloque !== "fuera");

function desdeLineas(venta: number | null, lineas: Linea[]): Borrador {
  const b: Borrador = { venta: venta ? String(venta) : "", lineas: {} };
  for (const a of AREAS_PLAN) for (const c of a.categorias) b.lineas[c] = { modo: modoPorDefecto(c), valor: "" };
  for (const l of lineas) b.lineas[l.categoria] = { modo: l.modo, valor: String(l.valor) };
  return b;
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

  const venta = num(b.venta);
  const lineas: Linea[] = Object.entries(b.lineas)
    .map(([categoria, x]) => ({ categoria, modo: x.modo, valor: num(x.valor) ?? 0 }))
    .filter((l) => l.valor > 0);
  const totalDe = (bloque: string) => lineas.filter((l) => AREAS.find((a) => a.categorias.includes(l.categoria))?.bloque === bloque)
    .reduce((t, l) => t + (montoDe(l, venta) ?? 0), 0);
  const operacion = totalDe("operacion");
  const resto = totalDe("deudas") + totalDe("inversion") + totalDe("ahorro");

  const set = (c: string, x: Partial<{ modo: Modo; valor: string }>) => setB((v) => ({ ...v, lineas: { ...v.lineas, [c]: { ...v.lineas[c], ...x } } }));
  const usarSugerido = () => setB(desdeLineas(sug.ventaEsperada ?? venta, sug.lineas));
  const copiarAnterior = () => setB(desdeLineas(s.mesAnterior.ventaEsperada ?? venta, s.mesAnterior.lineas));

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
    showToast(aprobar ? `Presupuesto de ${s.sede} aprobado.` : `Presupuesto de ${s.sede} reabierto.`, "success");
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
        </div>
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-gray-500">
              <th className="text-left font-medium py-2">Categoría</th>
              <th className="text-left font-medium py-2 px-2">En</th>
              <th className="text-right font-medium py-2 px-2">Presupuesto</th>
              <th className="text-right font-medium py-2 px-2">Sugerido</th>
              <th className="text-right font-medium py-2 pl-2">{ultimo ? `Salió en ${mesCorto(ultimo.mes)}` : "Último mes"}</th>
            </tr>
          </thead>
          <tbody>
            {AREAS_PLAN.map((a) => (
              <FilasArea key={a.id} nombre={a.nombre} categorias={a.categorias} b={b} set={set} venta={venta} sugDe={sugDe} ultimo={ultimo} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-800 leading-relaxed">
        {venta ? (
          <>Con este plan, de <b>{soles(venta)}</b> que esperas vender: la operación se lleva <b>{soles(operacion)}</b> ({pct((operacion / venta) * 100)})
            {resto > 0 && <> y deudas, inversión y ahorro <b>{soles(resto)}</b></>}.{" "}
            {venta - operacion - resto >= 0
              ? <>Quedan <b className="text-emerald-700">{soles(venta - operacion - resto)}</b> sin destino.</>
              : <>Falta <b className="text-red-700">{soles(venta - operacion - resto)}</b>: el plan gasta más de lo que esperas vender.</>}
          </>
        ) : <>Escribe la venta esperada para ver cuánto queda después del plan.</>}
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
    </div>
  );
}

function FilasArea({ nombre, categorias, b, set, venta, sugDe, ultimo }: {
  nombre: string; categorias: string[]; b: Borrador; set: (c: string, x: Partial<{ modo: Modo; valor: string }>) => void;
  venta: number | null; sugDe: Map<string, Linea>; ultimo: { ventas: number | null; real: Record<string, number> } | null;
}) {
  return (
    <>
      <tr><td colSpan={5} className="pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{nombre}</td></tr>
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
