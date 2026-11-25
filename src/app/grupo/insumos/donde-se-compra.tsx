"use client";

/**
 * Ficha del insumo → «Dónde se compra» (24-nov-2026). Los proveedores que lo venden con su último precio (de las
 * compras reales de Control de Caja o anotado a mano como «cotizado»), ya en la unidad del insumo y por su
 * presentación. Desde aquí se conecta un producto de proveedor o se anota dónde se compra. Un precio de proveedor
 * nunca cambia solo el de las recetas: «Usar este precio» pide confirmar.
 */

import { useState } from "react";
import { Plus, Search, Store } from "lucide-react";
import type { FichaInsumo } from "@/app/actions/insumos";
import {
  agregarDondeSeCompra, conectarProductoInsumo, desconectarProductoInsumo, getOpcionesProveedores, type OpcionesProveedores, type ProductoProveedor,
} from "@/app/actions/insumos-proveedores";
import { Pastilla } from "@/components/productos/ui";
import { diasEntre, factorPresentacion, factorSeguro, masParecidos, normalizarNombre, precioPorPresentacion, textoPresentacion } from "@/lib/insumos-ficha";
import { fechaCorta, soles, solesRedondo } from "./piezas";

const DIAS_PRECIO_PROVEEDOR_VIEJO = 90;

export function DondeSeCompra({ i, hoy, usarPrecio, onCambio }: {
  i: FichaInsumo;
  hoy: string;
  usarPrecio: (precio: number) => Promise<string | null>;
  onCambio: () => Promise<void>;
}) {
  const [modo, setModo] = useState<null | "conectar" | "anotar">(null);
  const [opciones, setOpciones] = useState<OpcionesProveedores | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abrir = async (m: "conectar" | "anotar") => {
    setModo(m);
    setError(null);
    if (!opciones) {
      const r = await getOpcionesProveedores();
      if (r.ok) setOpciones(r.datos); else setError(r.error);
    }
  };
  const correr = async (f: () => Promise<{ ok: boolean; error?: string }>) => {
    setOcupado(true);
    setError(null);
    const r = await f();
    if (!r.ok) { setOcupado(false); setError(r.error ?? "No se pudo guardar."); return false; }
    await onCambio();
    setOcupado(false);
    setModo(null);
    return true;
  };

  const fPres = factorPresentacion(i.unidad, i.presentacion);
  const sinPrecio = i.productosProveedor.filter((p) => !i.dondeSeCompra.some((o) => o.productoId === p.productoId));

  return (
    <section>
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-900"><Store className="h-4 w-4 text-gray-400" /> Dónde se compra</h3>

      {i.dondeSeCompra.length === 0 && sinPrecio.length === 0 && !modo && (
        <p className="mt-1 text-xs text-gray-500">Todavía no tiene proveedor. Agrega dónde lo compran y a cuánto.</p>
      )}

      {i.dondeSeCompra.length > 0 && (
        <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200/80">
          {i.dondeSeCompra.map((o, k) => {
            const dif = i.precio > 0 ? Math.round(((o.precioInsumo - i.precio) / i.precio) * 100) : 0;
            const viejo = diasEntre(o.fecha, hoy) > DIAS_PRECIO_PROVEEDOR_VIEJO;
            return (
              <li key={`${o.proveedorId}-${o.productoId}`} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-gray-900">
                      {o.proveedor}
                      {k === 0 && i.dondeSeCompra.length > 1 && <Pastilla tono="verde">Más barato</Pastilla>}
                      {o.cotizado && <Pastilla tono="azul">Cotizado</Pastilla>}
                      {viejo && <Pastilla tono="ambar">Precio viejo</Pastilla>}
                    </div>
                    <div className="truncate text-[11px] text-gray-500" title={o.producto}>{o.producto} · {o.presentacion.replace(/^Precio cotizado: /, "")} a {solesRedondo(o.precio)} · {fechaCorta(o.fecha)}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums text-gray-900">{soles(o.precioInsumo)}<span className="text-[11px] font-normal text-gray-400"> /{i.unidad}</span></div>
                    {fPres != null && i.presentacion && <div className="text-[11px] text-gray-500">{solesRedondo(precioPorPresentacion(o.precioInsumo, fPres))} {i.presentacion.nombre}</div>}
                    {dif !== 0 && <div className={`text-[11px] font-medium ${dif < 0 ? "text-emerald-700" : "text-red-700"}`}>{dif > 0 ? "+" : ""}{dif}% vs. recetas</div>}
                  </div>
                </div>
                <div className="mt-1 flex gap-3 text-[11px]">
                  {dif !== 0 && !i.archivado && (
                    <button type="button" disabled={ocupado} className="font-medium text-primary"
                      onClick={async () => {
                        if (!window.confirm(`¿Usar ${soles(o.precioInsumo)} por ${i.unidad} (${o.proveedor}) como precio de «${i.nombre}»? Cambia el costo de todas las recetas que lo usan.`)) return;
                        setOcupado(true);
                        const e = await usarPrecio(o.precioInsumo);
                        setOcupado(false);
                        if (e) setError(e);
                      }}>Usar este precio</button>
                  )}
                  <button type="button" disabled={ocupado} className="text-gray-400 hover:text-gray-700"
                    onClick={() => void correr(() => desconectarProductoInsumo({ productoId: o.productoId, origen: i.origen, sku: i.sku }))}>No es este insumo</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {sinPrecio.length > 0 && (
        <div className="mt-2 space-y-1">
          {sinPrecio.map((p) => (
            <div key={p.productoId} className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
              <span>Conectado sin precio: {p.producto} ({p.unidadProducto})</span>
              <button type="button" className="text-gray-400 hover:text-gray-700" onClick={() => void correr(() => desconectarProductoInsumo({ productoId: p.productoId, origen: i.origen, sku: i.sku }))}>Quitar</button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}

      {modo === "conectar" && (opciones
        ? <ElegirProducto i={i} productos={opciones.productos} ocupado={ocupado} onCancelar={() => setModo(null)}
            onElegir={(p, cuanto) => correr(() => conectarProductoInsumo({ productoId: p.id, origen: i.origen, sku: i.sku, cuanto }))} />
        : <p className="mt-2 text-xs text-gray-400">Cargando productos de proveedores…</p>)}
      {modo === "anotar" && (opciones
        ? <AnotarDonde i={i} proveedores={opciones.proveedores} ocupado={ocupado} onCancelar={() => setModo(null)}
            onGuardar={(d) => correr(() => agregarDondeSeCompra({ origen: i.origen, sku: i.sku, ...d }))} />
        : <p className="mt-2 text-xs text-gray-400">Cargando proveedores…</p>)}

      {!modo && (
        <div className="mt-2 space-y-1.5">
          <button type="button" onClick={() => void abrir("anotar")}
            className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-emerald-50">
            <Plus className="h-3.5 w-3.5" /> Agregar proveedor
          </button>
          {/* Las compras de Control de Caja anotan el producto a su manera: aquí se dice cuál es este insumo. */}
          <button type="button" onClick={() => void abrir("conectar")} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-primary">
            <Search className="h-3 w-3" /> ¿Ya se compró? Búscalo en las compras registradas
          </button>
        </div>
      )}
    </section>
  );
}

/** Buscar el producto como lo anotan las compras (con los más parecidos arriba) y, si hace falta, cuánto trae. */
export function ElegirProducto({ i, productos, ocupado, onElegir, onCancelar }: {
  i: Pick<FichaInsumo, "nombre" | "unidad" | "presentacion" | "origen" | "sku">;
  productos: ProductoProveedor[];
  ocupado: boolean;
  onElegir: (p: ProductoProveedor, cuanto: number | null) => Promise<boolean>;
  onCancelar: () => void;
}) {
  const [q, setQ] = useState("");
  const [elegido, setElegido] = useState<ProductoProveedor | null>(null);
  const [cuanto, setCuanto] = useState("");
  const propio = `${i.origen}|${i.sku.toUpperCase()}`;
  const libres = productos.filter((p) => !p.conectadoA.includes(propio));
  const t = normalizarNombre(q);
  const lista = t ? libres.filter((p) => normalizarNombre(p.nombre).includes(t)).slice(0, 12) : masParecidos(i.nombre, libres, 6, 0.3).map((x) => x.item);

  const elegir = (p: ProductoProveedor) => {
    if (factorSeguro(p.unidad, i.unidad) != null) { void onElegir(p, null); return; }
    setElegido(p);
    // Si el producto viene en el mismo envase que la presentación del insumo, se propone lo que trae.
    const f = factorPresentacion(i.unidad, i.presentacion);
    setCuanto(f != null && i.presentacion && normalizarNombre(i.presentacion.nombre) === normalizarNombre(p.unidad) ? String(f) : "");
  };

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-primary/30 bg-emerald-50/40 p-3">
      <p className="text-[11px] text-gray-600">Las compras registradas en Control de Caja anotan cada producto a su manera (ej. «Leche Condensanda 1.2 Kg»). Elige cuál es este insumo: sus precios aparecerán aquí solos, también los de compras futuras.</p>
      {elegido ? (
        <>
          <p className="text-xs text-gray-700"><b>{elegido.nombre}</b> se compra por {elegido.unidad}. ¿Cuánto trae 1 {elegido.unidad}?</p>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            1 {elegido.unidad} =
            <input autoFocus inputMode="decimal" value={cuanto} onChange={(e) => setCuanto(e.target.value)} placeholder="1.2" aria-label={`Cuánto trae 1 ${elegido.unidad}`}
              className="w-20 rounded-lg border border-gray-300 bg-white px-2 py-1 text-right text-sm" />
            {i.unidad}
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={ocupado || !(Number(cuanto.replace(",", ".")) > 0)}
              onClick={() => void onElegir(elegido, Number(cuanto.replace(",", ".")))}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Conectar</button>
            <button type="button" onClick={() => setElegido(null)} className="text-xs text-gray-500">Atrás</button>
          </div>
        </>
      ) : (
        <>
          <label className="relative block">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar como lo anotan las compras"
              className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-2 text-sm" />
          </label>
          {!t && lista.length > 0 && <p className="text-[11px] text-gray-500">Los más parecidos:</p>}
          {lista.length === 0 ? (
            <p className="text-[11px] text-gray-500">{t ? "No hay productos con ese nombre." : "Ninguno se parece. Busca por otra palabra o usa «Agregar proveedor»."}</p>
          ) : (
            <ul className="max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-lg bg-white ring-1 ring-gray-200">
              {lista.map((p) => (
                <li key={p.id}>
                  <button type="button" disabled={ocupado} onClick={() => elegir(p)} className="w-full px-2.5 py-1.5 text-left hover:bg-emerald-50">
                    <span className="block text-sm text-gray-900">{p.nombre} <span className="text-[11px] text-gray-400">/ {p.unidad}</span></span>
                    {p.ultimo && <span className="block text-[11px] text-gray-500">{p.ultimo.proveedor} · {p.ultimo.presentacion} · {solesRedondo(p.ultimo.precio)} · {fechaCorta(p.ultimo.fecha)}</span>}
                    {p.conectadoA.length > 0 && <span className="block text-[11px] text-amber-700">Ya está conectado a otro insumo: se cambiará a este.</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={onCancelar} className="text-xs text-gray-500">Cancelar</button>
        </>
      )}
    </div>
  );
}

/** Anotar dónde se compra y a cuánto (un precio visto en la tienda, no una compra). */
function AnotarDonde({ i, proveedores, ocupado, onGuardar, onCancelar }: {
  i: FichaInsumo;
  proveedores: { id: number; nombre: string }[];
  ocupado: boolean;
  onGuardar: (d: { proveedorId: number | null; proveedorNuevo: string | null; envase: string; cuanto: number; precio: number }) => Promise<boolean>;
  onCancelar: () => void;
}) {
  const f = factorPresentacion(i.unidad, i.presentacion);
  // Proveedor: uno de la lista (id) o uno nuevo (nombre).
  const [proveedor, setProveedor] = useState<{ id: number | null; nombre: string } | null>(null);
  const [envase, setEnvase] = useState(i.presentacion ? textoPresentacion(i.presentacion) : `1 ${i.unidad}`);
  const [cuanto, setCuanto] = useState(f != null ? String(f) : "1");
  const [precio, setPrecio] = useState("");
  const n = (s: string) => Number(s.replace(",", "."));
  const listo = !!proveedor && n(cuanto) > 0 && n(precio) > 0;

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-primary/30 bg-emerald-50/40 p-3">
      <BuscarProveedor proveedores={proveedores} valor={proveedor} onCambio={setProveedor} />
      <div className="grid grid-cols-[1fr_90px_90px] gap-2">
        <label className="text-[11px] text-gray-500">Cómo viene
          <input value={envase} onChange={(e) => setEnvase(e.target.value)} className="mt-0.5 block w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm" />
        </label>
        <label className="text-[11px] text-gray-500">Trae ({i.unidad})
          <input inputMode="decimal" value={cuanto} onChange={(e) => setCuanto(e.target.value)} className="mt-0.5 block w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-right text-sm" />
        </label>
        <label className="text-[11px] text-gray-500">Precio (S/) cada uno
          <input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="5.90" className="mt-0.5 block w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-right text-sm" />
        </label>
      </div>
      {n(cuanto) > 0 && n(precio) > 0 && <p className="text-[11px] text-gray-600">= {soles(Math.round((n(precio) / n(cuanto)) * 10000) / 10000)} por {i.unidad}</p>}
      <p className="text-[11px] text-gray-400">Queda como «cotizado»: es un precio visto, no una compra. Las compras reales llegan solas desde Control de Caja.</p>
      <div className="flex gap-2">
        <button type="button" disabled={ocupado || !listo}
          onClick={() => void onGuardar({
            proveedorId: proveedor?.id ?? null, proveedorNuevo: proveedor && proveedor.id == null ? proveedor.nombre : null,
            envase, cuanto: n(cuanto), precio: n(precio),
          })}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{ocupado ? "Guardando…" : "Guardar"}</button>
        <button type="button" onClick={onCancelar} className="text-xs text-gray-500">Cancelar</button>
      </div>
    </div>
  );
}

/** Buscar un proveedor por nombre; si no está, crearlo con lo escrito. */
function BuscarProveedor({ proveedores, valor, onCambio }: {
  proveedores: { id: number; nombre: string }[];
  valor: { id: number | null; nombre: string } | null;
  onCambio: (v: { id: number | null; nombre: string } | null) => void;
}) {
  const [q, setQ] = useState("");
  if (valor) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-[11px] text-gray-500">Proveedor</span>
        <span className="rounded-full bg-white px-2.5 py-1 font-medium text-gray-900 ring-1 ring-gray-200">{valor.nombre}</span>
        {valor.id == null && <Pastilla tono="marca">Nuevo</Pastilla>}
        <button type="button" onClick={() => { onCambio(null); setQ(""); }} className="text-xs text-primary">Cambiar</button>
      </div>
    );
  }
  const t = normalizarNombre(q);
  const lista = t ? proveedores.filter((p) => normalizarNombre(p.nombre).includes(t)).slice(0, 6) : [];
  const exacto = proveedores.find((p) => normalizarNombre(p.nombre) === t);
  return (
    <div>
      <label className="relative block text-[11px] text-gray-500">Proveedor
        <Search className="pointer-events-none absolute bottom-2 left-2.5 h-3.5 w-3.5 text-gray-400" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escribe: Lácteos Cajamarca, Metro…"
          className="mt-0.5 block w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-2 text-sm" />
      </label>
      {t.length >= 2 && (
        <ul className="mt-1 divide-y divide-gray-100 overflow-hidden rounded-lg bg-white ring-1 ring-gray-200">
          {lista.map((p) => (
            <li key={p.id}><button type="button" onClick={() => onCambio({ id: p.id, nombre: p.nombre })} className="w-full px-2.5 py-1.5 text-left text-sm hover:bg-emerald-50">{p.nombre}</button></li>
          ))}
          {!exacto && (
            <li><button type="button" onClick={() => onCambio({ id: null, nombre: q.trim() })} className="flex w-full items-center gap-1 px-2.5 py-1.5 text-left text-sm font-medium text-primary hover:bg-emerald-50">
              <Plus className="h-3.5 w-3.5" /> Crear «{q.trim()}»
            </button></li>
          )}
        </ul>
      )}
    </div>
  );
}
