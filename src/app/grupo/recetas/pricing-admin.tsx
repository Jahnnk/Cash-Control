"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Calculator, Loader2, Upload, Check, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { getEstadoPricing, guardarCostos, type EstadoPricing } from "@/app/actions/costos-preparaciones";
import { claveNombre, type CostoPreparacion, type ResumenPricing } from "@/lib/costos-preparaciones";

const TIPO_PLURAL = { producto: "productos", preparacion: "preparaciones", insumo: "insumos" } as const;
const soles = (n: number) => `S/${n.toFixed(2)}`;
const fechaLarga = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });

/**
 * "Costos de Atelier para las mermas": Jahnn sube su Excel maestro de
 * pricing y la administradora de Atelier costea sus mermas sola con esa
 * lista (ver actions/costos-preparaciones.ts). Primero se muestra qué se
 * leyó y recién al confirmar se reemplaza la lista.
 */
export function PricingAdmin({ onActualizado }: { onActualizado?: () => void } = {}) {
  const { showToast } = useToast();
  const [estado, setEstado] = useState<EstadoPricing | undefined>(undefined);
  const [leido, setLeido] = useState<{ archivo: string; items: CostoPreparacion[] } | null>(null);
  const [resumen, setResumen] = useState<ResumenPricing | null>(null);
  const [busy, setBusy] = useState<"leyendo" | "guardando" | null>(null);
  /** Recetas del sistema que el Excel trae con el mismo nombre y se reemplazan por la del Excel (id → sí/no). */
  const [conExcel, setConExcel] = useState<Record<number, boolean>>({});
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => setEstado(await getEstadoPricing()), []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  function limpiar() {
    setLeido(null);
    setConExcel({});
    setResumen(null);
    if (input.current) input.current.value = "";
  }

  /** El Excel se lee acá, en el navegador: pesa más de lo que admite el servidor por envío. */
  async function elegir(f: File | undefined) {
    if (!f) return;
    setResumen(null);
    setBusy("leyendo");
    try {
      const [{ leerPricingAtelier }, { resumirPricing }] = await Promise.all([
        import("@/lib/costos-preparaciones-excel"),
        import("@/lib/costos-preparaciones"),
      ]);
      const lectura = leerPricingAtelier(new Uint8Array(await f.arrayBuffer()));
      if (lectura.items.filter((i) => i.tipo === "producto").length === 0) {
        showToast("No encontré productos de Atelier en la hoja PRICING. ¿Es el Excel maestro de pricing?", "error");
        limpiar();
        return;
      }
      setLeido({ archivo: f.name, items: lectura.items });
      setResumen(resumirPricing(f.name, lectura));
    } catch {
      showToast("No se pudo leer el Excel. Revisa que no esté dañado o protegido con contraseña.", "error");
      limpiar();
    } finally {
      setBusy(null);
    }
  }

  async function guardar() {
    if (!leido) return;
    setBusy("guardando");
    const quedarmeConExcel = duplicadas.filter((d) => conExcel[d.id] !== false).map((d) => ({ id: d.id, ref: d.excel.ref }));
    const r = await guardarCostos({ ...leido, quedarmeConExcel });
    setBusy(null);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(
      `Lista de costos de Atelier actualizada (${r.guardados} ítems)` +
        (r.reemplazadas > 0 ? ` · ${r.reemplazadas} receta${r.reemplazadas === 1 ? "" : "s"} del sistema reemplazada${r.reemplazadas === 1 ? "" : "s"} por la del Excel.` : "."),
      "success",
    );
    limpiar();
    void load();
    onActualizado?.();
  }

  const total = estado ? estado.conteos.producto + estado.conteos.preparacion + estado.conteos.insumo : 0;

  // Recetas que creaste en el sistema y que este Excel ya trae con el mismo nombre.
  const duplicadas = (estado?.propias ?? []).flatMap((p) => {
    const excel = leido?.items.find((i) => i.tipo !== "insumo" && claveNombre(i.nombre) === claveNombre(p.nombre));
    return excel ? [{ ...p, excel }] : [];
  });

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" /> Costos de Atelier para las mermas
          </h2>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
            Sube tu Excel maestro de pricing cuando cambien precios o varias recetas a la vez: la administradora de Atelier
            elige en sus mermas el producto, la preparación o el insumo, y el sistema pone solo el costo en insumos. Para una
            sola receta no hace falta: créala o modifícala abajo. Las mermas ya registradas no cambian.
          </p>
        </div>
        <label className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap ${
          busy ? "bg-gray-100 text-gray-400 pointer-events-none" : "bg-primary text-white hover:bg-primary-light"
        }`}>
          {busy === "leyendo" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {busy === "leyendo" ? "Leyendo…" : "Subir Excel de pricing"}
          <input ref={input} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => void elegir(e.target.files?.[0])} />
        </label>
      </div>

      {estado === undefined ? null : estado && total > 0 ? (
        <div className="text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
          Cargado: <strong>{estado.archivo}</strong>
          {estado.cargadoEl && <> · el {fechaLarga(estado.cargadoEl)}</>} · {estado.conteos.producto} productos,{" "}
          {estado.conteos.preparacion} preparaciones y {estado.conteos.insumo} insumos.
        </div>
      ) : (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Todavía no hay lista de costos: las mermas de Atelier se siguen costeando a mano.
        </div>
      )}

      {resumen && (
        <div className="border border-primary-100 bg-primary-50/40 rounded-lg p-3 space-y-3">
          <div className="text-xs text-gray-800">
            <strong>{resumen.archivo}</strong> trae{" "}
            {(["producto", "preparacion", "insumo"] as const).map((t, i) => (
              <span key={t}>{i > 0 && (i === 2 ? " y " : ", ")}<strong>{resumen.conteos[t]}</strong> {TIPO_PLURAL[t]}</span>
            ))}
            . Revisa que estos costos sean los que conoces:
          </div>
          {resumen.ejemplos.length > 0 && (
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
              {resumen.ejemplos.map((e) => (
                <li key={e.ref} className="flex justify-between gap-3 border-b border-primary-100/70 py-1">
                  <span className="text-gray-700">{e.nombre}</span>
                  <span className="tabular-nums font-medium text-gray-900 whitespace-nowrap">{soles(e.costo)} / {e.unidad}</span>
                </li>
              ))}
            </ul>
          )}
          {estado && estado.reemplazos.length > 0 && (
            <div className="text-[11px] text-gray-700">
              <span className="font-medium">Siguen valiendo tus versiones del sistema</span> (no las pisa este Excel):{" "}
              {estado.reemplazos.map((r) => r.nombre).join(", ")}. Si quieres la del Excel, ábrela abajo y elige «Volver a la del Excel».
            </div>
          )}
          {resumen.sinPricing && resumen.sinPricing.length > 0 && (
            <div className="text-[11px] text-gray-700">
              <span className="font-medium">Entran aunque no tienen fila en PRICING</span> (tienen su receta en las hojas de producción):{" "}
              {resumen.sinPricing.join(", ")}.
            </div>
          )}
          {duplicadas.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-2">
              <div className="text-[11px] font-medium text-amber-900">
                Este Excel ya trae recetas que creaste en el sistema. ¿Con cuál te quedas?
              </div>
              {duplicadas.map((d) => (
                <label key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-800 cursor-pointer">
                  <input type="checkbox" className="accent-[#004C40]" checked={conExcel[d.id] !== false}
                    onChange={(e) => setConExcel((p) => ({ ...p, [d.id]: e.target.checked }))} />
                  <span className="font-medium">{d.nombre}</span>
                  <span className="text-gray-500 tabular-nums">
                    sistema {d.costo !== null ? `${soles(d.costo)} / ${d.unidad}` : "sin costo"} · Excel {soles(d.excel.costo)} / {d.excel.unidad}
                  </span>
                  <span className="text-[11px] text-gray-500">
                    {conExcel[d.id] !== false ? "→ me quedo con la del Excel (se borra la del sistema)" : "→ se quedan las dos"}
                  </span>
                </label>
              ))}
            </div>
          )}
          {resumen.avisos.length > 0 && (
            <div className="text-[11px] text-amber-800 space-y-0.5">
              <div className="flex items-center gap-1 font-medium"><AlertTriangle className="w-3 h-3" /> Para revisar en el Excel:</div>
              {resumen.avisos.map((a) => <div key={a}>· {a}</div>)}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={limpiar}
              disabled={!!busy} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-white rounded-lg disabled:opacity-50">
              Cancelar
            </button>
            <button type="button" onClick={() => void guardar()} disabled={!!busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50">
              {busy === "guardando" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Usar esta lista
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
