"use client";

/**
 * Proveedores y precios (Jahnn, 20-nov-2026). Tres pestañas:
 *   · Directorio: proveedores y técnicos de la sede, con botón para llamar o escribir por WhatsApp.
 *   · Comparar precios: cada producto con sus proveedores, por la MISMA unidad, y «dónde comprar cada cosa».
 *   · Armar pedido: eliges qué y cuánto comprar; el sistema reparte entre proveedores contando envío y mínimos.
 * Separado de la carga para poder verlo con datos de prueba.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowLeftRight, BadgeCheck, BookOpen, Link2, Loader2, Unlink, Building2, ChevronDown, History, Mail, MapPin, MessageCircle, Pencil, Phone, Plus,
  Search, ShoppingBasket, Sparkles, Store, Tag, Truck, Wrench, X,
} from "lucide-react";
import { desconectarInsumo, sincronizarConControlCaja, usarPrecioEnRecetas, type DatosProveedores, type Proveedor, type ProductoComparable, type PrecioRegistrado } from "@/app/actions/proveedores";
import { useToast } from "@/components/toast-provider";
import {
  SEDES, plural, armarPedido, compararProducto, mejorParaInsumo, dondeComprar, enlaceTelefono, enlaceWhatsApp, vigentes, type ItemPedido, type ProveedorCompra,
} from "@/lib/proveedores";
import { Segmentado } from "@/components/productos/ui";
import { ConectarModal, ProveedorModal, PrecioModal, type PrecioInicial } from "./formularios";

const soles = (n: number, dec = 2) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
/** Por unidad: hasta 4 decimales (una hoja cuesta centavos), sin ceros de más. */
const solesUnidad = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })}`;
const fechaCorta = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).replace(".", "");
const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const PALETA = ["bg-emerald-100 text-emerald-800", "bg-sky-100 text-sky-800", "bg-amber-100 text-amber-800", "bg-violet-100 text-violet-800", "bg-rose-100 text-rose-800", "bg-teal-100 text-teal-800"];
function colorDe(texto: string) {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}

type Pestana = "directorio" | "comparar" | "pedido";

export function ProveedoresVista({ datos, sedeLabel, onCambio }: { datos: DatosProveedores; sedeLabel: string; onCambio: () => void }) {
  const [pestana, setPestana] = useState<Pestana>("directorio");
  const [editando, setEditando] = useState<Proveedor | "nuevo" | null>(null);
  const [precio, setPrecio] = useState<PrecioInicial | null>(null);
  const [todasLasSedes, setTodasLasSedes] = useState(false);
  const [sync, setSync] = useState<{ estado: "trayendo" | "ok" | "error"; mensaje?: string }>({ estado: "ok" });
  const { showToast } = useToast();

  /** Trae de Control de Caja los proveedores y los precios de las compras reales. */
  async function traer(siHaceFalta: boolean) {
    setSync({ estado: "trayendo" });
    const r = await sincronizarConControlCaja({ siHaceFalta });
    if (!r.ok) { setSync({ estado: "error", mensaje: r.error }); return; }
    setSync({ estado: "ok" });
    if (r.nuevosProveedores || r.nuevosPrecios) {
      showToast(`De Control de Caja: ${r.nuevosProveedores} proveedor${r.nuevosProveedores === 1 ? "" : "es"} y ${r.nuevosPrecios} precio${r.nuevosPrecios === 1 ? "" : "s"} nuevos`, "success");
      onCambio();
    } else if (!siHaceFalta) {
      showToast("Ya estaba al día con Control de Caja", "success");
      onCambio();
    }
  }
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- traer de Control de Caja solo al abrir */
    void traer(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [conectando, setConectando] = useState<ProductoComparable | null>(null);

  const visibles = useMemo(
    () => datos.proveedores.filter((p) => todasLasSedes || p.sedes.includes(datos.sedeId)),
    [datos.proveedores, datos.sedeId, todasLasSedes],
  );
  const compra: ProveedorCompra[] = useMemo(
    () => visibles.filter((p) => p.tipo === "proveedor").map((p) => ({ id: p.id, nombre: p.nombre, costoEnvio: p.costoEnvio, pedidoMinimo: p.pedidoMinimo })),
    [visibles],
  );
  const ofertas = useMemo(() => {
    const ids = new Set(compra.map((p) => p.id));
    return vigentes(datos.precios).filter((o) => ids.has(o.proveedorId));
  }, [datos.precios, compra]);
  const donde = useMemo(() => dondeComprar(ofertas, compra, datos.hoy), [ofertas, compra, datos.hoy]);
  const productoPorId = useMemo(() => new Map(datos.productos.map((p) => [p.id, p])), [datos.productos]);

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">Proveedores · {sedeLabel}</h1>
          <p className="mt-0.5 text-sm text-gray-500">Contactos para pedir o pedir ayuda, y dónde conviene comprar cada cosa.</p>
        </div>
        {datos.puedeEditar && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setPrecio({})}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
              <Tag className="h-3.5 w-3.5" aria-hidden />Registrar precio
            </button>
            <button type="button" onClick={() => setEditando("nuevo")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-light">
              <Plus className="h-3.5 w-3.5" aria-hidden />Nuevo contacto
            </button>
          </div>
        )}
      </div>

      <FranjaCaja sync={sync} ultima={datos.sincronizado} onActualizar={() => void traer(false)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmentado valor={pestana} onChange={setPestana} opciones={[
          { valor: "directorio", etiqueta: "Directorio" },
          { valor: "comparar", etiqueta: "Comparar" },
          { valor: "pedido", etiqueta: "Armar pedido" },
        ]} />
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={todasLasSedes} onChange={(e) => setTodasLasSedes(e.target.checked)} className="h-4 w-4 accent-primary" />
          Ver también los de otras sedes
        </label>
      </div>

      {pestana === "directorio" && (
        <Directorio proveedores={visibles} donde={donde} productoPorId={productoPorId} sedeId={datos.sedeId}
          onEditar={datos.puedeEditar ? setEditando : undefined} onNuevo={() => setEditando("nuevo")} />
      )}
      {pestana === "comparar" && (
        <Comparar datos={datos} compra={compra} ofertas={ofertas} donde={donde} productoPorId={productoPorId}
          onPrecio={datos.puedeEditar ? setPrecio : undefined} onConectar={setConectando} onCambio={onCambio} />
      )}
      {pestana === "pedido" && <ArmarPedido productos={datos.productos} ofertas={ofertas} compra={compra} />}

      {editando && (
        <ProveedorModal inicial={editando === "nuevo" ? null : editando} sedeId={datos.sedeId}
          rubros={[...new Set(datos.proveedores.map((p) => p.rubro))]}
          onCerrar={() => setEditando(null)} onGuardado={() => { setEditando(null); onCambio(); }} />
      )}
      {precio && (
        <PrecioModal inicial={precio} proveedores={visibles.filter((p) => p.tipo === "proveedor")} productos={datos.productos} hoy={datos.hoy}
          insumos={datos.insumos} enlaces={datos.enlaces} sedeId={datos.sedeId}
          onCerrar={() => setPrecio(null)} onGuardado={() => { setPrecio(null); onCambio(); }} />
      )}
      {conectando && (
        <ConectarModal producto={conectando} insumos={datos.insumos} enlaces={datos.enlaces} sedeId={datos.sedeId}
          onCerrar={() => setConectando(null)} onGuardado={() => { setConectando(null); onCambio(); }} />
      )}
    </div>
  );
}

/* ─────────── Directorio ─────────── */

function Directorio({ proveedores, donde, productoPorId, sedeId, onEditar, onNuevo }: {
  proveedores: Proveedor[]; donde: Map<number, number[]>; productoPorId: Map<number, ProductoComparable>; sedeId: number;
  onEditar?: (p: Proveedor) => void; onNuevo: () => void;
}) {
  const [q, setQ] = useState("");
  const [rubro, setRubro] = useState<string | null>(null);
  const filtrados = proveedores.filter((p) =>
    (!rubro || p.rubro === rubro) && (!q || normal(`${p.nombre} ${p.rubro} ${p.contacto ?? ""} ${p.ciudad ?? ""} ${p.notas ?? ""}`).includes(normal(q))));
  const tecnicos = filtrados.filter((p) => p.tipo === "tecnico");
  const provs = filtrados.filter((p) => p.tipo === "proveedor");
  const rubros = [...new Set(proveedores.map((p) => p.rubro))].sort((a, b) => a.localeCompare(b));

  if (proveedores.length === 0) {
    return (
      <Vacio icono={Store} titulo="Aún no hay contactos" texto="Agrega a tus proveedores y a los técnicos de confianza (electricista, gasfitero) para tenerlos a la mano.">
        <button type="button" onClick={onNuevo} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-light">Agregar el primero</button>
      </Vacio>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Buscador valor={q} onChange={setQ} placeholder="Buscar por nombre, rubro o ciudad" />
        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          <Chip activo={rubro === null} onClick={() => setRubro(null)}>Todos ({proveedores.length})</Chip>
          {rubros.map((r) => <Chip key={r} activo={rubro === r} onClick={() => setRubro(rubro === r ? null : r)}>{r}</Chip>)}
        </div>
      </div>

      {tecnicos.length > 0 && (
        <section aria-labelledby="tit-tecnicos" className="space-y-2.5">
          <h2 id="tit-tecnicos" className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-100 text-amber-700"><Wrench className="h-4 w-4" aria-hidden /></span>
            Técnicos para emergencias <span className="font-normal text-gray-500">· {tecnicos.length}</span>
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {tecnicos.map((p) => <TarjetaContacto key={p.id} p={p} sedeId={sedeId} onEditar={onEditar} />)}
          </div>
        </section>
      )}

      {provs.length > 0 && (
        <section aria-labelledby="tit-provs" className="space-y-2.5">
          <h2 id="tit-provs" className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-50 text-primary-light"><Store className="h-4 w-4" aria-hidden /></span>
            Proveedores <span className="font-normal text-gray-500">· {provs.length}</span>
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {provs.map((p) => (
              <TarjetaContacto key={p.id} p={p} sedeId={sedeId} onEditar={onEditar}
                mejores={(donde.get(p.id) ?? []).map((id) => productoPorId.get(id)?.nombre).filter((x): x is string => !!x)} />
            ))}
          </div>
        </section>
      )}

      {filtrados.length === 0 && <p className="py-8 text-center text-sm text-gray-500">Nada coincide con la búsqueda.</p>}
    </div>
  );
}

function TarjetaContacto({ p, sedeId, mejores = [], onEditar }: { p: Proveedor; sedeId: number; mejores?: string[]; onEditar?: (p: Proveedor) => void }) {
  const wa = enlaceWhatsApp(p.telefono);
  const tel = enlaceTelefono(p.telefono);
  const tel2 = enlaceTelefono(p.telefono2);
  const otraSede = !p.sedes.includes(sedeId);
  return (
    <article className="flex flex-col rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-bold ${colorDe(p.rubro)}`} aria-hidden>{iniciales(p.nombre)}</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug text-gray-900 break-words">{p.nombre}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
            <span className="font-medium text-gray-700">{p.rubro}</span>
            {p.ciudad && <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" aria-hidden />{p.ciudad}</span>}
            {p.deCaja && <span className="rounded bg-gray-100 px-1.5 py-px text-[10px] font-medium text-gray-500">Control de Caja</span>}
          </p>
        </div>
        {onEditar && (
          <button type="button" onClick={() => onEditar(p)} aria-label={`Editar ${p.nombre}`}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary"><Pencil className="h-4 w-4" /></button>
        )}
      </div>

      <dl className="mt-3 space-y-1 text-sm text-gray-700">
        {p.contacto && <div className="flex gap-2"><dt className="sr-only">Contacto</dt><dd>{p.contacto}</dd></div>}
        {p.telefono && <div className="flex items-center gap-1.5 tabular-nums"><Phone className="h-3.5 w-3.5 text-gray-400" aria-hidden /><dd>{p.telefono}{p.telefono2 ? ` · ${p.telefono2}` : ""}</dd></div>}
        {p.email && <div className="flex items-center gap-1.5 min-w-0"><Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden /><dd className="truncate">{p.email}</dd></div>}
        {p.direccion && <div className="flex items-start gap-1.5"><Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden /><dd>{p.direccion}</dd></div>}
      </dl>

      {(p.costoEnvio || p.pedidoMinimo) && (
        <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
          <Truck className="h-3.5 w-3.5 text-gray-400" aria-hidden />
          {p.costoEnvio ? <>Envío <b>{soles(p.costoEnvio)}</b></> : "Sin costo de envío"}
          {p.pedidoMinimo ? <> · Mínimo <b>{soles(p.pedidoMinimo)}</b></> : null}
        </p>
      )}
      {mejores.length > 0 && (
        <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800">
          <BadgeCheck className="mr-1 inline h-3.5 w-3.5" aria-hidden />Mejor precio en: <b>{mejores.join(", ")}</b>
        </p>
      )}
      {p.notas && <p className="mt-2 text-xs text-gray-500 whitespace-pre-line">{p.notas}</p>}
      {otraSede && <p className="mt-2 text-[11px] text-gray-400">Le compra: {p.sedes.map((s) => SEDES[s]).join(", ")}</p>}

      <div className="mt-auto flex gap-2 pt-3">
        {tel && <a href={tel} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50"><Phone className="h-3.5 w-3.5" aria-hidden />Llamar</a>}
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-semibold text-white hover:brightness-95"><MessageCircle className="h-3.5 w-3.5" aria-hidden />WhatsApp</a>}
        {!tel && !wa && p.email && <a href={`mailto:${p.email}`} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50"><Mail className="h-3.5 w-3.5" aria-hidden />Escribir</a>}
        {tel2 && !tel && <a href={tel2} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-800">Llamar</a>}
      </div>
    </article>
  );
}

/* ─────────── Comparar precios ─────────── */

function Comparar({ datos, compra, ofertas, donde, productoPorId, onPrecio, onConectar, onCambio }: {
  datos: DatosProveedores; compra: ProveedorCompra[]; ofertas: PrecioRegistrado[]; donde: Map<number, number[]>;
  productoPorId: Map<number, ProductoComparable>; onPrecio?: (p: PrecioInicial) => void; onConectar: (p: ProductoComparable) => void; onCambio: () => void;
}) {
  const [q, setQ] = useState("");
  const [historial, setHistorial] = useState<number | null>(null);
  const conPrecio = datos.productos.filter((p) => ofertas.some((o) => o.productoId === p.id));
  const lista = conPrecio.filter((p) => !q || normal(p.nombre).includes(normal(q)));
  const provPorId = new Map(compra.map((p) => [p.id, p]));

  if (conPrecio.length === 0) {
    return (
      <Vacio icono={Tag} titulo="Aún no hay precios" texto="Registra el precio de un producto en dos o más proveedores y el sistema te dirá dónde conviene comprarlo.">
        {onPrecio && <button type="button" onClick={() => onPrecio({})} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-light">Registrar un precio</button>}
      </Vacio>
    );
  }

  return (
    <div className="space-y-5">
      {/* Dónde comprar cada cosa */}
      {donde.size > 0 && (
        <section className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-white p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
            <Sparkles className="h-5 w-5 text-primary-light" aria-hidden />Dónde comprar cada cosa
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">El más barato por unidad, producto por producto. Ningún proveedor es el más barato en todo.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {[...donde].sort((a, b) => b[1].length - a[1].length).map(([pid, prods]) => {
              const p = provPorId.get(pid);
              if (!p) return null;
              return (
                <div key={pid} className="rounded-xl border border-gray-100 bg-white p-3">
                  <p className="flex items-center justify-between gap-2 text-sm font-semibold text-gray-900">
                    <span className="min-w-0 truncate">{p.nombre}</span>
                    {p.costoEnvio ? <span className="shrink-0 text-[11px] font-normal text-gray-500"><Truck className="mr-0.5 inline h-3 w-3" aria-hidden />envío {soles(p.costoEnvio)}</span> : null}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {prods.map((id) => <span key={id} className="rounded-full bg-emerald-100/70 px-2.5 py-0.5 text-xs font-medium text-emerald-800">{productoPorId.get(id)?.nombre}</span>)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <Buscador valor={q} onChange={setQ} placeholder="Buscar un producto" />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {lista.map((prod) => {
          const filas = compararProducto(ofertas.filter((o) => o.productoId === prod.id), compra, datos.hoy);
          const solo = filas.length < 2;
          const abiertoHist = historial === prod.id;
          const hist = datos.precios.filter((x) => x.productoId === prod.id).slice().reverse();
          return (
            <article key={prod.id} className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm">
              <header className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900">{prod.nombre}</h3>
                  <p className="text-xs text-gray-500">Precio por {prod.unidad} · {filas.length} proveedor{filas.length === 1 ? "" : "es"}</p>
                </div>
                {onPrecio && (
                  <button type="button" onClick={() => onPrecio({ productoId: prod.id })}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50">
                    <Plus className="h-3 w-3" aria-hidden />Precio
                  </button>
                )}
              </header>
              <ul className="mt-3 space-y-2">
                {filas.map((f) => (
                  <li key={f.proveedor.id}
                    className={`rounded-xl border px-3 py-2.5 ${f.esMejor && !solo ? "border-emerald-300 bg-emerald-50/60" : "border-gray-100 bg-gray-50/40"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-gray-900">
                          <span className="min-w-0 break-words">{f.proveedor.nombre}</span>
                          {f.esMejor && !solo && <span className="rounded-full bg-primary-light px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Mejor precio</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {f.oferta.presentacion} a {soles(f.oferta.precio)} · {fechaCorta(f.oferta.fecha)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-base font-bold tabular-nums text-gray-900">{solesUnidad(f.unitario)}</p>
                        <p className={`text-[11px] font-medium ${f.esMejor ? "text-emerald-700" : "text-red-600"}`}>
                          {f.esMejor ? `por ${prod.unidad}` : `+${f.sobreMejor.toLocaleString("es-PE", { maximumFractionDigits: 0 })}% más caro`}
                        </p>
                      </div>
                    </div>
                    {f.convieneDesde !== null && (
                      <p className="mt-1.5 flex items-start gap-1 text-[11px] text-sky-800">
                        <Truck className="mt-px h-3 w-3 shrink-0" aria-hidden />
                        Cobra {soles(f.proveedor.costoEnvio ?? 0)} de envío: conviene desde {f.convieneDesde.toLocaleString("es-PE")} {plural(prod.unidad)} en un pedido, o juntándolo con otros productos.
                      </p>
                    )}
                    {f.viejo && (
                      <p className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-700">
                        <AlertTriangle className="h-3 w-3" aria-hidden />Precio de hace más de 3 meses: confírmalo antes de decidir.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              {solo && <p className="mt-2 text-xs text-gray-500">Registra este producto en otro proveedor para poder comparar.</p>}
              <EnRecetas producto={prod} datos={datos} onConectar={() => onConectar(prod)} onCambio={onCambio} />
              {hist.length > filas.length && (
                <div className="mt-2">
                  <button type="button" onClick={() => setHistorial(abiertoHist ? null : prod.id)} aria-expanded={abiertoHist}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary-light hover:text-primary">
                    <History className="h-3.5 w-3.5" aria-hidden />{abiertoHist ? "Ocultar historial" : `Ver historial de precios (${hist.length})`}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${abiertoHist ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                  {abiertoHist && (
                    <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100 text-xs">
                      {hist.map((h) => (
                        <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                          <span className="text-gray-700">{fechaCorta(h.fecha)} · {provPorId.get(h.proveedorId)?.nombre ?? datos.proveedores.find((p) => p.id === h.proveedorId)?.nombre ?? "—"}</span>
                          <span className="tabular-nums text-gray-900">{h.presentacion} a {soles(h.precio)} <span className="text-gray-400">· {h.registradoPor}</span></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────── Armar pedido ─────────── */

function ArmarPedido({ productos, ofertas, compra }: { productos: ProductoComparable[]; ofertas: PrecioRegistrado[]; compra: ProveedorCompra[] }) {
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [q, setQ] = useState("");
  const conPrecio = productos.filter((p) => ofertas.some((o) => o.productoId === p.id));
  const items: ItemPedido[] = Object.entries(cantidades)
    .map(([id, c]) => ({ productoId: Number(id), cantidad: Number(c) }))
    .filter((i) => Number.isFinite(i.cantidad) && i.cantidad > 0);
  const plan = armarPedido(items, ofertas, compra);
  const nombre = (id: number) => productos.find((p) => p.id === id);
  const lista = conPrecio.filter((p) => !q || normal(p.nombre).includes(normal(q)));
  const ahorro = plan.unSoloProveedor && plan.pedidos.length > 0 ? plan.unSoloProveedor.total - plan.total : 0;

  if (conPrecio.length === 0) {
    return <Vacio icono={ShoppingBasket} titulo="Primero registra precios" texto="Con los precios de cada proveedor, aquí eliges qué y cuánto comprar y el sistema arma el pedido más barato." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <section className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm lg:col-span-2">
        <h2 className="text-base font-bold text-gray-900">¿Qué vas a comprar?</h2>
        <p className="mb-3 text-xs text-gray-500">Escribe la cantidad en la unidad de cada producto. Se compran presentaciones enteras.</p>
        <Buscador valor={q} onChange={setQ} placeholder="Buscar un producto" />
        <ul className="mt-3 max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
          {lista.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-50">
              <label htmlFor={`cant-${p.id}`} className="min-w-0 flex-1 text-sm text-gray-800">{p.nombre}</label>
              <div className="flex items-center gap-1.5">
                <input id={`cant-${p.id}`} type="number" min="0" inputMode="decimal" value={cantidades[p.id] ?? ""}
                  onChange={(e) => setCantidades({ ...cantidades, [p.id]: e.target.value })} placeholder="0"
                  className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm tabular-nums focus:border-primary-light focus:outline-none focus:ring-2 focus:ring-primary-light/20" />
                <span className="w-14 truncate text-xs text-gray-500">{p.unidad}</span>
              </div>
            </li>
          ))}
        </ul>
        {items.length > 0 && (
          <button type="button" onClick={() => setCantidades({})} className="mt-3 text-xs font-medium text-gray-500 underline hover:text-gray-700">Vaciar la lista</button>
        )}
      </section>

      <section className="space-y-3 lg:col-span-3" aria-live="polite">
        {items.length === 0 ? (
          <Vacio icono={ArrowLeftRight} titulo="El pedido aparece aquí" texto="El sistema reparte cada producto al proveedor que lo deja más barato, contando el envío y el pedido mínimo." />
        ) : (
          <>
            <div className="rounded-2xl bg-primary p-4 text-white shadow-sm sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Total del pedido sugerido</p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums">{soles(plan.total)}</p>
              <p className="mt-1 text-sm text-white/85">
                {plan.pedidos.length === 1 ? "Todo con un proveedor." : `Repartido en ${plan.pedidos.length} proveedores.`}
                {ahorro > 0.009 && plan.unSoloProveedor && <> Ahorras <b>{soles(ahorro)}</b> frente a comprar todo a {plan.unSoloProveedor.proveedor.nombre}.</>}
              </p>
            </div>
            {plan.minimosQueMandaron.length > 0 && (
              <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden />
                {plan.minimosQueMandaron.map((id) => compra.find((p) => p.id === id)?.nombre).join(" y ")}: el pedido no llega a su mínimo, así que esos productos se sugieren con otro proveedor. Si juntas más productos, puede convenir.
              </p>
            )}
            {plan.pedidos.map((pp) => (
              <article key={pp.proveedor.id} className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm">
                <header className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-900">{pp.proveedor.nombre}</h3>
                  <p className="text-lg font-bold tabular-nums text-gray-900">{soles(pp.total)}</p>
                </header>
                <ul className="mt-2 divide-y divide-gray-100 text-sm">
                  {pp.lineas.map((l) => (
                    <li key={l.productoId} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="min-w-0 text-gray-800">
                        {nombre(l.productoId)?.nombre}
                        <span className="block text-xs text-gray-500">{l.paquetes} × {l.oferta.presentacion} ({soles(l.oferta.precio)} c/u)</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-gray-900">{soles(l.subtotal)}</span>
                    </li>
                  ))}
                  {pp.envio > 0 && (
                    <li className="flex items-center justify-between gap-3 py-1.5 text-gray-600">
                      <span className="inline-flex items-center gap-1"><Truck className="h-3.5 w-3.5" aria-hidden />Envío</span>
                      <span className="tabular-nums">{soles(pp.envio)}</span>
                    </li>
                  )}
                </ul>
              </article>
            ))}
            {plan.sinPrecio.length > 0 && (
              <p className="text-xs text-gray-500">Sin precio registrado: {plan.sinPrecio.map((id) => nombre(id)?.nombre).join(", ")}.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/* ─────────── Piezas ─────────── */

function Buscador({ valor, onChange, placeholder }: { valor: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
      <input type="search" value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-9 text-sm shadow-sm focus:border-primary-light focus:outline-none focus:ring-2 focus:ring-primary-light/20" />
      {valor && (
        <button type="button" onClick={() => onChange("")} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activo}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${activo ? "border-primary bg-primary text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
      {children}
    </button>
  );
}

function Vacio({ icono: Icono, titulo, texto, children }: { icono: typeof Store; titulo: string; texto: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-primary-50 text-primary-light"><Icono className="h-6 w-6" aria-hidden /></span>
      <p className="text-sm font-semibold text-gray-900">{titulo}</p>
      <p className="max-w-sm text-xs text-gray-500">{texto}</p>
      {children}
    </div>
  );
}

/* ─────────── El producto en Recetas y costos ─────────── */

const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toLocaleString("es-PE", { maximumFractionDigits: 0 })}%`;

/**
 * Si el producto es un insumo de Recetas: su costo allá contra el mejor precio de proveedor (de las sedes que
 * compran ese insumo). La dirección lo pasa con «Usar en Recetas»; nunca se cambia solo.
 */
function EnRecetas({ producto, datos, onConectar, onCambio }: { producto: ProductoComparable; datos: DatosProveedores; onConectar: () => void; onCambio: () => void }) {
  const { showToast } = useToast();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const enlaces = datos.enlaces.filter((e) => e.productoId === producto.id);
  const provs = datos.proveedores.filter((p) => p.tipo === "proveedor");
  const ofertasTodas = useMemo(() => vigentes(datos.precios), [datos.precios]);

  async function usar(origen: "Atelier" | "Cafetería", nombre: string, precio: number, ahora: number) {
    if (!window.confirm(`El costo de «${nombre}» en Recetas pasa de S/ ${ahora} a S/ ${precio}. Cambia el costo de todos los productos que lo llevan. ¿Seguro?`)) return;
    setOcupado(origen);
    const r = await usarPrecioEnRecetas({ productoId: producto.id, origen });
    setOcupado(null);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(`Recetas: «${r.insumo}» ahora cuesta S/ ${r.precio}. Los costos ya usan el precio nuevo.`, "success");
    onCambio();
  }
  async function quitar(origen: "Atelier" | "Cafetería") {
    setOcupado(origen);
    const r = await desconectarInsumo({ productoId: producto.id, origen });
    setOcupado(null);
    if (!r.ok) { showToast(r.error, "error"); return; }
    onCambio();
  }

  return (
    <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
      {enlaces.map((e) => {
        const ins = datos.insumos.find((i) => i.origen === e.origen && i.sku === e.sku);
        if (!ins) return null;
        const mejor = mejorParaInsumo(ofertasTodas, provs, producto.id, e.origen, e.factor);
        const dif = mejor && ins.precio > 0 ? ((mejor.precioInsumo - ins.precio) / ins.precio) * 100 : null;
        const distinto = dif !== null && Math.abs(dif) >= 0.5;
        return (
          <div key={e.origen} className="rounded-xl bg-sky-50/70 px-3 py-2.5 text-xs text-sky-950">
            <div className="flex items-start justify-between gap-2">
              <p className="flex min-w-0 items-start gap-1.5">
                <BookOpen className="mt-px h-3.5 w-3.5 shrink-0 text-sky-700" aria-hidden />
                <span>
                  <span className="font-semibold">Recetas · {e.origen === "Atelier" ? "Atelier" : "cafeterías"}:</span> {ins.nombre} cuesta{" "}
                  <b className="whitespace-nowrap">{solesUnidad(ins.precio)}</b> por {ins.unidad}.
                  {mejor ? (
                    <> Mejor proveedor: <b className="whitespace-nowrap">{solesUnidad(mejor.precioInsumo)}</b> ({mejor.proveedor})
                      {distinto && <span className={dif! < 0 ? " font-semibold text-emerald-700" : " font-semibold text-red-700"}> {pct(dif!)}</span>}.</>
                  ) : <> Aún sin precio de un proveedor de {e.origen === "Atelier" ? "Atelier" : "las cafeterías"}.</>}
                </span>
              </p>
              {datos.puedeEditar && (
                <button type="button" onClick={() => void quitar(e.origen)} disabled={ocupado !== null} aria-label={`Quitar conexión con ${ins.nombre}`} title="Quitar conexión"
                  className="shrink-0 rounded p-1 text-sky-700/60 hover:bg-sky-100 hover:text-sky-900"><Unlink className="h-3.5 w-3.5" /></button>
              )}
            </div>
            {mejor && distinto && datos.puedeCambiarRecetas && (
              <button type="button" disabled={ocupado !== null} onClick={() => void usar(e.origen, ins.nombre, mejor.precioInsumo, ins.precio)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-800 disabled:opacity-60">
                {ocupado === e.origen && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}Usar {solesUnidad(mejor.precioInsumo)} en Recetas
              </button>
            )}
            {mejor && distinto && !datos.puedeCambiarRecetas && (
              <p className="mt-1 text-[11px] text-sky-800/80">La dirección decide si pasa este precio a Recetas.</p>
            )}
          </div>
        );
      })}
      {datos.puedeEditar && enlaces.length < 2 && (
        <button type="button" onClick={onConectar} className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900">
          <Link2 className="h-3.5 w-3.5" aria-hidden />{enlaces.length === 0 ? "Conectar con un insumo de Recetas" : "Conectar también con la otra lista de insumos"}
        </button>
      )}
    </div>
  );
}

/* ─────────── Conexión con Control de Caja ─────────── */

function haceCuanto(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} día${d === 1 ? "" : "s"}`;
}

function FranjaCaja({ sync, ultima, onActualizar }: {
  sync: { estado: "trayendo" | "ok" | "error"; mensaje?: string }; ultima: DatosProveedores["sincronizado"]; onActualizar: () => void;
}) {
  const error = sync.estado === "error";
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${error ? "border-amber-200 bg-amber-50 text-amber-900" : "border-gray-200 bg-white text-gray-600"}`}>
      <p className="flex min-w-0 items-center gap-2">
        {sync.estado === "trayendo" ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary-light" aria-hidden />
          : error ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            : <Link2 className="h-3.5 w-3.5 shrink-0 text-primary-light" aria-hidden />}
        <span>
          {sync.estado === "trayendo" ? "Trayendo proveedores y compras de Control de Caja…"
            : error ? sync.mensaje
              : <>Conectado a <b className="text-gray-800">Control de Caja</b>: los proveedores y el precio de cada compra real llegan solos.{ultima && <> Actualizado {haceCuanto(ultima.el)}.</>}</>}
        </span>
      </p>
      <button type="button" onClick={onActualizar} disabled={sync.estado === "trayendo"}
        className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1 font-medium text-primary-light hover:bg-gray-50 disabled:opacity-50">
        Actualizar ahora
      </button>
    </div>
  );
}
