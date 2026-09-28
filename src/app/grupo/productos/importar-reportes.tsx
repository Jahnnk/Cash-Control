"use client";

/**
 * Subir VARIOS reportes de Byte a la vez (pedido de Jahnn, 22-sep-2026: "tengo
 * 3 archivos: junio, julio y agosto… y si ahora descargo lo que va de
 * setiembre").
 *
 * Desde el 28-sep-2026 es la fuente de DIRECCIÓN: acepta los tres reportes
 * que Jahnn baja de Byte cada semana (del 01 del mes a ayer) y reconoce cada
 * uno por su título — "Ventas de <MES>", "Platos con mayor rotación" y
 * "Platos con menor rotación". Ver src/lib/productos/reportes-direccion.ts.
 *
 * Se elige la sede (el reporte de Byte no dice de qué local es; si el nombre
 * del archivo lo dice, se propone), se sueltan los archivos y, ANTES de
 * guardar, cada uno muestra qué cubre y qué va a pasar: nuevo, reemplaza tu
 * carga anterior, o cómo se compara con lo que subió la sede.
 */

import { useEffect, useRef, useState } from "react";
import { X, Upload, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet, Trash2 } from "lucide-react";
import { formatCurrency, monthLabel } from "@/lib/utils";
import { parseByteRotacion, type ByteRotacionItem } from "@/lib/byte-rotacion-parser";
import { parseVentasReport, type ParsedVentaDay } from "@/lib/incentives/byte-ventas-parser";
import { tipoDeReporte, mesDelTituloVentas, parseMenorRotacion, type ProductoMenorRotacion, type TipoReporteByte } from "@/lib/productos/reportes-direccion";
import { importProductSalesForSede } from "@/app/actions/product-sales-import";
import { compararVentasDireccion, importVentasDireccion, importMenorRotacion, type ComparacionVentas } from "@/app/actions/reportes-direccion";
import { queHaraLaCarga, sedeDelNombre, type PeriodoCargado } from "@/lib/productos/cobertura-rotacion";

const SEDES = [
  { id: 2, nombre: "Fonavi" },
  { id: 3, nombre: "Centro" },
  { id: 1, nombre: "Atelier" },
];

const NOMBRE_TIPO: Record<TipoReporteByte, string> = { ventas: "Ventas del mes", mayor: "Mayor rotación", menor: "Menor rotación" };

type Archivo = {
  clave: string;
  nombre: string;
  tipo?: TipoReporteByte;
  estado: "leyendo" | "listo" | "error" | "subiendo" | "subido" | "fallo";
  error?: string;
  month?: string;
  desde?: string;
  hasta?: string;
  total?: number;
  warnings?: string[];
  resultado?: string;
  // Mayor rotación
  items?: ByteRotacionItem[];
  totalByte?: number | null;
  formato?: "rotacion" | "rentabilidad";
  // Ventas del mes
  dias?: ParsedVentaDay[];
  comparacion?: { sede: number; data: ComparacionVentas } | { sede: number; error: string };
  // Menor rotación
  productos?: ProductoMenorRotacion[];
};

const fecha = (iso?: string | null) => (iso ? `${iso.slice(8)}/${iso.slice(5, 7)}` : "—");

function cruzaDeMes(desde?: string | null, hasta?: string | null) {
  return !!desde && !!hasta && desde.slice(0, 7) !== hasta.slice(0, 7);
}

export function ImportarReportesModal({ sedeInicial, periodos, onClose, onImportado }: {
  sedeInicial: number | null;
  periodos: PeriodoCargado[];
  onClose: () => void;
  onImportado: () => void;
}) {
  const [sede, setSede] = useState<number | null>(sedeInicial);
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Comparaciones ya pedidas (archivo|sede): no se piden dos veces mientras llegan.
  const pedidas = useRef(new Set<string>());

  function actualizar(clave: string, cambio: Partial<Archivo>) {
    setArchivos((xs) => xs.map((a) => (a.clave === clave ? { ...a, ...cambio } : a)));
  }

  // Ventas del mes: al elegir la sede, se compara con lo que subió ella.
  useEffect(() => {
    if (sede === null) return;
    for (const a of archivos) {
      if (a.tipo !== "ventas" || a.estado !== "listo" || !a.dias || a.comparacion?.sede === sede) continue;
      const clave = a.clave;
      if (pedidas.current.has(`${clave}|${sede}`)) continue;
      pedidas.current.add(`${clave}|${sede}`);
      void compararVentasDireccion(sede, a.dias).then((r) => {
        actualizar(clave, { comparacion: r.ok ? { sede, data: r.data } : { sede, error: r.error } });
      });
    }
  }, [sede, archivos]);

  async function agregar(files: FileList | File[]) {
    const lista = [...files].filter((f) => /\.xlsx?$/i.test(f.name));
    if (lista.length === 0) return;
    // Si todavía no hay sede y el nombre del archivo la dice, se propone.
    if (sede === null) {
      const sugerida = lista.map((f) => sedeDelNombre(f.name)).find((x) => x !== null);
      if (sugerida) setSede(sugerida);
    }
    const nuevos: Archivo[] = lista.map((f) => ({ clave: `${f.name}-${f.size}-${f.lastModified}`, nombre: f.name, estado: "leyendo" }));
    setArchivos((xs) => [...xs.filter((x) => !nuevos.some((n) => n.clave === x.clave)), ...nuevos]);
    const XLSX = await import("xlsx");
    for (const [i, f] of lista.entries()) {
      const clave = nuevos[i].clave;
      try {
        const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array" });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null }) as unknown[][];
        const tipo = tipoDeReporte(rows);
        if (!tipo) {
          actualizar(clave, { estado: "error", error: "No reconozco este reporte. Sirven «Ventas de <MES>», «Platos con mayor rotación» y «Platos con menor rotación» de Byte." });
          continue;
        }
        if (tipo === "ventas") {
          const titulo = String(rows[0]?.[0] ?? "");
          const r = parseVentasReport(rows);
          if (r.errores.length > 0) { actualizar(clave, { tipo, estado: "error", error: r.errores.join(" ") }); continue; }
          const month = mesDelTituloVentas(titulo) ?? r.periodStart?.slice(0, 7);
          actualizar(clave, {
            tipo, estado: "listo", month, dias: r.days, desde: r.periodStart ?? undefined, hasta: r.periodEnd ?? undefined,
            total: Math.round(r.days.reduce((t, d) => t + d.total, 0) * 100) / 100, warnings: r.warnings,
          });
          continue;
        }
        if (tipo === "menor") {
          const r = parseMenorRotacion(rows);
          if (!r.ok) { actualizar(clave, { tipo, estado: "error", error: r.error }); continue; }
          actualizar(clave, { tipo, estado: "listo", month: r.hasta.slice(0, 7), desde: r.desde, hasta: r.hasta, productos: r.productos, warnings: r.avisos });
          continue;
        }
        const r = parseByteRotacion(rows);
        if (!r.ok) { actualizar(clave, { tipo, estado: "error", error: r.errors.join(" ") }); continue; }
        if (!r.month) { actualizar(clave, { tipo, estado: "error", error: "El título del reporte no trae el rango de fechas (del … al …)." }); continue; }
        if (cruzaDeMes(r.periodStart, r.periodEnd)) {
          actualizar(clave, { tipo, estado: "error", error: `Cruza de mes (${fecha(r.periodStart)} → ${fecha(r.periodEnd)}): exporta un archivo por mes.` });
          continue;
        }
        actualizar(clave, {
          tipo, estado: "listo", month: r.month,
          desde: r.periodStart ?? `${r.month}-01`, hasta: r.periodEnd ?? `${r.month}-28`,
          items: r.items, total: Math.round(r.items.reduce((t, it) => t + it.revenue, 0) * 100) / 100,
          totalByte: r.declaredTotal, formato: r.format, warnings: r.warnings,
        });
      } catch {
        actualizar(clave, { estado: "error", error: "No pude leer el Excel. ¿Es un reporte de Byte (.xlsx)?" });
      }
    }
  }

  // Dos archivos de rotación del mismo mes que se pisan: el segundo reemplazaría al primero.
  const listos = archivos.filter((a) => a.estado === "listo").sort((a, b) => (a.desde ?? "").localeCompare(b.desde ?? ""));
  const rotacion = listos.filter((a) => a.tipo === "mayor");
  const pisados = new Set<string>();
  for (let i = 0; i < rotacion.length; i++) for (let j = i + 1; j < rotacion.length; j++) {
    const a = rotacion[i], b = rotacion[j];
    if (a.month === b.month && a.desde! <= b.hasta! && b.desde! <= a.hasta!) { pisados.add(a.clave); pisados.add(b.clave); }
  }

  async function importar() {
    if (sede === null) return;
    setSubiendo(true);
    // En orden de fecha: así la grilla se va llenando de junio hacia adelante.
    for (const a of listos) {
      actualizar(a.clave, { estado: "subiendo" });
      if (a.tipo === "ventas") {
        const r = await importVentasDireccion(sede, { days: a.dias!, fileName: a.nombre });
        if (r.ok) actualizar(a.clave, { estado: "subido", resultado: `${r.guardados} días de venta${r.descartados ? ` (sin el de hoy)` : ""}` });
        else actualizar(a.clave, { estado: "fallo", error: r.error });
        continue;
      }
      if (a.tipo === "menor") {
        const r = await importMenorRotacion(sede, { desde: a.desde!, hasta: a.hasta!, productos: a.productos!, fileName: a.nombre });
        if (r.ok) actualizar(a.clave, { estado: "subido", resultado: `${r.guardados} productos de baja rotación` });
        else actualizar(a.clave, { estado: "fallo", error: r.error });
        continue;
      }
      const r = await importProductSalesForSede(sede, {
        month: a.month!, fileName: a.nombre, items: a.items!, declaredTotal: a.totalByte ?? null,
        parseWarnings: a.warnings ?? [], periodStart: a.desde, periodEnd: a.hasta,
      });
      if (r.ok) actualizar(a.clave, { estado: "subido", resultado: `${r.imported} productos · ${formatCurrency(r.totalRevenue)}` });
      else actualizar(a.clave, { estado: "fallo", error: r.error });
    }
    setSubiendo(false);
    onImportado();
  }

  const nombreSede = SEDES.find((s) => s.id === sede)?.nombre;
  const terminado = archivos.length > 0 && archivos.every((a) => a.estado === "subido" || a.estado === "fallo" || a.estado === "error");

  function Detalle({ a }: { a: Archivo }) {
    if (a.estado !== "listo") return null;
    if (a.tipo === "ventas") {
      const c = a.comparacion && a.comparacion.sede === sede ? a.comparacion : null;
      return (
        <div className="mt-1 space-y-0.5 text-xs">
          {sede === null && <div className="text-gray-500">Elige la sede para compararlo con lo que ella subió.</div>}
          {c && "error" in c && <div className="text-red-700">{c.error}</div>}
          {c && "data" in c && (
            <>
              {c.data.descartados.map((d) => (
                <div key={d.date} className="text-gray-600">El {fecha(d.date)} no se toma: el día no había cerrado ({formatCurrency(d.total)}).</div>
              ))}
              <div className="text-sky-800">
                Se guardan {c.data.dias} días ({fecha(c.data.desde)} → {fecha(c.data.hasta)}, {formatCurrency(c.data.total)}):{" "}
                {c.data.iguales} iguales a lo que subió la sede
                {c.data.nuevos > 0 ? ` · ${c.data.nuevos} que la sede no subió` : ""}
                {c.data.distintos.length > 0 ? ` · ${c.data.distintos.length} distintos` : ""}.
              </div>
              {c.data.distintos.length > 0 && (
                <div className="text-amber-800">
                  Distintos (manda el tuyo): {c.data.distintos.map((d) => `${fecha(d.date)} sede ${formatCurrency(d.sede)} · tuyo ${formatCurrency(d.tuyo)}`).join(" — ")}
                </div>
              )}
            </>
          )}
          {a.warnings?.map((w, i) => <div key={i} className="text-amber-800">{w}</div>)}
        </div>
      );
    }
    if (a.tipo === "menor") {
      const nunca = a.productos?.filter((p) => p.nuncaVendido).length ?? 0;
      const sinVenta = a.productos?.filter((p) => !p.nuncaVendido && p.vendido === 0).length ?? 0;
      return (
        <div className="mt-1 space-y-0.5 text-xs">
          <div className="text-sky-800">
            {a.productos?.length} productos: {nunca} nunca vendidos · {sinVenta} sin ventas en el rango · el resto con muy pocas. Reemplaza la lista anterior de la sede.
          </div>
          {(a.warnings?.length ?? 0) > 0 && <div className="text-amber-800">{a.warnings!.slice(0, 3).join(" ")}</div>}
        </div>
      );
    }
    const que = sede !== null && a.month
      ? queHaraLaCarga({ businessId: sede, month: a.month, desde: a.desde!, hasta: a.hasta!, total: a.total ?? 0 }, periodos)
      : null;
    const difByte = a.totalByte != null && a.total != null ? Math.round((a.total - a.totalByte) * 100) / 100 : null;
    return (
      <div className="mt-1 space-y-0.5 text-xs">
        {que && <div className={que.tipo === "nuevo" ? "text-gray-600" : "text-sky-800"}>{que.texto}</div>}
        {difByte !== null && Math.abs(difByte) >= 1 && (
          <div className="text-amber-800">La suma de productos no cuadra con el TOTAL de Byte ({formatCurrency(a.totalByte!)}): diferencia {formatCurrency(difByte)}.</div>
        )}
        {a.formato === "rentabilidad" && (
          <div className="text-amber-800">Es el reporte de Rentabilidad por Plato: cubre solo los productos con receta. Mejor usar «Platos con mayor rotación».</div>
        )}
        {pisados.has(a.clave) && (
          <div className="text-amber-800">Otro archivo de esta tanda cubre los mismos días: se quedará el último que se suba (van en orden de fecha).</div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !subiendo && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" /> Subir reportes de Byte
          </h2>
          <button onClick={onClose} disabled={subiendo} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-gray-700">1 · ¿De qué sede son los archivos?</div>
            <div className="flex gap-2">
              {SEDES.map((s) => (
                <button key={s.id} type="button" disabled={subiendo} onClick={() => setSede(s.id)}
                  className={`px-4 py-2 rounded-lg border text-sm ${s.id === sede ? "bg-primary text-white border-primary" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}>
                  {s.nombre}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500">El reporte de Byte no dice de qué local es: todos los archivos de esta tanda van a la sede elegida.</p>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-gray-700">2 · Suelta tus reportes de Byte</div>
            <div
              onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastrando(false); void agregar(e.dataTransfer.files); }}
              onClick={() => input.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer ${arrastrando ? "border-primary bg-primary/5" : "border-gray-300 hover:border-gray-400"}`}>
              <input ref={input} type="file" accept=".xlsx,.xls" multiple className="hidden"
                onChange={(e) => { if (e.target.files) void agregar(e.target.files); e.target.value = ""; }} />
              <Upload className="w-6 h-6 mx-auto text-gray-400 mb-1.5" />
              <div className="text-sm text-gray-600">Arrastra aquí los .xlsx o haz click para elegirlos</div>
              <div className="text-[11px] text-gray-500 mt-1">
                «Ventas de &lt;MES&gt;», «Platos con mayor rotación» y «Platos con menor rotación», del 01 del mes a ayer. Cada archivo se reconoce por su título.
              </div>
            </div>
          </div>

          {archivos.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-700">3 · Revisa qué va a pasar con cada uno</div>
              {archivos
                .slice()
                .sort((a, b) => (a.desde ?? "z").localeCompare(b.desde ?? "z"))
                .map((a) => (
                  <div key={a.clave} className={`rounded-xl border px-3 py-2.5 text-sm ${a.estado === "error" || a.estado === "fallo" ? "border-red-200 bg-red-50/50" : a.estado === "subido" ? "border-emerald-200 bg-emerald-50/50" : "border-gray-200"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">
                          {a.tipo && <span className="text-[10px] font-semibold uppercase tracking-wide text-primary mr-2">{NOMBRE_TIPO[a.tipo]}</span>}
                          {a.month ? `${monthLabel(a.month)} · ${fecha(a.desde)} → ${fecha(a.hasta)}` : a.nombre}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate">{a.nombre}</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {a.total != null && a.tipo !== "menor" && (
                          <div className="text-right">
                            <div className="font-semibold tabular-nums">{formatCurrency(a.total)}</div>
                            <div className="text-[10px] text-gray-500">
                              {a.tipo === "ventas" ? `${a.dias?.length} días en el archivo` : `${a.items?.length} productos`}
                              {a.tipo === "mayor" && a.totalByte != null && Math.abs(a.total - a.totalByte) < 1 ? " · cuadra con Byte ✓" : ""}
                            </div>
                          </div>
                        )}
                        {a.estado === "leyendo" || a.estado === "subiendo" ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                          : a.estado === "subido" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          : a.estado === "error" || a.estado === "fallo" ? <AlertTriangle className="w-4 h-4 text-red-600" />
                          : !subiendo && (
                            <button type="button" onClick={() => setArchivos((xs) => xs.filter((x) => x.clave !== a.clave))} className="text-gray-400 hover:text-gray-700" aria-label="Quitar">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                      </div>
                    </div>
                    {a.error && <div className="text-xs text-red-700 mt-1">{a.error}</div>}
                    {a.resultado && <div className="text-xs text-emerald-800 mt-1">Importado: {a.resultado}</div>}
                    <Detalle a={a} />
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <div className="text-[11px] text-gray-500">
            {sede === null ? "Elige la sede para continuar." : `Van a ${nombreSede}. Tu carga manda sobre la del administrador; la suya se conserva para comparar.`}
          </div>
          {terminado ? (
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-primary text-white text-sm">Listo</button>
          ) : (
            <button onClick={importar} disabled={subiendo || sede === null || listos.length === 0}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm flex items-center gap-1.5 disabled:opacity-50">
              {subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Importar {listos.length} archivo{listos.length === 1 ? "" : "s"}{nombreSede ? ` a ${nombreSede}` : ""}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
