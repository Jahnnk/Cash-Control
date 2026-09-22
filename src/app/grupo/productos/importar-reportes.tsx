"use client";

/**
 * Subir VARIOS reportes de Byte a la vez (pedido de Jahnn, 22-sep-2026: "tengo
 * 3 archivos: junio, julio y agosto… y si ahora descargo lo que va de
 * setiembre").
 *
 * Se elige la sede (el reporte de Byte no dice de qué local es; si el nombre
 * del archivo lo dice, se propone), se sueltan los archivos y, ANTES de
 * guardar, cada uno muestra qué mes y qué días cubre, cuánto suma contra el
 * total de Byte y qué va a pasar: nuevo, reemplaza tu carga anterior, o se
 * compara con lo que subió la sede. Recién ahí se importan, uno por uno.
 */

import { useRef, useState } from "react";
import { X, Upload, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet, Trash2 } from "lucide-react";
import { formatCurrency, monthLabel } from "@/lib/utils";
import { parseByteRotacion, type ByteRotacionItem } from "@/lib/byte-rotacion-parser";
import { importProductSalesForSede } from "@/app/actions/product-sales-import";
import { queHaraLaCarga, sedeDelNombre, type PeriodoCargado } from "@/lib/productos/cobertura-rotacion";

const SEDES = [
  { id: 2, nombre: "Fonavi" },
  { id: 3, nombre: "Centro" },
  { id: 1, nombre: "Atelier" },
];

type Archivo = {
  clave: string;
  nombre: string;
  estado: "leyendo" | "listo" | "error" | "subiendo" | "subido" | "fallo";
  error?: string;
  month?: string;
  desde?: string;
  hasta?: string;
  items?: ByteRotacionItem[];
  total?: number;
  totalByte?: number | null;
  formato?: "rotacion" | "rentabilidad";
  warnings?: string[];
  resultado?: string;
};

const fecha = (iso?: string) => (iso ? `${Number(iso.slice(8))}/${iso.slice(5, 7)}` : "—");

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

  function actualizar(clave: string, cambio: Partial<Archivo>) {
    setArchivos((xs) => xs.map((a) => (a.clave === clave ? { ...a, ...cambio } : a)));
  }

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
        const r = parseByteRotacion(rows);
        if (!r.ok) { actualizar(clave, { estado: "error", error: r.errors.join(" ") }); continue; }
        if (!r.month) { actualizar(clave, { estado: "error", error: "El título del reporte no trae el rango de fechas (del … al …)." }); continue; }
        if (cruzaDeMes(r.periodStart, r.periodEnd)) {
          actualizar(clave, { estado: "error", error: `Cruza de mes (${fecha(r.periodStart ?? undefined)} → ${fecha(r.periodEnd ?? undefined)}): exporta un archivo por mes.` });
          continue;
        }
        actualizar(clave, {
          estado: "listo", month: r.month,
          desde: r.periodStart ?? `${r.month}-01`, hasta: r.periodEnd ?? `${r.month}-28`,
          items: r.items, total: Math.round(r.items.reduce((t, it) => t + it.revenue, 0) * 100) / 100,
          totalByte: r.declaredTotal, formato: r.format, warnings: r.warnings,
        });
      } catch {
        actualizar(clave, { estado: "error", error: "No pude leer el Excel. ¿Es «Platos con mayor rotación» de Byte (.xlsx)?" });
      }
    }
  }

  // Dos archivos del mismo mes que se pisan: el segundo reemplazaría al primero.
  const listos = archivos.filter((a) => a.estado === "listo").sort((a, b) => (a.desde ?? "").localeCompare(b.desde ?? ""));
  const pisados = new Set<string>();
  for (let i = 0; i < listos.length; i++) for (let j = i + 1; j < listos.length; j++) {
    const a = listos[i], b = listos[j];
    if (a.month === b.month && a.desde! <= b.hasta! && b.desde! <= a.hasta!) { pisados.add(a.clave); pisados.add(b.clave); }
  }

  async function importar() {
    if (sede === null) return;
    setSubiendo(true);
    // En orden de fecha: así la grilla se va llenando de junio hacia adelante.
    for (const a of listos) {
      actualizar(a.clave, { estado: "subiendo" });
      const r = await importProductSalesForSede(sede, {
        month: a.month!, fileName: a.nombre, items: a.items!, declaredTotal: a.totalByte ?? null,
        parseWarnings: a.warnings ?? [], periodStart: a.desde, periodEnd: a.hasta,
      });
      if (r.ok) {
        actualizar(a.clave, { estado: "subido", resultado: `${r.imported} productos · ${formatCurrency(r.totalRevenue)}` });
      } else {
        actualizar(a.clave, { estado: "fallo", error: r.error });
      }
    }
    setSubiendo(false);
    onImportado();
  }

  const nombreSede = SEDES.find((s) => s.id === sede)?.nombre;
  const terminado = archivos.length > 0 && archivos.every((a) => a.estado === "subido" || a.estado === "fallo" || a.estado === "error");

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !subiendo && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" /> Subir reportes de rotación de Byte
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
            <div className="text-xs font-semibold text-gray-700">2 · Suelta uno o varios reportes «Platos con mayor rotación»</div>
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
                Mes completo (junio, julio, agosto…) o lo que va del mes (del 1 al 21 de setiembre). El mes y los días salen del título de cada archivo.
              </div>
            </div>
          </div>

          {archivos.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-700">3 · Revisa qué va a pasar con cada uno</div>
              {archivos
                .slice()
                .sort((a, b) => (a.desde ?? "z").localeCompare(b.desde ?? "z"))
                .map((a) => {
                  const que = a.estado === "listo" && sede !== null && a.month
                    ? queHaraLaCarga({ businessId: sede, month: a.month, desde: a.desde!, hasta: a.hasta!, total: a.total ?? 0 }, periodos)
                    : null;
                  const difByte = a.totalByte != null && a.total != null ? Math.round((a.total - a.totalByte) * 100) / 100 : null;
                  return (
                    <div key={a.clave} className={`rounded-xl border px-3 py-2.5 text-sm ${a.estado === "error" || a.estado === "fallo" ? "border-red-200 bg-red-50/50" : a.estado === "subido" ? "border-emerald-200 bg-emerald-50/50" : "border-gray-200"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate">
                            {a.month ? `${monthLabel(a.month)} · ${fecha(a.desde)} → ${fecha(a.hasta)}` : a.nombre}
                          </div>
                          <div className="text-[11px] text-gray-500 truncate">{a.nombre}</div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {a.total != null && (
                            <div className="text-right">
                              <div className="font-semibold tabular-nums">{formatCurrency(a.total)}</div>
                              <div className="text-[10px] text-gray-500">{a.items?.length} productos{difByte !== null && Math.abs(difByte) < 1 ? " · cuadra con Byte ✓" : ""}</div>
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
                      {a.estado === "listo" && (
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
                      )}
                    </div>
                  );
                })}
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
