"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Ticket, Loader2, Copy, MessageCircle, Plus, Minus, X, Search } from "lucide-react";
import {
  listarProductosVale, emitirVale, listarVales, anularVale,
  type ProductoVale, type ValeVista,
} from "@/app/actions/vales";
import {
  DIAS_VIGENCIA_DEFECTO, MAX_ITEMS, MAX_CANTIDAD, ETIQUETA_ESTADO,
  linkVale, mensajeWhatsApp, resumenItems, sumarDias, valorCarta,
} from "@/lib/vales";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/toast-provider";
import { CanjearValeCard } from "@/components/vales/canjear-vale-card";

/**
 * Vales de consumo · «Primer cliente». Jahnn emite el vale (productos de la
 * carta + vencimiento), copia el link y se lo entrega por WhatsApp. Abajo,
 * el registro: qué vales siguen vigentes, cuáles ya se canjearon y quién lo
 * hizo. El canje lo hace el encargado de la sede; también se puede acá.
 */

function hoyLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

const BADGE: Record<ValeVista["estado"], string> = {
  emitido: "bg-emerald-50 text-emerald-800 border-emerald-200",
  canjeado: "bg-gray-100 text-gray-700 border-gray-300",
  vencido: "bg-amber-50 text-amber-800 border-amber-200",
  anulado: "bg-red-50 text-red-800 border-red-200",
};

export default function ValesPage() {
  const { negocio } = useParams<{ negocio: string }>();
  const { showToast } = useToast();
  const sedeValida = negocio === "fonavi" || negocio === "centro";

  const [vales, setVales] = useState<ValeVista[]>([]);
  const [puedeEmitir, setPuedeEmitir] = useState(false);
  const [productos, setProductos] = useState<ProductoVale[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Formulario
  const [busqueda, setBusqueda] = useState("");
  const [elegidos, setElegidos] = useState<{ p: ProductoVale; cantidad: number }[]>([]);
  const [para, setPara] = useState("");
  const [venceEl, setVenceEl] = useState(() => sumarDias(hoyLima(), DIAS_VIGENCIA_DEFECTO));
  const [emitiendo, setEmitiendo] = useState(false);
  const [recien, setRecien] = useState<ValeVista | null>(null);

  const cargar = useCallback(async () => {
    const r = await listarVales(negocio);
    if (!r.ok) { setError(r.error); setLoading(false); return; }
    setVales(r.vales); setPuedeEmitir(r.puedeEmitir); setError(null);
    if (r.puedeEmitir) {
      const p = await listarProductosVale();
      if (p.ok) setProductos(p.productos);
    }
    setLoading(false);
  }, [negocio]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    if (sedeValida) void cargar(); else setLoading(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar, sedeValida]);

  const sugerencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    const ya = new Set(elegidos.map((e) => e.p.ref));
    return productos.filter((p) => !ya.has(p.ref) && (p.nombre.toLowerCase().includes(q) || p.seccion.toLowerCase().includes(q))).slice(0, 8);
  }, [busqueda, productos, elegidos]);

  const total = valorCarta(elegidos.map((e) => ({ cantidad: e.cantidad, precio: e.p.precio })));

  function agregar(p: ProductoVale) {
    if (elegidos.length >= MAX_ITEMS) { showToast(`Máximo ${MAX_ITEMS} productos por vale.`, "error"); return; }
    setElegidos((l) => [...l, { p, cantidad: 1 }]);
    setBusqueda("");
  }
  function cambiarCantidad(ref: string, delta: number) {
    setElegidos((l) => l.map((e) => (e.p.ref === ref ? { ...e, cantidad: Math.min(MAX_CANTIDAD, Math.max(1, e.cantidad + delta)) } : e)));
  }

  async function emitir() {
    setEmitiendo(true);
    const r = await emitirVale({
      sede: negocio,
      items: elegidos.map((e) => ({ ref: e.p.ref, cantidad: e.cantidad })),
      para, venceEl,
    });
    setEmitiendo(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    setRecien(r.vale);
    setElegidos([]); setPara(""); setVenceEl(sumarDias(hoyLima(), DIAS_VIGENCIA_DEFECTO));
    await cargar();
  }

  async function copiar(codigo: string) {
    try {
      await navigator.clipboard.writeText(linkVale(codigo));
      showToast("Link copiado", "success");
    } catch {
      showToast("No pude copiar. Mantén presionado el link para copiarlo.", "error");
    }
  }

  function whatsapp(v: ValeVista) {
    const texto = mensajeWhatsApp({ link: linkVale(v.codigo), sede: v.sede, items: v.items, venceEl: v.venceEl });
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  }

  async function anular(v: ValeVista) {
    if (!window.confirm(`¿Anular el vale ${v.codigo}? Ya no se podrá canjear.`)) return;
    const r = await anularVale({ id: v.id, motivo: "Anulado por dirección" });
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast("Vale anulado", "success");
    await cargar();
  }

  if (!sedeValida) {
    return <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">Los vales de consumo se canjean en Fonavi y Centro.</div>;
  }
  if (loading) return <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">Cargando…</div>;
  if (error) return <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">{error}</div>;

  const sedeNombre = negocio === "fonavi" ? "Fonavi" : "Centro";
  const vigentes = vales.filter((v) => v.estado === "emitido").length;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Ticket className="w-5 h-5 text-primary" />
          Vales de consumo · {sedeNombre}
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Primer cliente: un vale digital con código único. Se canjea una sola vez y después queda inhabilitado.
        </p>
      </div>

      {puedeEmitir ? (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <h2 className="text-sm font-bold text-gray-900">Nuevo vale</h2>

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-700">¿Qué cubre? (de la carta)</label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                placeholder={productos.length === 0 ? "Cargando carta…" : "Busca: capuccino, sánguche, torta…"}
                className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm"
              />
            </div>
            {sugerencias.length > 0 && (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-auto">
                {sugerencias.map((p) => (
                  <button key={p.ref} type="button" onClick={() => agregar(p)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50">
                    <span className="text-sm text-gray-900">{p.nombre} <span className="text-xs text-gray-400">· {p.seccion}</span></span>
                    <span className="text-xs text-gray-500 shrink-0">{formatCurrency(p.precio)}</span>
                  </button>
                ))}
              </div>
            )}
            {busqueda.trim() && sugerencias.length === 0 && productos.length > 0 && (
              <div className="text-xs text-gray-500">No encuentro ese producto en la carta.</div>
            )}
          </div>

          {elegidos.length > 0 && (
            <ul className="space-y-2">
              {elegidos.map(({ p, cantidad }) => (
                <li key={p.ref} className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{p.nombre}</div>
                    <div className="text-xs text-gray-500">{formatCurrency(p.precio)} c/u</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button type="button" onClick={() => cambiarCantidad(p.ref, -1)} className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-50" aria-label="Menos"><Minus className="w-3.5 h-3.5" /></button>
                    <span className="w-6 text-center text-sm font-semibold">{cantidad}</span>
                    <button type="button" onClick={() => cambiarCantidad(p.ref, 1)} className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-50" aria-label="Más"><Plus className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => setElegidos((l) => l.filter((e) => e.p.ref !== p.ref))} className="p-1.5 rounded-md text-gray-400 hover:text-red-600" aria-label="Quitar"><X className="w-4 h-4" /></button>
                  </div>
                </li>
              ))}
              <li className="text-xs text-gray-600 text-right">Valor en carta de la cortesía: <strong>{formatCurrency(total)}</strong></li>
            </ul>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Para (opcional)</label>
              <input type="text" value={para} onChange={(e) => setPara(e.target.value)} maxLength={60} placeholder="Nombre del invitado" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Vale hasta</label>
              <input type="date" value={venceEl} min={hoyLima()} max={sumarDias(hoyLima(), 180)} onChange={(e) => setVenceEl(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          <button
            onClick={emitir} disabled={emitiendo || elegidos.length === 0}
            className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-primary hover:opacity-90 rounded-lg disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {emitiendo && <Loader2 className="w-4 h-4 animate-spin" />}
            Generar vale
          </button>

          {recien && (
            <div className="border border-emerald-300 bg-emerald-50 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-emerald-800">Vale creado</div>
              <div className="font-mono text-2xl font-extrabold tracking-widest text-[#004C40]">{recien.codigo}</div>
              <div className="text-sm text-gray-800">{resumenItems(recien.items)} · hasta el {recien.venceEl.split("-").reverse().join("/")}</div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => whatsapp(recien)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"><MessageCircle className="w-4 h-4" />Enviar por WhatsApp</button>
                <button onClick={() => copiar(recien.codigo)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-800 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg"><Copy className="w-4 h-4" />Copiar link</button>
              </div>
              <div className="text-[11px] text-gray-500 break-all">{linkVale(recien.codigo)}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">Solo Jahnn emite y anula vales. Aquí puedes ver el registro y canjear.</div>
      )}

      <CanjearValeCard />

      <div>
        <h2 className="text-sm font-bold text-gray-900">Registro · {vigentes} vigente{vigentes === 1 ? "" : "s"}</h2>
        {vales.length === 0 ? (
          <div className="mt-2 bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-500">Todavía no hay vales en {sedeNombre}.</div>
        ) : (
          <ul className="mt-2 space-y-2">
            {vales.map((v) => (
              <li key={v.id} className="bg-white rounded-xl border border-gray-200 p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-gray-900">{v.codigo}</span>
                  <span className={`text-xs font-semibold rounded-full px-2.5 py-1 border ${BADGE[v.estado]}`}>{ETIQUETA_ESTADO[v.estado]}</span>
                </div>
                <div className="text-sm text-gray-800">{resumenItems(v.items)}</div>
                <div className="text-xs text-gray-500">
                  {v.para ? `Para ${v.para} · ` : ""}emitido {v.emitidoEn} · vence {v.venceEl.split("-").reverse().join("/")}
                  {v.estado === "canjeado" && v.canjeadoEn ? ` · canjeado ${v.canjeadoEn}${v.canjeadoPor ? ` por ${v.canjeadoPor}` : ""}` : ""}
                </div>
                {v.estado === "emitido" && puedeEmitir && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button onClick={() => whatsapp(v)} className="text-xs font-medium text-emerald-700 hover:underline">WhatsApp</button>
                    <button onClick={() => copiar(v.codigo)} className="text-xs font-medium text-gray-600 hover:underline">Copiar link</button>
                    <button onClick={() => anular(v)} className="text-xs font-medium text-red-600 hover:underline">Anular</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
