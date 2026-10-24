"use client";

/**
 * Lo que Jahnn sube desde el dashboard de Grupo (pedido de Jahnn, 15-oct-2026):
 * finanzas no siempre manda a tiempo, así que él sube Byte cada semana (ventas,
 * mayor y menor rotación) y el Excel de cada sede cuando llega.
 *
 *   · BotonSubirByte  — abre el cargador del reporte de VENTAS de Byte (color #3b00a8).
 *                       Desde el 24-oct-2026 cada reporte tiene una sola puerta (decisión de
 *                       Jahnn): aquí la plata del día a día (ventas de Byte + Excel de cada
 *                       sede); la mayor y menor rotación se suben en Grupo → Productos.
 *   · DatosCargados   — hasta qué fecha llega cada cosa, en una franja: las ventas
 *                       de Byte en una línea (el grupo vale por su peor sede, con el detalle
 *                       por sede a un toque) y el Excel de cada sede con el día
 *                       en que se subió. Reglas: lib/frescura-importables.ts.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Upload } from "lucide-react";
import { getCoberturaRotacion } from "@/app/actions/productos-panorama";
import { getFrescuraImportables, type FrescuraImportables } from "@/app/actions/frescura";
import { ImportarReportesModal } from "@/app/grupo/productos/importar-reportes";
import type { PeriodoCargado } from "@/lib/productos/cobertura-rotacion";
import { ddmm, fechaDelGrupo, sedesQueArrastran, tonoDeFecha, type TonoFecha } from "@/lib/frescura-importables";
import { REPORTES_DEL_DASHBOARD } from "@/lib/productos/estado-reportes";

/** El morado de Byte, definido por Jahnn. */
export const COLOR_BYTE = "#3b00a8";

export function BotonSubirByte({ onCambio, className = "" }: { onCambio?: () => void; className?: string }) {
  const router = useRouter();
  const [abriendo, setAbriendo] = useState(false);
  const [periodos, setPeriodos] = useState<PeriodoCargado[] | null>(null);

  async function abrir() {
    setAbriendo(true);
    const r = await getCoberturaRotacion(6);
    setAbriendo(false);
    setPeriodos(r.ok ? r.periodos : []);
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        disabled={abriendo}
        className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-xl whitespace-nowrap bg-[#3b00a8] hover:bg-[#2f0087] disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b00a8] ${className}`}
      >
        {abriendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        Ventas de Byte
      </button>
      {periodos && (
        <ImportarReportesModal
          sedeInicial={null}
          periodos={periodos}
          tipos={REPORTES_DEL_DASHBOARD}
          onClose={() => setPeriodos(null)}
          onImportado={() => { router.refresh(); onCambio?.(); }}
        />
      )}
    </>
  );
}

const PILDORA: Record<TonoFecha, string> = {
  "al-dia": "bg-emerald-50 text-emerald-900 ring-emerald-200",
  atrasado: "bg-amber-50 text-amber-900 ring-amber-200",
  "muy-atrasado": "bg-red-50 text-red-800 ring-red-200",
  "sin-datos": "bg-gray-50 text-gray-500 ring-gray-200",
};
const PUNTO: Record<TonoFecha, string> = { "al-dia": "bg-emerald-500", atrasado: "bg-amber-500", "muy-atrasado": "bg-red-500", "sin-datos": "bg-gray-300" };

function Pildora({ nombre, hasta, hoy, extra }: { nombre: string; hasta: string | null; hoy: string; extra?: string }) {
  const tono = tonoDeFecha(hasta, hoy);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset ${PILDORA[tono]}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[tono]}`} aria-hidden />
      <span className="font-medium">{nombre}</span>
      <span className="tabular-nums">{hasta ? `al ${ddmm(hasta)}` : "sin datos"}</span>
      {extra && <span className="text-[10px] opacity-70">{extra}</span>}
    </span>
  );
}

export function DatosCargados({ version = 0, onVerExcel }: { version?: number; onVerExcel?: () => void }) {
  const [datos, setDatos] = useState<FrescuraImportables | null | undefined>(undefined);
  const cargar = useCallback(async () => {
    try { setDatos(await getFrescuraImportables()); } catch { setDatos(null); }
  }, []);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar y tras cada subida */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar, version]);

  if (datos === undefined) return <div className="h-24 rounded-2xl border border-gray-200 bg-white motion-safe:animate-pulse" aria-label="Cargando las fechas de los datos" />;
  if (datos === null) return null;

  const { hoy, sedes } = datos;
  const grupo = (k: "ventasHasta") => fechaDelGrupo(sedes.map((s) => s[k]));
  const arrastra = (k: "ventasHasta") =>
    sedesQueArrastran(sedes.map((s) => ({ nombre: s.nombre, hasta: s[k] })));
  // Solo lo que se sube aquí: las ventas de Byte. La rotación tiene su franja en Grupo → Productos.
  const byte = [{ nombre: "Ventas", k: "ventasHasta" as const }];
  const hayAtraso = byte.some((b) => tonoDeFecha(grupo(b.k), hoy) !== "al-dia");

  const hayAtrasoExcel = sedes.some((x) => tonoDeFecha(x.excelHasta, hoy) !== "al-dia");
  const todoAlDia = !hayAtraso && !hayAtrasoExcel;
  const masReciente = (fs: (string | null)[]) => fs.reduce<string | null>((m, f) => (f && (!m || f > m) ? f : m), null);
  // Divulgación progresiva: con todo al día es UNA línea; con atrasos se abre sola para mostrar cuál.
  return (
    <details open={!todoAlDia} className="group rounded-2xl border border-gray-200 bg-white px-4 py-3 sm:px-5" aria-label="Hasta qué fecha tenemos datos">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-0.5 [&::-webkit-details-marker]:hidden">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <span className={`h-2 w-2 rounded-full ${todoAlDia ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden />
          {todoAlDia ? "Datos al día" : "Hay datos atrasados"}
          <span className="font-normal text-gray-500">
            · Byte al {ddmm(masReciente(sedes.map((x) => x.ventasHasta)) ?? hoy)}{masReciente(sedes.map((x) => x.excelHasta)) ? ` · Excel al ${ddmm(masReciente(sedes.map((x) => x.excelHasta))!)}` : ""}
          </span>
        </h2>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
          Ver cada uno <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
        </span>
      </summary>
      {onVerExcel && <div className="mt-2"><button type="button" onClick={onVerExcel} className="text-xs font-medium text-primary hover:underline">Ver detalle del Excel</button></div>}

      <div className="mt-2.5 space-y-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="w-12 shrink-0 text-xs font-semibold" style={{ color: COLOR_BYTE }}>Byte</span>
          {byte.map((b) => <Pildora key={b.k} nombre={b.nombre} hasta={grupo(b.k)} hoy={hoy} />)}
        </div>
        {hayAtraso && (
          <p className="pl-[3.75rem] text-[11px] text-gray-500">
            Quien más atrasa · {byte.filter((b) => tonoDeFecha(grupo(b.k), hoy) !== "al-dia").map((b) => `${b.nombre}: ${arrastra(b.k).length === sedes.length ? "las tres sedes" : arrastra(b.k).join(" y ")}`).join(" · ")}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="w-12 shrink-0 text-xs font-semibold text-primary">Excel</span>
          {sedes.map((s) => <Pildora key={s.businessId} nombre={s.nombre} hasta={s.excelHasta} hoy={hoy} extra={s.excelSubido ? `subido ${ddmm(s.excelSubido)}` : undefined} />)}
        </div>
      </div>

      <details className="group mt-2.5">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-800">
          Byte sede por sede <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                <th className="py-1 pr-3 font-medium">Sede</th>
                {byte.map((b) => <th key={b.k} className="py-1 pr-3 font-medium">{b.nombre}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sedes.map((s) => (
                <tr key={s.businessId}>
                  <td className="py-1.5 pr-3 font-medium text-gray-800">{s.nombre}</td>
                  {byte.map((b) => (
                    <td key={b.k} className="py-1.5 pr-3">
                      <span className="inline-flex items-center gap-1.5 tabular-nums text-gray-700">
                        <span className={`h-1.5 w-1.5 rounded-full ${PUNTO[tonoDeFecha(s[b.k], hoy)]}`} aria-hidden />
                        {s[b.k] ? `al ${ddmm(s[b.k])}` : "sin datos"}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </details>
  );
}
