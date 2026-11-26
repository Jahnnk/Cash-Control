"use client";

/**
 * Ficha única de producto (fase 1 de «unificar pricing e ingeniería de menú», 25-nov-2026). La misma ventana se
 * abre desde Recetas y costos, Productos (matriz de la carta) y Dirección → Precios: ruta de precios, su lugar en
 * la matriz y su receta. Los precios de venta se cambian aquí mismo, en la ruta (fase 2); la receta, con «Editar
 * receta» (lleva a Recetas y costos); los insumos, en Insumos y packaging.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Pencil, X } from "lucide-react";
import { getFichaProducto, type DatosFicha } from "@/app/actions/ficha-producto";
import { getMenuDeProducto, type MenuDeProducto } from "@/app/actions/productos-panorama";
import { RutaPreciosAtelier, RutaPreciosCafeteria, type GuardarPrecio, type PrecioRuta } from "@/components/productos/ruta-precios";
import { guardarPrecioVenta } from "@/app/actions/carta";
import { sugeridoCafeteria, sugeridosAtelier } from "@/lib/precios-sugeridos";
import { CUADRANTES, type Cuadrante } from "@/lib/productos/matriz-carta";
import { Pastilla } from "@/components/productos/ui";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const soles4 = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const un = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1));
const COLOR: Record<Cuadrante, string> = { estrella: "#098B5F", vaca: "#4A7FB5", interrogante: "#C98A12", perro: "#C0392B" };

const ruta = (guardado: number | null, sugerido: number): PrecioRuta =>
  guardado && guardado > 0 ? { valor: guardado, sugerido: false } : sugerido > 0 ? { valor: sugerido, sugerido: true } : null;

export function FichaProducto({ cartaRef = null, recetaRef = null, nombreByte = null, onCerrar, onEditarReceta }: {
  cartaRef?: string | null;
  recetaRef?: string | null;
  /** Nombre del producto en Byte (desde la matriz o Precios). */
  nombreByte?: string | null;
  onCerrar: () => void;
  /** En Recetas y costos: abre el editor ahí mismo. En otras pantallas, «Editar receta» lleva a Recetas y costos. */
  onEditarReceta?: (recetaRef: string) => void;
}) {
  const [ficha, setFicha] = useState<DatosFicha | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuDeProducto | null>(null);
  const [errorMenu, setErrorMenu] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void getFichaProducto({ cartaRef, recetaRef, nombreByte }).then((r) => {
      if (!vivo) return;
      if (!r.ok) { setError(r.error); return; }
      setFicha(r.ficha);
      // La matriz tarda más (lee las ventas desde abril): llega después.
      if (r.ficha.cartaRef) {
        void getMenuDeProducto(r.ficha.cartaRef).then((m) => {
          if (!vivo) return;
          if (m.ok) setMenu(m.menu); else setErrorMenu(m.error);
        });
      }
    });
    return () => { vivo = false; };
  }, [cartaRef, recetaRef, nombreByte]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4" onClick={onCerrar}>
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label={ficha ? `Ficha de ${ficha.nombre}` : "Ficha del producto"}>
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{ficha?.nombre ?? "Ficha del producto"}</h2>
            {ficha && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Pastilla tono={ficha.origen === "Atelier" ? "marca" : "azul"}>{ficha.origen === "Atelier" ? "Lo hace Atelier" : "Se prepara en la cafetería"}</Pastilla>
                {ficha.seccion && <Pastilla>{ficha.seccion}</Pastilla>}
                {!ficha.cartaRef && <Pastilla tono="ambar">No está en la carta</Pastilla>}
              </div>
            )}
          </div>
          <button onClick={onCerrar} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-5 p-4 sm:p-6">
          {error ? <p className="text-sm text-red-700">{error}</p>
            : !ficha ? <div className="flex justify-center py-10 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
            : (
              <>
                <Ruta f={ficha} onGuardar={ficha.puedeEditar ? async (campo, precio) => {
                  const r = await guardarPrecioVenta({ campo, precio, cartaRef: ficha.cartaRef, b2bRef: ficha.b2bRef });
                  if (!r.ok) return r.error;
                  setFicha((f) => f && { ...f, precios: { ...f.precios, [campo]: precio } });
                  return null;
                } : undefined} />
                <Matriz f={ficha} menu={menu} error={errorMenu} />
                <Receta f={ficha} />
              </>
            )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-4 py-4 sm:px-6">
          <p className="text-[11px] text-gray-500">Los precios de venta se cambian aquí, en la ruta. La receta, con «Editar receta». Los precios de insumos, en Insumos y packaging.</p>
          <div className="flex gap-2">
            <button onClick={onCerrar} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cerrar</button>
            {ficha?.recetaRef && (onEditarReceta
              ? <button onClick={() => onEditarReceta(ficha.recetaRef!)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light"><Pencil className="h-4 w-4" /> Editar receta</button>
              : <Link href={`/grupo/recetas?editar=${encodeURIComponent(ficha.recetaRef)}`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light"><Pencil className="h-4 w-4" /> Editar receta</Link>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Ruta({ f, onGuardar }: { f: DatosFicha; onGuardar?: GuardarPrecio }) {
  if (f.costo === null) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Sin costo: no se puede armar la ruta de precios. Revisa su receta en Recetas y costos.</p>;
  }
  if (f.origen === "Cafetería") {
    return <RutaPreciosCafeteria costo={f.costo} carta={ruta(f.precios.carta, sugeridoCafeteria(f.costo))} onGuardar={f.cartaRef ? onGuardar : undefined} />;
  }
  const s = sugeridosAtelier(f.costo, f.precios.interno);
  return <RutaPreciosAtelier costo={f.costo} interno={ruta(f.precios.interno, s.interno)} carta={ruta(f.precios.carta, s.carta)} b2b={ruta(f.precios.b2b, s.b2b)}
    editables={{ interno: !!f.cartaRef, carta: !!f.cartaRef, b2b: !!f.b2bRef }} onGuardar={onGuardar} />;
}

function Matriz({ f, menu, error }: { f: DatosFicha; menu: MenuDeProducto | null; error: string | null }) {
  return (
    <section className="space-y-2 rounded-xl border border-gray-200/80 p-3" aria-label="En la carta">
      <h3 className="text-[13px] font-semibold text-gray-900">En la carta (matriz de ingeniería de menú)</h3>
      {!f.cartaRef ? <p className="text-xs text-gray-500">No está en la carta de las cafeterías: no entra en la matriz.</p>
        : error ? <p className="text-xs text-red-700">{error}</p>
        : !menu ? <p className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Ubicando en la matriz con las ventas desde abril…</p>
        : !menu.encontrado ? <p className="text-xs text-gray-500">No aparece en las ventas de Byte de Fonavi y Centro (todavía no se vende o tiene otro nombre en Byte).</p>
        : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {menu.cuadrante ? (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ background: COLOR[menu.cuadrante] }}>
                  {CUADRANTES[menu.cuadrante].nombre} · {CUADRANTES[menu.cuadrante].accion}
                </span>
              ) : (
                <Pastilla tono="gris">{menu.situacion === "prueba" ? "Producto nuevo en prueba" : menu.situacion === "sin-costo" ? "Sin costo: no se ubica" : "No se ubica"}</Pastilla>
              )}
              {menu.tendencia && <span className="text-xs text-gray-600">Tendencia: {menu.tendencia}</span>}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Dato titulo="Por semana" valor={`${un(menu.unidadesSemana)} und`} />
              <Dato titulo="Deja por venta" valor={menu.margenUnidad != null ? soles(menu.margenUnidad) : "—"} />
              <Dato titulo="Venta al mes" valor={menu.ventaMes != null ? soles(menu.ventaMes) : "—"} />
              <Dato titulo="Ganancia al mes" valor={menu.gananciaMes != null ? soles(menu.gananciaMes) : "—"} />
            </div>
            {(menu.porQue || menu.motivoFuera) && <p className="text-xs text-gray-600">{menu.porQue ?? menu.motivoFuera}</p>}
            {menu.porSede.length > 1 && (
              <p className="text-[11px] text-gray-500">{menu.porSede.map((s) => `${s.sede}: ${un(s.unidadesSemana)} por semana`).join(" · ")}</p>
            )}
          </div>
        )}
    </section>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-2.5 py-1.5">
      <div className="text-[11px] text-gray-500">{titulo}</div>
      <div className="font-semibold tabular-nums text-gray-900">{valor}</div>
    </div>
  );
}

function Receta({ f }: { f: DatosFicha }) {
  const total = f.ingredientes.reduce((a, g) => a + (g.costo ?? 0), 0);
  return (
    <details className="group rounded-xl border border-gray-200/80">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5">
        <span className="text-[13px] font-semibold text-gray-900">Receta</span>
        <span className="text-xs text-gray-500">
          {f.ingredientes.length > 0 ? `${f.ingredientes.length} ingredientes${f.rendimiento ? ` · rinde ${f.rendimiento}` : ""}` : "sin detalle"}
          <span className="ml-1 text-primary group-open:hidden">· ver</span>
        </span>
      </summary>
      <div className="border-t border-gray-100 px-3 py-2">
        {f.ingredientes.length === 0 ? <p className="text-xs text-gray-500">{f.sinReceta}</p> : (
          <table className="w-full text-xs">
            <thead><tr className="text-[10px] uppercase text-gray-500"><th className="py-1 text-left font-medium">Ingrediente</th><th className="py-1 text-right font-medium">Cantidad</th><th className="py-1 text-right font-medium">Costo</th></tr></thead>
            <tbody>
              {f.ingredientes.map((g, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1 pr-2 text-gray-800">{g.nombre}</td>
                  <td className="py-1 text-right tabular-nums text-gray-600">{g.cantidad != null ? `${g.cantidad.toLocaleString("es-PE")} ${g.unidad ?? ""}` : "—"}</td>
                  <td className="py-1 text-right tabular-nums text-gray-800">{g.costo != null ? soles4(g.costo) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 font-medium">
                <td className="py-1 text-gray-700">{f.origen === "Cafetería" && f.ingredientes[0]?.cantidad == null ? "Por unidad" : "Toda la receta"}</td>
                <td />
                <td className="py-1 text-right tabular-nums text-gray-900">{soles4(total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
        {f.merma > 0 && <p className="mt-1 text-[11px] text-gray-500">Merma de preparación: {Math.round(f.merma * 1000) / 10}%.</p>}
      </div>
    </details>
  );
}
