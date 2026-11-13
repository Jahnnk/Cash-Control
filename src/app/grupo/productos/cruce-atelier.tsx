"use client";

/**
 * Cruce Atelier → cafeterías → mermas (pedido de Jahnn, 13-nov-2026): por cada producto que Atelier vende a las
 * cafeterías, cuánto salió, cuánto vendieron Fonavi y Centro, cuánto registraron como merma y cuánto queda sin explicar.
 * Solo lee (lib/productos/cruce-atelier.ts). Empieza cerrada y carga al abrirse.
 */

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { getCruceAtelier, type CruceAtelier as Datos } from "@/app/actions/productos-panorama";
import { MINIMO_VENTA_DIRECTA_PCT, TOLERANCIA_PCT, TOLERANCIA_UNIDADES, type EstadoCruce, type FilaCruce, type MotivoSinCruce } from "@/lib/productos/cruce-atelier";
import { SeccionDesplegable } from "@/components/productos/ui";
import { mesLargo } from "@/lib/productos/texto-tramo";

const u = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 1 });
const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dia = (f: string) => `${Number(f.slice(8, 10))}/${Number(f.slice(5, 7))}`;
const ETIQUETA: Record<EstadoCruce, string> = { falta: "Falta explicar", sobra: "Vendió más de lo que salió", cuadra: "Cuadra" };
const TONO: Record<EstadoCruce, string> = { falta: "bg-red-50 text-red-700", sobra: "bg-amber-50 text-amber-800", cuadra: "bg-emerald-50 text-emerald-700" };
const SEDE: Record<number, string> = { 2: "Fonavi", 3: "Centro" };
const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** ¿El nombre tiene todas las palabras buscadas? (sin tildes ni mayúsculas) */
const coincide = (nombre: string, texto: string) => { const n = sinTildes(nombre); return sinTildes(texto).split(/\s+/).filter(Boolean).every((w) => n.includes(w)); };
const MOTIVO: Record<MotivoSinCruce, string> = { entero: "entero", "sin-pareja": "sin pareja", "poca-venta": "poca venta directa" };

function Fila({ f }: { f: FilaCruce }) {
  const celda = "px-2 py-2 text-right tabular-nums text-gray-700";
  const comoMerma = f.mermasComo.length ? `Anotadas como: ${f.mermasComo.join(", ")}` : undefined;
  return (
    <tr>
      <td className="py-2 pr-3 text-gray-800">{f.nombre}{f.porEntero && <span className="block text-[11px] text-gray-500">en porciones · {f.porEntero} por entero</span>}</td>
      <td className="px-2 py-2 text-right tabular-nums font-medium text-gray-900">{u(f.salio)}</td>
      <td className={`${celda} border-l border-gray-100`}>{u(f.vendido.fonavi)}</td>
      <td className={celda}>{u(f.vendido.centro)}</td>
      <td className={`${celda} border-l border-gray-100`} title={comoMerma}>{u(f.mermas.fonavi)}</td>
      <td className={celda} title={comoMerma}>{u(f.mermas.centro)}</td>
      <td className={`border-l border-gray-100 px-2 py-2 text-right font-semibold tabular-nums ${f.estado === "falta" ? "text-red-600" : f.estado === "sobra" ? "text-amber-700" : "text-gray-500"}`}>{f.sinExplicar < 0 ? "−" : ""}{u(Math.abs(f.sinExplicar))}</td>
      <td className={celda}>{f.valor > 0 ? soles(f.valor) : "—"}</td>
      <td className="py-2 pl-2 text-right"><span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${TONO[f.estado]}`}>{ETIQUETA[f.estado]}</span></td>
    </tr>
  );
}

export function CruceAtelier({ month }: { month: string }) {
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verTodo, setVerTodo] = useState(false);
  const [buscar, setBuscar] = useState("");
  function cargar() {
    if (d) return;
    getCruceAtelier(month).then((r) => { if (r.ok) setD(r.data); else setError(r.error); }).catch(() => setError("No se pudo armar el cruce."));
  }
  const buscando = buscar.trim().length > 0;
  // Al buscar se mira TODO (también lo que cuadra); sin buscar, solo lo que no cuadra salvo que se pida ver todo.
  const filas = d ? (buscando ? d.filas.filter((f) => coincide(f.nombre, buscar)) : verTodo ? d.filas : d.filas.filter((f) => f.estado !== "cuadra")) : [];
  const fueraDelCruce = d && buscando ? d.sinCruce.filter((s) => coincide(s.nombre, buscar)) : [];
  const suma = (f: (x: FilaCruce) => number) => (d ? d.filas.reduce((t, x) => t + f(x), 0) : 0);
  const cuadran = d ? d.filas.filter((f) => f.estado === "cuadra").length : 0;
  const sinReporte = d?.cobertura.filter((c) => !c.desde) ?? [];
  const rangos = d?.cobertura.filter((c) => c.desde) ?? [];
  const rangoDistinto = rangos.length > 1 && rangos.some((c) => c.desde !== rangos[0].desde || c.hasta !== rangos[0].hasta);

  return (
    <SeccionDesplegable
      titulo="Cruce Atelier → cafeterías"
      subtitulo={`${mesLargo(month)} · lo que salió de Atelier contra lo que Fonavi y Centro vendieron y mermaron, producto por producto.`}
      resumen="Salió de Atelier − vendido en cafeterías − mermas = sin explicar."
      onAbrir={cargar}
    >
      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : !d ? <p className="inline-flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Cruzando los reportes…</p> : sinReporte.length > 0 ? (
        <p className="text-sm text-gray-500">Falta el reporte de productos de {sinReporte.map((c) => c.sede).join(" y ")} en {mesLargo(month)}. Sin él no se puede cruzar.</p>
      ) : d.filas.length === 0 ? <p className="text-sm text-gray-500">Atelier no tiene ventas a las cafeterías (líneas «Y-») que se puedan cruzar en {mesLargo(month)}.</p> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Salió de Atelier", `${u(d.totales.salio)} u`, ""],
              ["Vendido en cafeterías", `${u(d.totales.vendido)} u`, `Fonavi ${u(suma((x) => x.vendido.fonavi))} · Centro ${u(suma((x) => x.vendido.centro))}`],
              ["Mermas registradas", `${u(d.totales.mermas)} u`, `Fonavi ${u(suma((x) => x.mermas.fonavi))} · Centro ${u(suma((x) => x.mermas.centro))}`],
              ["Falta explicar", `${u(d.totales.falta)} u`, `${soles(d.totales.valorFalta)} a precio interno · ${d.totales.productosConFalta} productos`],
            ].map(([t, v, n], i) => (
              <div key={t} className="rounded-xl bg-gray-50 p-3">
                <div className="text-[11px] text-gray-500">{t}</div>
                <div className={`mt-0.5 text-lg font-semibold tabular-nums ${i === 3 && d.totales.falta > 0 ? "text-red-600" : "text-gray-900"}`}>{v}</div>
                {n && <div className="text-[11px] text-gray-500">{n}</div>}
              </div>
            ))}
          </div>

          {rangoDistinto && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Los reportes no cubren los mismos días: {rangos.map((c) => `${c.sede} ${dia(c.desde!)} al ${dia(c.hasta!)}`).join(" · ")}. La diferencia puede venir de ahí.</p>}

          <label className="relative block max-w-sm">
            <span className="sr-only">Buscar producto</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar producto (ej. brownie vegano)" className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-2.5 text-sm text-gray-800" />
          </label>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-500">
                  <th colSpan={2} />
                  <th colSpan={2} className="border-l border-gray-100 px-2 pt-2 text-center font-medium">Vendido</th>
                  <th colSpan={2} className="border-l border-gray-100 px-2 pt-2 text-center font-medium">Mermas</th>
                  <th colSpan={3} className="border-l border-gray-100" />
                </tr>
                <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="py-2 pr-3 font-medium">Producto</th>
                  <th className="px-2 py-2 text-right font-medium">Salió</th>
                  <th className="border-l border-gray-100 px-2 py-2 text-right font-medium">Fonavi</th>
                  <th className="px-2 py-2 text-right font-medium">Centro</th>
                  <th className="border-l border-gray-100 px-2 py-2 text-right font-medium">Fonavi</th>
                  <th className="px-2 py-2 text-right font-medium">Centro</th>
                  <th className="border-l border-gray-100 px-2 py-2 text-right font-medium">Sin explicar</th>
                  <th className="px-2 py-2 text-right font-medium">Vale</th>
                  <th className="py-2 pl-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">{filas.map((f) => <Fila key={f.clave} f={f} />)}</tbody>
            </table>
            {filas.length === 0 && !buscando && <p className="py-3 text-sm text-emerald-700">Todos los productos cruzados cuadran.</p>}
            {filas.length === 0 && buscando && fueraDelCruce.length === 0 && <p className="py-3 text-sm text-gray-500">Ningún producto del cruce se llama así en {mesLargo(month)}.</p>}
            {fueraDelCruce.length > 0 && <p className="py-2 text-xs text-gray-600">No se cruza todavía: {fueraDelCruce.map((s) => `${s.nombre} (${u(s.salio)} u · ${MOTIVO[s.motivo]})`).join(" · ")}.</p>}
          </div>
          {cuadran > 0 && !buscando && <button type="button" onClick={() => setVerTodo(!verTodo)} className="text-xs font-medium text-primary hover:underline">{verTodo ? "Ver solo los que no cuadran" : `Ver también los ${cuadran} que cuadran`}</button>}
          <p className="text-[11px] text-gray-400">Cuadra si la diferencia no pasa de {TOLERANCIA_UNIDADES} unidades ni del {TOLERANCIA_PCT}% de lo que salió. «Sin explicar» es de las dos cafeterías juntas: el reporte de Atelier no dice a cuál le vendió cada producto, así que no se puede saber de cuál es la diferencia. Los enteros se cuentan en porciones; su merma también, salvo que el administrador escriba «entero». «Falta explicar» puede ser merma sin registrar, cortesía, consumo del personal o producto que quedó en vitrina al cierre del mes.</p>

          {d.mermasSinEmparejar.length > 0 && (
            <details className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
              <summary className="cursor-pointer font-medium text-gray-800">{d.mermasSinEmparejar.length} mermas de las cafeterías no se cargaron a ningún producto del cruce</summary>
              <p className="mt-1 text-[11px] text-gray-500">El nombre que escribió el administrador no coincide con un solo producto, o es de un producto que no se cruza.</p>
              <ul className="mt-1 grid grid-cols-1 gap-x-4 sm:grid-cols-2">{d.mermasSinEmparejar.map((m, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{SEDE[m.sedeId]} · {m.producto}</span><span className="tabular-nums">{u(m.cantidad)}</span></li>)}</ul>
            </details>
          )}
          {d.sinCruce.length > 0 && (
            <details className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
              <summary className="cursor-pointer font-medium text-gray-800">{d.sinCruce.length} productos de Atelier no se cruzan todavía</summary>
              <p className="mt-1 text-[11px] text-gray-500">«Entero»: sale entero y se vende en porciones; falta saber cuántas porciones da cada uno. «Sin pareja»: la cafetería no lo vende con ese nombre (insumo de cocina o nombre distinto). «Poca venta directa»: la cafetería vendió y mermó menos del {MINIMO_VENTA_DIRECTA_PCT}% de lo que salió; casi todo se usa en cocina o se vende con otro nombre.</p>
              <ul className="mt-1 grid grid-cols-1 gap-x-4 sm:grid-cols-2">{d.sinCruce.map((s) => <li key={s.nombre} className="flex justify-between gap-2"><span className="truncate">{s.nombre}</span><span className="shrink-0 tabular-nums">{u(s.salio)} u · {MOTIVO[s.motivo]}</span></li>)}</ul>
            </details>
          )}
        </div>
      )}
    </SeccionDesplegable>
  );
}
