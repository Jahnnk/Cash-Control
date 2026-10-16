"use client";

/**
 * Estado de resultados de 6 meses (Fase 2 de «lo real en Reportes», 16-oct-2026). Primera sección de Reportes,
 * plegada: el resumen usa las cifras del mes que ya trae la página; los 6 meses se cargan al abrirla.
 * Cada mes lleva su sello (✓ Conciliado / En curso / A mano) y cada categoría abre sus movimientos.
 * La cuenta: lib/estado-resultados.ts (sobre las seis cifras, una sola fuente).
 */

import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight, X } from "lucide-react";
import { SeccionDesplegable } from "@/components/productos/ui";
import { estadoDeResultados, type Vista, type ColumnaMes, type LineaCategoria, type EstadoMes } from "@/lib/estado-resultados";
import { getEstadoResultados, getMovimientosCategoria, type DatosEstadoResultados, type MovimientoCategoria } from "@/app/actions/estado-resultados";
import type { SeisCifras } from "@/app/actions/seis-cifras";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const corto = (m: string) => `${MESES[+m.slice(5, 7) - 1]} ${m.slice(2, 4)}`;
const soles = (n: number | null) => (n === null ? "—" : `${n < 0 ? "−" : ""}S/ ${Math.round(Math.abs(n)).toLocaleString("es-PE")}`);
const pct = (n: number | null) => (n === null ? "" : `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`);
const VISTAS: { v: Vista; nombre: string }[] = [{ v: "grupo", nombre: "Grupo" }, { v: 2, nombre: "Fonavi" }, { v: 3, nombre: "Centro" }, { v: 1, nombre: "Atelier" }];

const SELLO: Record<EstadoMes, { texto: string; cls: string; ayuda: string }> = {
  "conciliado": { texto: "✓ Conciliado", cls: "text-emerald-700", ayuda: "Mes cerrado que cuadra con el Excel al céntimo" },
  "en-curso": { texto: "En curso", cls: "text-amber-700", ayuda: "El mes no terminó: falta la planilla y otros pagos de fin de mes" },
  "a-mano": { texto: "A mano", cls: "text-gray-500", ayuda: "Mes registrado a mano en el sistema, sin Excel con qué cuadrar" },
  "sin-resultado": { texto: "—", cls: "text-gray-400", ayuda: "Sin datos suficientes" },
};

type Detalle = { categoria: string; mes: string };

function Celda({ v, p, fuerte, onClick }: { v: number | null; p?: number | null; fuerte?: boolean; onClick?: () => void }) {
  const cls = `tabular-nums ${v !== null && v < 0 ? "text-red-700" : fuerte ? "text-gray-900" : "text-gray-700"} ${fuerte ? "font-semibold" : ""}`;
  const contenido = <>{soles(v)}{p !== undefined && p !== null && <span className="block text-[10px] font-normal text-gray-500">{pct(p)}</span>}</>;
  return (
    <td className="py-1.5 px-2 text-right whitespace-nowrap align-top">
      {onClick && v !== null ? <button type="button" onClick={onClick} className={`${cls} hover:underline decoration-dotted underline-offset-2`}>{contenido}</button> : <span className={cls}>{contenido}</span>}
    </td>
  );
}

function Fila({ etiqueta, ayuda, cols, valor, porc, fuerte, fondo, abrir, abierto }: {
  etiqueta: string; ayuda?: string; cols: ColumnaMes[]; valor: (c: ColumnaMes) => number | null; porc?: (c: ColumnaMes) => number | null;
  fuerte?: boolean; fondo?: string; abrir?: () => void; abierto?: boolean;
}) {
  return (
    <tr className={`border-t border-gray-100 ${fondo ?? ""}`}>
      <th scope="row" className={`sticky left-0 z-10 py-1.5 pl-3 pr-2 text-left font-normal ${fondo ?? "bg-white"}`}>
        {abrir ? (
          <button type="button" onClick={abrir} aria-expanded={abierto} className={`inline-flex items-center gap-1 text-left ${fuerte ? "font-semibold text-gray-900" : "text-gray-800"}`}>
            <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${abierto ? "rotate-90" : ""}`} />{etiqueta}
          </button>
        ) : <span className={fuerte ? "font-semibold text-gray-900" : "text-gray-800"}>{etiqueta}</span>}
        {ayuda && <span className="block text-[10px] text-gray-400 leading-tight">{ayuda}</span>}
      </th>
      {cols.map((c) => <Celda key={c.mes} v={valor(c)} p={porc ? porc(c) : undefined} fuerte={fuerte} />)}
    </tr>
  );
}

function Categorias({ lineas, meses, onVer }: { lineas: LineaCategoria[]; meses: ColumnaMes[]; onVer: (d: Detalle) => void }) {
  return (
    <>
      {lineas.map((l) => (
        <tr key={l.categoria} className="border-t border-gray-50 bg-gray-50/50">
          <th scope="row" className="sticky left-0 z-10 bg-gray-50 py-1 pl-8 pr-2 text-left text-[11px] font-normal text-gray-600">{l.categoria}</th>
          {l.montos.map((m, i) => (
            <td key={meses[i].mes} className="py-1 px-2 text-right text-[11px] whitespace-nowrap">
              {m === null ? <span className="text-gray-300">—</span>
                : <button type="button" onClick={() => onVer({ categoria: l.categoria, mes: meses[i].mes })} className={`tabular-nums hover:underline decoration-dotted underline-offset-2 ${m < 0 ? "text-red-700" : "text-gray-600"}`}>{soles(m)}</button>}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function Separador({ texto, n }: { texto: string; n: number }) {
  return <tr><th colSpan={n + 1} scope="colgroup" className="pt-4 pb-1 pl-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">{texto}</th></tr>;
}

function Movimientos({ vista, d, onCerrar }: { vista: Vista; d: Detalle; onCerrar: () => void }) {
  const [items, setItems] = useState<MovimientoCategoria[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    getMovimientosCategoria(vista === "grupo" ? null : vista, d.mes, d.categoria).then((r) => { if (vivo) { if (r.ok) setItems(r.items); else setError(r.error); } });
    return () => { vivo = false; };
  }, [vista, d.mes, d.categoria]);
  const total = items?.reduce((t, x) => t + x.monto, 0) ?? 0;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`${d.categoria} · ${corto(d.mes)}`} onClick={onCerrar}>
      <div className="w-full sm:max-w-xl max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-4 sm:p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">{d.categoria}</h4>
            <p className="text-xs text-gray-500">{corto(d.mes)}{vista === "grupo" ? " · las tres sedes" : ""}{items ? ` · ${items.length} movimientos · ${soles(total)}` : ""}</p>
          </div>
          <button type="button" onClick={onCerrar} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        {!items && !error && <p className="mt-3 text-sm text-gray-500">Cargando…</p>}
        {items && (
          <ul className="mt-3 divide-y divide-gray-100">
            {items.map((x, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-1.5 text-xs">
                <span className="min-w-0 text-gray-700">
                  <span className="text-gray-400 tabular-nums">{x.fecha.slice(8, 10)}/{x.fecha.slice(5, 7)}{vista === "grupo" ? ` · ${x.sede}` : ""} · </span>{x.concepto}
                  {x.nota && <span className="block text-[10px] text-gray-400">{x.nota}</span>}
                </span>
                <span className={`shrink-0 tabular-nums ${x.monto < 0 ? "text-emerald-700" : "text-gray-900"}`}>{soles(x.monto)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function TablaEstadoResultados({ datos, vista }: { datos: DatosEstadoResultados; vista: Vista }) {
  const e = estadoDeResultados(vista, datos.meses, datos.hoy);
  const [abiertos, setAbiertos] = useState<{ costos: boolean; gastos: boolean }>({ costos: false, gastos: false });
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const c = e.meses;
  const n = c.length;
  return (
    <>
      <div className="-mx-4 sm:mx-0 overflow-x-auto sm:rounded-xl sm:border sm:border-gray-200/80">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="border-b border-gray-200">
              <th scope="col" className="sticky left-0 z-10 bg-white py-2 pl-3 pr-2 text-left text-[11px] font-medium text-gray-500">S/ por mes</th>
              {c.map((m) => (
                <th key={m.mes} scope="col" className="py-2 px-2 text-right align-bottom">
                  <span className="block text-[11px] font-semibold text-gray-800 capitalize">{corto(m.mes)}</span>
                  <span className={`block text-[10px] font-medium ${SELLO[m.estado].cls}`} title={m.porque ?? SELLO[m.estado].ayuda}>{SELLO[m.estado].texto}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Fila etiqueta="Ventas" ayuda="lo vendido según Byte" cols={c} valor={(x) => x.ventas} fuerte />
            <Fila etiqueta="Ingresado por ventas" ayuda="lo que llegó al banco (grupo «Ventas»)" cols={c} valor={(x) => x.ingresadoVentas} />
            <Fila etiqueta="Costos variables" cols={c} valor={(x) => (x.costos === null ? null : -x.costos)} abrir={() => setAbiertos((a) => ({ ...a, costos: !a.costos }))} abierto={abiertos.costos} />
            {abiertos.costos && <Categorias lineas={e.costos} meses={c} onVer={setDetalle} />}
            <Fila etiqueta="Margen bruto" cols={c} valor={(x) => x.margenBruto} porc={(x) => x.margenBrutoPct} fuerte />
            <Fila etiqueta="Gastos fijos" cols={c} valor={(x) => (x.gastos === null ? null : -x.gastos)} abrir={() => setAbiertos((a) => ({ ...a, gastos: !a.gastos }))} abierto={abiertos.gastos} />
            {abiertos.gastos && <Categorias lineas={e.gastos} meses={c} onVer={setDetalle} />}
            <Fila etiqueta="EBITDA" ayuda="antes de impuestos" cols={c} valor={(x) => x.ebitda} porc={(x) => x.ebitdaPct} fuerte fondo="bg-emerald-50/60" />
            <Fila etiqueta="Impuestos" cols={c} valor={(x) => (x.impuestos === null ? null : -x.impuestos)} />
            <Fila etiqueta="Ganancia real" cols={c} valor={(x) => x.ganancia} porc={(x) => x.gananciaPct} fuerte fondo="bg-gray-50" />
            <Separador texto="Salió, pero no es gasto" n={n} />
            <Fila etiqueta="Cuotas de préstamos y tarjetas" cols={c} valor={(x) => x.fuera.deudas} />
            <Fila etiqueta="Equipos y remodelación" cols={c} valor={(x) => x.fuera.inversion} />
            <Fila etiqueta="Ahorro (fondos mutuos)" cols={c} valor={(x) => x.fuera.ahorro} />
            <Fila etiqueta="Utilidades a socios" cols={c} valor={(x) => x.fuera.reparto} />
            <Fila etiqueta="Otros que no son gasto" ayuda="pagos por error, préstamos entre sedes, propinas" cols={c} valor={(x) => x.fuera.otros} />
            <Separador texto="Caja (lo que entró y salió de la cuenta)" n={n} />
            <Fila etiqueta="Entró" cols={c} valor={(x) => x.caja.entro} />
            <Fila etiqueta="Salió" cols={c} valor={(x) => x.caja.salio} />
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-gray-500 leading-relaxed">
        Toca «Costos variables» o «Gastos fijos» para ver sus categorías, y una cifra de categoría para ver sus movimientos.
        {vista === "grupo" && " En el grupo, lo que Atelier le vende a las cafeterías se cuenta una sola vez."}
      </p>
      {detalle && <Movimientos vista={vista} d={detalle} onCerrar={() => setDetalle(null)} />}
    </>
  );
}

export function EstadoResultados({ cifras, mes, periodo }: { cifras: SeisCifras | null; mes: string; periodo: string }) {
  const [vista, setVista] = useState<Vista>("grupo");
  const [datos, setDatos] = useState<DatosEstadoResultados | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const cargar = () => {
    if (datos || cargando) return;
    setCargando(true);
    getEstadoResultados(mes).then((r) => { if (r.ok) setDatos(r.data); else setError(r.error); }).finally(() => setCargando(false));
  };
  // El resumen sale de las cifras del mes que ya trae la página: no hace falta cargar los 6 meses.
  let resumen: ReactNode = <p className="text-xs text-gray-500">Sin cifras para {periodo}.</p>;
  if (cifras) {
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    const g = estadoDeResultados("grupo", [{ mes, sedes: cifras.sedes }], hoy).meses[0];
    if (g.ebitda !== null) resumen = (
      <p className="text-xs text-gray-600">
        Grupo, {periodo}: EBITDA <b className={g.ebitda < 0 ? "text-red-700" : "text-gray-900"}>{soles(g.ebitda)}</b> ({pct(g.ebitdaPct)}) · ganancia real <b className={(g.ganancia ?? 0) < 0 ? "text-red-700" : "text-gray-900"}>{soles(g.ganancia)}</b>
        <span className={`ml-1.5 ${SELLO[g.estado].cls}`}>{SELLO[g.estado].texto}</span>
      </p>
    );
  }
  return (
    <SeccionDesplegable titulo="Estado de resultados · 6 meses" subtitulo="De las ventas al EBITDA y a la ganancia, por sede y del grupo, con los gastos por categoría." resumen={resumen} onAbrir={cargar}>
      <div className="space-y-3">
        <div role="tablist" aria-label="Sede" className="inline-flex rounded-lg bg-gray-100 p-1">
          {VISTAS.map((x) => (
            <button key={String(x.v)} type="button" role="tab" aria-selected={vista === x.v} onClick={() => setVista(x.v)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${vista === x.v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>{x.nombre}</button>
          ))}
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {!datos && !error && <p className="text-sm text-gray-500">Calculando los 6 meses…</p>}
        {datos && <TablaEstadoResultados datos={datos} vista={vista} />}
      </div>
    </SeccionDesplegable>
  );
}
