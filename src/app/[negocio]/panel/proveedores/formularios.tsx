"use client";

/** Formularios de Proveedores: nuevo/editar contacto y registrar un precio. */

import { useEffect, useId, useState, type ReactNode } from "react";
import { Check, Link2, Loader2, Search, Trash2, X } from "lucide-react";
import {
  archivarProveedor, conectarInsumo, guardarProveedor, registrarPrecio, type InsumoReceta, type Proveedor, type ProductoComparable,
} from "@/app/actions/proveedores";
import type { EnlaceInsumo } from "@/lib/proveedores-sql";
import { useToast } from "@/components/toast-provider";
import { SEDES, factorInsumo, plural, precioUnitario, unidadDesdeInsumo, type OrigenInsumo } from "@/lib/proveedores";

const RUBROS_SUGERIDOS = [
  "Packaging", "Descartables", "Harinas e insumos", "Lácteos", "Café", "Frutas y verduras", "Bebidas", "Limpieza", "Gas",
  "Electricista", "Gasfitero", "Refrigeración", "Técnico de máquinas de café", "Carpintería", "Fumigación",
];
const UNIDADES = ["unidad", "hoja", "kg", "g", "litro", "ml", "paquete", "rollo", "caja"];

const campo = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-light focus:outline-none focus:ring-2 focus:ring-primary-light/20";

export function Modal({ titulo, onCerrar, children, pie }: { titulo: string; onCerrar: () => void; children: ReactNode; pie: ReactNode }) {
  const id = useId();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = prev; };
  }, [onCerrar]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-labelledby={id} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <h2 id={id} className="text-base font-bold text-gray-900">{titulo}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-5 w-5" /></button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">{children}</div>
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">{pie}</footer>
      </div>
    </div>
  );
}

function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-700">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-[11px] text-gray-500">{ayuda}</span>}
    </label>
  );
}

const numero = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

/* ─────────── Contacto ─────────── */

export function ProveedorModal({ inicial, sedeId, rubros, onCerrar, onGuardado }: {
  inicial: Proveedor | null; sedeId: number; rubros: string[]; onCerrar: () => void; onGuardado: () => void;
}) {
  const { showToast } = useToast();
  const [tipo, setTipo] = useState<"proveedor" | "tecnico">(inicial?.tipo ?? "proveedor");
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [rubro, setRubro] = useState(inicial?.rubro ?? "");
  const [contacto, setContacto] = useState(inicial?.contacto ?? "");
  const [telefono, setTelefono] = useState(inicial?.telefono ?? "");
  const [telefono2, setTelefono2] = useState(inicial?.telefono2 ?? "");
  const [email, setEmail] = useState(inicial?.email ?? "");
  const [direccion, setDireccion] = useState(inicial?.direccion ?? "");
  const [ciudad, setCiudad] = useState(inicial?.ciudad ?? "Cajamarca");
  const [notas, setNotas] = useState(inicial?.notas ?? "");
  const [sedes, setSedes] = useState<number[]>(inicial?.sedes ?? (tipo === "tecnico" ? [1, 2, 3] : [sedeId]));
  const [envio, setEnvio] = useState(inicial?.costoEnvio != null ? String(inicial.costoEnvio) : "");
  const [minimo, setMinimo] = useState(inicial?.pedidoMinimo != null ? String(inicial.pedidoMinimo) : "");
  const [ocupado, setOcupado] = useState(false);
  const listaId = useId();

  async function guardar() {
    setOcupado(true);
    const r = await guardarProveedor({
      id: inicial?.id, tipo, nombre, rubro, contacto, telefono, telefono2, email, direccion, ciudad, notas, sedes,
      costoEnvio: tipo === "proveedor" ? numero(envio) : null, pedidoMinimo: tipo === "proveedor" ? numero(minimo) : null,
    });
    setOcupado(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(inicial ? "Contacto actualizado" : "Contacto agregado", "success");
    onGuardado();
  }

  async function quitar() {
    if (!inicial || !window.confirm(`¿Quitar a «${inicial.nombre}» de la lista? Sus precios quedan guardados en el historial.`)) return;
    setOcupado(true);
    const r = await archivarProveedor(inicial.id);
    setOcupado(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast("Contacto quitado de la lista", "success");
    onGuardado();
  }

  return (
    <Modal titulo={inicial ? "Editar contacto" : "Nuevo contacto"} onCerrar={onCerrar} pie={<>
      {inicial && (
        <button type="button" onClick={quitar} disabled={ocupado} className="mr-auto inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-red-600 hover:bg-red-50">
          <Trash2 className="h-3.5 w-3.5" aria-hidden />Quitar
        </button>
      )}
      <button type="button" onClick={onCerrar} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
      <button type="button" onClick={guardar} disabled={ocupado} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-light disabled:opacity-60">
        {ocupado && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Guardar
      </button>
    </>}>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de contacto">
        {([["proveedor", "Proveedor", "Le compramos productos"], ["tecnico", "Técnico", "Electricista, gasfitero, etc."]] as const).map(([v, t, d]) => (
          <button key={v} type="button" role="radio" aria-checked={tipo === v} onClick={() => { setTipo(v); if (!inicial) setSedes(v === "tecnico" ? [1, 2, 3] : [sedeId]); }}
            className={`rounded-xl border-2 px-3 py-2 text-left transition ${tipo === v ? "border-primary-light bg-primary-50" : "border-gray-200 hover:border-gray-300"}`}>
            <span className="block text-sm font-semibold text-gray-900">{t}</span>
            <span className="block text-[11px] text-gray-500">{d}</span>
          </button>
        ))}
      </div>
      <Campo etiqueta="Nombre *"><input className={campo} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={tipo === "tecnico" ? "ej. Juan Pérez · electricista" : "ej. Distribuidora Andina"} /></Campo>
      <Campo etiqueta="Rubro *">
        <input className={campo} list={listaId} value={rubro} onChange={(e) => setRubro(e.target.value)} placeholder="ej. Packaging" />
        <datalist id={listaId}>{[...new Set([...rubros, ...RUBROS_SUGERIDOS])].map((r) => <option key={r} value={r} />)}</datalist>
      </Campo>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Persona de contacto"><input className={campo} value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="ej. Rosa" /></Campo>
        <Campo etiqueta="Ciudad"><input className={campo} value={ciudad} onChange={(e) => setCiudad(e.target.value)} /></Campo>
        <Campo etiqueta="Teléfono / WhatsApp *"><input className={campo} type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="987 654 321" /></Campo>
        <Campo etiqueta="Otro teléfono"><input className={campo} type="tel" inputMode="tel" value={telefono2} onChange={(e) => setTelefono2(e.target.value)} /></Campo>
      </div>
      <Campo etiqueta="Correo"><input className={campo} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
      <Campo etiqueta="Dirección"><input className={campo} value={direccion} onChange={(e) => setDireccion(e.target.value)} /></Campo>
      {tipo === "proveedor" && (
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Envío por pedido (S/)" ayuda="Vacío si no cobra envío"><input className={campo} type="number" min="0" step="0.01" inputMode="decimal" value={envio} onChange={(e) => setEnvio(e.target.value)} placeholder="0.00" /></Campo>
          <Campo etiqueta="Pedido mínimo (S/)" ayuda="Vacío si no pide mínimo"><input className={campo} type="number" min="0" step="0.01" inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} placeholder="0.00" /></Campo>
        </div>
      )}
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-gray-700">Sedes que lo usan</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((s) => {
            const on = sedes.includes(s);
            return (
              <button key={s} type="button" aria-pressed={on} onClick={() => setSedes(on ? sedes.filter((x) => x !== s) : [...sedes, s].sort())}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-primary bg-primary text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                {SEDES[s]}
              </button>
            );
          })}
        </div>
      </fieldset>
      <Campo etiqueta="Notas" ayuda="Días de entrega, forma de pago, horario, lo que sirva al que llame.">
        <textarea className={`${campo} min-h-20`} value={notas} onChange={(e) => setNotas(e.target.value)} />
      </Campo>
    </Modal>
  );
}

/* ─────────── Precio ─────────── */

export type PrecioInicial = { proveedorId?: number; productoId?: number };

export function PrecioModal({ inicial, proveedores, productos, insumos, enlaces, sedeId, hoy, onCerrar, onGuardado }: {
  inicial: PrecioInicial; proveedores: Proveedor[]; productos: ProductoComparable[]; insumos: InsumoReceta[]; enlaces: EnlaceInsumo[]; sedeId: number;
  hoy: string; onCerrar: () => void; onGuardado: () => void;
}) {
  const { showToast } = useToast();
  const [proveedorId, setProveedorId] = useState(inicial.proveedorId ? String(inicial.proveedorId) : "");
  const [productoId, setProductoId] = useState(inicial.productoId ? String(inicial.productoId) : "");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaUnidad, setNuevaUnidad] = useState("unidad");
  const [presentacion, setPresentacion] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [precio, setPrecio] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const unidadesId = useId();

  const prod = productos.find((p) => String(p.id) === productoId);
  const insumoElegido = productoId.startsWith("i:") ? insumos.find((i) => `i:${i.origen}|${i.sku}` === productoId) ?? null : null;
  const unidad = productoId === "nuevo" ? nuevaUnidad || "unidad" : insumoElegido ? unidadDesdeInsumo(insumoElegido.unidad) : prod?.unidad ?? "unidad";
  const c = numero(cantidad), pr = numero(precio);
  const unit = c && pr !== null ? precioUnitario({ cantidad: c, precio: pr }) : null;

  async function guardar() {
    if (!proveedorId) { showToast("Elige el proveedor.", "error"); return; }
    setOcupado(true);
    const r = await registrarPrecio({
      proveedorId: Number(proveedorId),
      productoId: prod ? prod.id : null,
      productoNuevo: productoId === "nuevo" ? { nombre: nuevoNombre, unidad: nuevaUnidad } : null,
      desdeInsumo: insumoElegido ? { origen: insumoElegido.origen, sku: insumoElegido.sku } : null,
      presentacion, cantidad: c ?? 0, precio: pr ?? -1, fecha, nota,
    });
    setOcupado(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast("Precio registrado", "success");
    onGuardado();
  }

  return (
    <Modal titulo="Registrar precio" onCerrar={onCerrar} pie={<>
      <button type="button" onClick={onCerrar} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
      <button type="button" onClick={guardar} disabled={ocupado} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-light disabled:opacity-60">
        {ocupado && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Guardar precio
      </button>
    </>}>
      {proveedores.length === 0 ? (
        <p className="text-sm text-gray-600">Primero agrega un proveedor en el Directorio.</p>
      ) : (
        <>
          <Campo etiqueta="Proveedor *">
            <select className={campo} value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
              <option value="">Elige…</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.rubro}</option>)}
            </select>
          </Campo>
          <div>
            <span className="mb-1 block text-xs font-medium text-gray-700">Producto *</span>
            <SelectorProducto valor={productoId} onChange={setProductoId} productos={productos} insumos={insumos} enlaces={enlaces}
              origenPrimero={sedeId === 1 ? "Atelier" : "Cafetería"} />
            <span className="mt-1 block text-[11px] text-gray-500">El mismo producto en todos los proveedores. Si es un insumo de Recetas, elígelo de esa lista para que quede conectado.</span>
          </div>
          {productoId === "nuevo" && (
            <div className="grid grid-cols-3 gap-3 rounded-xl bg-gray-50 p-3">
              <div className="col-span-2"><Campo etiqueta="Nombre del producto"><input className={campo} value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="ej. Papel manteca" /></Campo></div>
              <Campo etiqueta="Se compara por">
                <input className={campo} list={unidadesId} value={nuevaUnidad} onChange={(e) => setNuevaUnidad(e.target.value)} />
                <datalist id={unidadesId}>{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
              </Campo>
            </div>
          )}
          <Campo etiqueta="Presentación *" ayuda="Como lo vende este proveedor.">
            <input className={campo} value={presentacion} onChange={(e) => setPresentacion(e.target.value)} placeholder="ej. Paquete de 500 hojas" />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta={`¿Cuánto trae? (en ${plural(unidad)}) *`}>
              <input className={campo} type="number" min="0" step="any" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="500" />
            </Campo>
            <Campo etiqueta="Precio de la presentación (S/) *">
              <input className={campo} type="number" min="0" step="0.01" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="50.00" />
            </Campo>
          </div>
          {unit !== null && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Sale a <b>S/ {unit.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</b> por {unidad}.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Fecha del precio"><input className={campo} type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} /></Campo>
            <Campo etiqueta="Nota"><input className={campo} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="ej. precio con IGV" /></Campo>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ─────────── Elegir producto (productos de Proveedores + insumos de Recetas) ─────────── */

const sinTildes = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const MAX_OPCIONES = 8;

function SelectorProducto({ valor, onChange, productos, insumos, enlaces, origenPrimero }: {
  valor: string; onChange: (v: string) => void; productos: ProductoComparable[]; insumos: InsumoReceta[]; enlaces: EnlaceInsumo[]; origenPrimero: OrigenInsumo;
}) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const conectados = new Set(enlaces.map((e) => `${e.origen}|${e.sku}`));
  const t = sinTildes(q.trim());
  const prods = productos.filter((p) => !t || sinTildes(p.nombre).includes(t)).slice(0, MAX_OPCIONES);
  const ins = t.length < 2 ? [] : insumos
    .filter((i) => !conectados.has(`${i.origen}|${i.sku}`) && sinTildes(`${i.nombre} ${i.sku}`).includes(t))
    .sort((a, b) => (a.origen === origenPrimero ? 0 : 1) - (b.origen === origenPrimero ? 0 : 1) || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, MAX_OPCIONES);
  const elegido = valor === "nuevo" ? "Otro producto (nuevo)"
    : valor.startsWith("i:") ? (() => { const i = insumos.find((x) => `i:${x.origen}|${x.sku}` === valor); return i ? `${i.nombre} · insumo ${i.origen === "Atelier" ? "de Atelier" : "de cafeterías"}` : ""; })()
      : productos.find((p) => String(p.id) === valor)?.nombre ?? "";

  if (elegido && !abierto) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-primary-light/40 bg-primary-50/50 px-3 py-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-gray-900">
          {valor.startsWith("i:") ? <Link2 className="h-4 w-4 shrink-0 text-primary-light" aria-hidden /> : <Check className="h-4 w-4 shrink-0 text-primary-light" aria-hidden />}
          <span className="truncate">{elegido}</span>
        </span>
        <button type="button" onClick={() => { setAbierto(true); setQ(""); }} className="shrink-0 text-xs font-medium text-primary-light hover:text-primary">Cambiar</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden />
      <input autoFocus={abierto} className={`${campo} pl-9`} value={q} onChange={(e) => { setQ(e.target.value); setAbierto(true); }} onFocus={() => setAbierto(true)}
        placeholder="Busca: papel manteca, harina, leche…" aria-label="Buscar producto" />
      {abierto && (
        <div className="mt-1 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
          {prods.length > 0 && <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Productos de proveedores</p>}
          {prods.map((p) => (
            <Opcion key={p.id} onClick={() => { onChange(String(p.id)); setAbierto(false); }} titulo={p.nombre} detalle={`por ${p.unidad}`} />
          ))}
          {ins.length > 0 && <p className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Insumos de Recetas y costos</p>}
          {ins.map((i) => (
            <Opcion key={`${i.origen}|${i.sku}`} onClick={() => { onChange(`i:${i.origen}|${i.sku}`); setAbierto(false); }} titulo={i.nombre}
              detalle={`${i.origen === "Atelier" ? "Atelier" : "Cafeterías"} · S/ ${i.precio.toLocaleString("es-PE", { maximumFractionDigits: 4 })} por ${i.unidad}`} conectar />
          ))}
          {t.length === 1 && <p className="px-2 py-1.5 text-[11px] text-gray-400">Escribe una letra más para buscar también en los insumos de Recetas.</p>}
          <Opcion onClick={() => { onChange("nuevo"); setAbierto(false); }} titulo="+ Otro producto (nuevo)" detalle="No está en ninguna lista" />
        </div>
      )}
    </div>
  );
}

function Opcion({ titulo, detalle, conectar = false, onClick }: { titulo: string; detalle: string; conectar?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50">
      <span className="min-w-0">
        <span className="block truncate text-sm text-gray-900">{titulo}</span>
        <span className="block truncate text-[11px] text-gray-500">{detalle}</span>
      </span>
      {conectar && <Link2 className="h-3.5 w-3.5 shrink-0 text-primary-light" aria-label="Se conecta con Recetas" />}
    </button>
  );
}

/* ─────────── Conectar un producto con un insumo ─────────── */

export function ConectarModal({ producto, insumos, enlaces, sedeId, onCerrar, onGuardado }: {
  producto: ProductoComparable; insumos: InsumoReceta[]; enlaces: EnlaceInsumo[]; sedeId: number; onCerrar: () => void; onGuardado: () => void;
}) {
  const { showToast } = useToast();
  const [origen, setOrigen] = useState<OrigenInsumo>(sedeId === 1 ? "Atelier" : "Cafetería");
  const [q, setQ] = useState(producto.nombre.split(/\s+/)[0] ?? "");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const yaConectado = enlaces.find((e) => e.productoId === producto.id && e.origen === origen);
  const t = sinTildes(q.trim());
  const lista = insumos
    .filter((i) => i.origen === origen && factorInsumo(producto.unidad, i.unidad) !== null && (!t || sinTildes(`${i.nombre} ${i.sku}`).includes(t)))
    .slice(0, 40);

  async function conectar(i: InsumoReceta) {
    setOcupado(i.sku);
    const r = await conectarInsumo({ productoId: producto.id, origen: i.origen, sku: i.sku });
    setOcupado(null);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(`${producto.nombre} quedó conectado con «${i.nombre}»`, "success");
    onGuardado();
  }

  return (
    <Modal titulo={`Conectar «${producto.nombre}» con Recetas`} onCerrar={onCerrar}
      pie={<button type="button" onClick={onCerrar} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Cerrar</button>}>
      <p className="text-xs text-gray-500">Elige el insumo que es este producto. Solo salen los que se miden igual (por {producto.unidad}). Puede estar en las dos listas.</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Lista de insumos">
        {(["Cafetería", "Atelier"] as const).map((o) => (
          <button key={o} type="button" role="radio" aria-checked={origen === o} onClick={() => setOrigen(o)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${origen === o ? "border-primary bg-primary text-white" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
            {o === "Atelier" ? "Insumos de Atelier" : "Insumos de cafeterías"}
          </button>
        ))}
      </div>
      {yaConectado && (
        <p className="rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary">
          Ya está conectado con «{insumos.find((i) => i.origen === yaConectado.origen && i.sku === yaConectado.sku)?.nombre ?? yaConectado.sku}». Elegir otro lo reemplaza.
        </p>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden />
        <input className={`${campo} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar insumo" aria-label="Buscar insumo" />
      </div>
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
        {lista.length === 0 && <li className="px-3 py-4 text-center text-xs text-gray-500">No hay insumos con ese nombre que se midan por {producto.unidad}.</li>}
        {lista.map((i) => (
          <li key={i.sku} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate text-sm text-gray-900">{i.nombre}</span>
              <span className="block text-[11px] text-gray-500">{i.sku} · S/ {i.precio.toLocaleString("es-PE", { maximumFractionDigits: 4 })} por {i.unidad}</span>
            </span>
            <button type="button" disabled={ocupado !== null} onClick={() => void conectar(i)}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-light disabled:opacity-60">
              {ocupado === i.sku ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}Conectar
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
