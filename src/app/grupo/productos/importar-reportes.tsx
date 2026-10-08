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
import { getCoberturaRotacion } from "@/app/actions/productos-panorama";
import { GrillaCobertura, FaltaSubir, casilla, type DatosCobertura } from "./grilla-cobertura";
import { limitesDelMes, type DetalleReporte } from "@/lib/productos/estado-reportes";

const SEDES = [
  { id: 2, nombre: "Fonavi" },
  { id: 3, nombre: "Centro" },
  { id: 1, nombre: "Atelier" },
];

const NOMBRE_TIPO: Record<TipoReporteByte, string> = { ventas: "Ventas del mes", mayor: "Mayor rotación", menor: "Menor rotación" };

/** Los tres reportes de Byte que sube gerencia: uno por cuadro. */
type DefReporte = { tipo: TipoReporteByte; titulo: string; ejemplo: string; ayuda: string };

const MES_BYTE = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const dm = (iso: string) => `${Number(iso.slice(8, 10))} ${MES_CORTO[Number(iso.slice(5, 7)) - 1]}`;

/** Los tres cuadros para el mes que se va a subir: el título que debe traer cada archivo en Byte y el rango que hay que exportar. */
export function reportesPara(mes: string, hoy: string): DefReporte[] {
  const { ini, fin } = limitesDelMes(mes, hoy);
  const enCurso = hoy.slice(0, 7) === mes;
  const hasta = enCurso ? "ayer" : dm(fin);
  const [y, m] = mes.split("-").map(Number);
  // La menor rotación es una foto de la sede: conviene un rango largo (hasta 6 meses, sin pasar de abril).
  const seis = new Date(Date.UTC(y, m - 6, 1)).toISOString().slice(0, 7);
  const iniMenor = `${seis < "2026-04" ? "2026-04" : seis}-01`;
  return [
    { tipo: "ventas", titulo: "Reporte de ventas", ejemplo: `Ventas de ${MES_BYTE[m - 1]} ${y}`, ayuda: `Venta de cada día. Del 01 al ${hasta}.` },
    { tipo: "mayor", titulo: "Productos con mayor rotación", ejemplo: `Platos con mayor rotacion del ${ini} al ${fin}`, ayuda: `Lo que más se vende. Del 01 al ${hasta}.` },
    { tipo: "menor", titulo: "Productos con menor rotación", ejemplo: `Platos con menor rotacion del ${iniMenor} al ${fin}`, ayuda: `Lo que casi no se vende. Del 01 al ${hasta}, o un solo rango largo (del ${dm(iniMenor)}). Cada rango se guarda aparte.` },
  ];
}
const TITULO_TIPO: Record<TipoReporteByte, string> = { ventas: "Reporte de ventas", mayor: "Productos con mayor rotación", menor: "Productos con menor rotación" };

/** Un cuadro para un solo tipo de reporte. */
export function CuadroReporte({ r, deshabilitado, cargados, estado, onArchivos }: {
  r: DefReporte;
  deshabilitado: boolean;
  cargados: number;
  /** Cómo está ese reporte en la sede y el mes elegidos (null = todavía no se eligió mes). */
  estado: DetalleReporte | null;
  onArchivos: (files: FileList | File[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [sobre, setSobre] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setSobre(true); }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => { e.preventDefault(); setSobre(false); if (!deshabilitado) onArchivos(e.dataTransfer.files); }}
      onClick={() => !deshabilitado && ref.current?.click()}
      className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer min-w-0 ${sobre ? "border-primary bg-primary/5" : cargados > 0 ? "border-emerald-300 bg-emerald-50/40" : "border-gray-300 hover:border-gray-400"} ${deshabilitado ? "opacity-60 cursor-not-allowed" : ""}`}>
      <input ref={ref} type="file" accept=".xlsx,.xls" multiple className="hidden"
        onChange={(e) => { if (e.target.files) onArchivos(e.target.files); e.target.value = ""; }} />
      {cargados > 0 ? <CheckCircle2 className="w-5 h-5 mx-auto text-emerald-600 mb-1" /> : <Upload className="w-5 h-5 mx-auto text-gray-400 mb-1" />}
      <div className="text-sm font-semibold text-gray-900">{r.titulo}</div>
      {estado && (
        <div className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${estado.estado === "completo" ? "bg-emerald-100 text-emerald-800" : estado.estado === "parcial" ? "bg-amber-100 text-amber-900" : estado.estado === "revisar" ? "bg-orange-100 text-orange-900" : "bg-red-100 text-red-800"}`}>
          {estado.estado === "completo" ? `✓ ya está · ${estado.texto}` : estado.estado === "parcial" ? `! incompleto · ${estado.texto}` : estado.estado === "revisar" ? `≠ guardado · ${estado.texto}` : "✕ falta subirlo"}
        </div>
      )}
      {estado?.estado === "revisar" && <div className="text-[10px] text-orange-800 mt-1">El archivo sí se guardó: no falta subir nada. Revisa el reporte en Byte.</div>}
      <div className="text-[11px] text-gray-600 mt-1">{r.ayuda}</div>
      <div className="text-[10px] text-gray-400 mt-1 break-words">Título en Byte: «{r.ejemplo}»</div>
      <div className="text-[11px] text-primary mt-1.5">{cargados > 0 ? `${cargados} archivo${cargados === 1 ? "" : "s"} · agregar otro` : "Click o arrastra el .xlsx"}</div>
    </div>
  );
}

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

export function ImportarReportesModal({ sedeInicial, mesInicial = null, periodos, onClose, onImportado }: {
  sedeInicial: number | null;
  /** El mes de la tarjeta que se tocó (YYYY-MM): los cuadros piden los archivos de ese mes. */
  mesInicial?: string | null;
  periodos: PeriodoCargado[];
  onClose: () => void;
  onImportado: () => void;
}) {
  const [sede, setSede] = useState<number | null>(sedeInicial);
  const [mes, setMes] = useState<string | null>(mesInicial);
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  // Qué meses tiene cada sede (de abril a hoy), para decir cuál falta subir.
  const [cobertura, setCobertura] = useState<DatosCobertura | null>(null);
  const refrescarCobertura = () => getCoberturaRotacion(12).then((r) => { if (r.ok) setCobertura({ hoy: r.hoy, periodos: r.periodos, ventas: r.ventas, menor: r.menor }); });
  useEffect(() => {
    let vivo = true;
    getCoberturaRotacion(12).then((r) => { if (vivo && r.ok) setCobertura({ hoy: r.hoy, periodos: r.periodos, ventas: r.ventas, menor: r.menor }); });
    return () => { vivo = false; };
  }, []);
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

  async function agregar(files: FileList | File[], esperado?: TipoReporteByte) {
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
        // Cada cuadro recibe solo su reporte: así no se sube uno por otro.
        if (esperado && tipo !== esperado) {
          actualizar(clave, { tipo, estado: "error", error: `Este archivo es «${TITULO_TIPO[tipo]}», no «${TITULO_TIPO[esperado]}». Suéltalo en su propio cuadro.` });
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
    // Los cuadros de arriba se actualizan solos: se ve cómo el mes pasa a «completo».
    void refrescarCobertura();
  }

  const nombreSede = SEDES.find((s) => s.id === sede)?.nombre;
  const terminado = archivos.length > 0 && archivos.every((a) => a.estado === "subido" || a.estado === "fallo" || a.estado === "error");

  function Detalle({ a }: { a: Archivo }) {
    if (a.estado !== "listo") return null;
    if (a.tipo === "ventas") {
      const c = a.comparacion && a.comparacion.sede === sede ? a.comparacion : null;
      return (
        <div className="mt-1 space-y-0.5 text-xs">
          {sede === null && <div className="text-gray-500">Elige la sede para compararlo con lo que subió administración.</div>}
          {c && "error" in c && <div className="text-red-700">{c.error}</div>}
          {c && "data" in c && (
            <>
              {c.data.descartados.map((d) => (
                <div key={d.date} className="text-gray-600">El {fecha(d.date)} no se toma: el día no había cerrado ({formatCurrency(d.total)}).</div>
              ))}
              <div className="text-sky-800">
                Se guardan {c.data.dias} días ({fecha(c.data.desde)} → {fecha(c.data.hasta)}, {formatCurrency(c.data.total)}):{" "}
                {c.data.iguales} iguales a lo que subió administración
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
            {a.productos?.length} productos: {nunca} nunca vendidos · {sinVenta} sin ventas en el rango · el resto con muy pocas. Se guarda como la lista de {fecha(a.desde)} → {fecha(a.hasta)}: solo reemplaza las listas que ese rango ya cubre; las demás de la sede se conservan.
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
          {cobertura && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-700">Qué tiene cada sede <span className="font-normal text-gray-500">· toca la tarjeta del mes que vas a subir</span></div>
              <GrillaCobertura compacto datos={cobertura} elegido={{ sede, mes }} onCelda={(id, m) => { if (!subiendo) { setSede(id); setMes(m); } }} />
              {sede !== null ? <FaltaSubir datos={cobertura} soloSede={sede} /> : <p className="text-[11px] text-gray-500">Elige una sede (o toca una tarjeta) para ver qué reporte le falta.</p>}
            </div>
          )}

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
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs font-semibold text-gray-700">2 · Sube cada reporte en su cuadro</div>
              {mes && sede !== null && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                  {nombreSede} · {monthLabel(mes)}
                  {!subiendo && <button type="button" onClick={() => setMes(null)} aria-label="Quitar el mes elegido" className="text-primary/70 hover:text-primary">×</button>}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {reportesPara(mes ?? cobertura?.hoy.slice(0, 7) ?? "2026-10", cobertura?.hoy ?? new Date().toISOString().slice(0, 10)).map((r) => (
                <CuadroReporte key={r.tipo} r={r} deshabilitado={subiendo}
                  cargados={archivos.filter((a) => a.tipo === r.tipo && a.estado !== "error").length}
                  estado={cobertura && sede !== null && mes ? casilla(cobertura, sede, mes).tres[r.tipo === "ventas" ? "ventas" : r.tipo === "mayor" ? "mayor" : "menor"] : null}
                  onArchivos={(files) => void agregar(files, r.tipo)} />
              ))}
            </div>
            <p className="text-[11px] text-gray-500">
              {mes ? "Cada cuadro muestra qué título debe traer el archivo de ese mes y si ese reporte ya está. " : "Toca la tarjeta de un mes para que los cuadros pidan los archivos de ese mes. "}
              Si sueltas uno equivocado, te avisa.
            </p>
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
                    {mes && a.month && a.tipo !== "menor" && a.month !== mes && a.estado === "listo" && (
                      <div className="text-xs text-amber-800 mt-1">Elegiste {monthLabel(mes)}, pero este archivo es de {monthLabel(a.month)}: se guardará como {monthLabel(a.month)}.</div>
                    )}
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
