"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Ticket, Loader2, KeyRound, Dices } from "lucide-react";
import {
  listarProductosVale, emitirVale, listarVales, anularVale, estadoPinCaja, generarPinCaja,
  type ProductoVale, type ValeVista, type EstadoPinCaja,
} from "@/app/actions/vales";
import {
  DIAS_VIGENCIA_DEFECTO, ETIQUETA_ESTADO, linkVale, mensajeWhatsApp, resumenItems, sumarDias, valorCarta,
} from "@/lib/vales";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/toast-provider";
import { CanjearValeCard } from "@/components/vales/canjear-vale-card";
import { SelectorProductos, itemsParaEmitir, type Elegido } from "@/components/vales/selector-productos";
import { ListaCreados } from "@/components/vales/lista-creados";
import { SorteoPanel } from "@/components/vales/sorteo-panel";

/**
 * Vales de consumo · «Primer cliente». Jahnn emite un vale suelto o hace el
 * sorteo de los martes entre socios y administradores; los vales que crea en
 * la visita quedan juntos en una lista para mandarlos por WhatsApp. Abajo, el
 * registro (vigentes, canjeados y quién los canjeó) y, al final, el PIN de
 * caja. El canje lo hace caja con el PIN o el encargado con su cuenta.
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

type Pestana = "uno" | "sorteo";

export default function ValesPage() {
  const { negocio } = useParams<{ negocio: string }>();
  const { showToast } = useToast();
  const sedeValida = negocio === "fonavi" || negocio === "centro";

  const [vales, setVales] = useState<ValeVista[]>([]);
  const [puedeEmitir, setPuedeEmitir] = useState(false);
  const [productos, setProductos] = useState<ProductoVale[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [pestana, setPestana] = useState<Pestana>("uno");

  // Vale suelto
  const [elegidos, setElegidos] = useState<Elegido[]>([]);
  const [para, setPara] = useState("");
  const [venceEl, setVenceEl] = useState(() => sumarDias(hoyLima(), DIAS_VIGENCIA_DEFECTO));
  const [emitiendo, setEmitiendo] = useState(false);

  // Todo lo creado en esta visita (vale suelto + sorteo), el último primero.
  const [creados, setCreados] = useState<ValeVista[]>([]);

  // PIN de caja (canje sin cuenta)
  const [pinEstado, setPinEstado] = useState<EstadoPinCaja | null>(null);
  const [pinNuevo, setPinNuevo] = useState<string | null>(null);
  const [generandoPin, setGenerandoPin] = useState(false);

  const cargar = useCallback(async () => {
    const r = await listarVales(negocio);
    if (!r.ok) { setError(r.error); setLoading(false); return; }
    setVales(r.vales); setPuedeEmitir(r.puedeEmitir); setError(null);
    if (r.puedeEmitir) {
      const [p, pin] = await Promise.all([listarProductosVale(), estadoPinCaja(negocio)]);
      if (p.ok) setProductos(p.productos);
      if (pin.ok) setPinEstado(pin.estado);
    }
    setLoading(false);
  }, [negocio]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    if (sedeValida) void cargar(); else setLoading(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar, sedeValida]);

  async function emitir() {
    setEmitiendo(true);
    const r = await emitirVale({ sede: negocio, items: itemsParaEmitir(elegidos), para, venceEl });
    setEmitiendo(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    setCreados((c) => [r.vale, ...c]);
    setElegidos([]); setPara(""); setVenceEl(sumarDias(hoyLima(), DIAS_VIGENCIA_DEFECTO));
    showToast("Vale creado", "success");
    await cargar();
  }

  /** «Usar los mismos productos»: carga en el formulario los productos de un vale ya creado. */
  function repetir(v: ValeVista) {
    setElegidos(v.items.map((i) => ({ p: { ref: i.ref, nombre: i.nombre, seccion: "", precio: i.precio }, cantidad: i.cantidad })));
    setPara("");
    setPestana("uno");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function alCrearSorteo(nuevos: ValeVista[]) {
    setCreados((c) => [...[...nuevos].reverse(), ...c]);
    void cargar();
  }

  async function copiarLink(codigo: string) {
    try {
      await navigator.clipboard.writeText(linkVale(codigo));
      showToast("Link copiado", "success");
    } catch {
      showToast("No pude copiar. Mantén presionado el link para copiarlo.", "error");
    }
  }

  function whatsapp(v: ValeVista) {
    const texto = mensajeWhatsApp({ link: linkVale(v.codigo), sede: v.sede, items: v.items, venceEl: v.venceEl, para: v.para });
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  }

  async function generarPin() {
    if (pinEstado?.configurado && !window.confirm("¿Cambiar el PIN de caja? El anterior deja de servir ahora mismo y tendrás que dárselo de nuevo a los cajeros.")) return;
    setGenerandoPin(true);
    const r = await generarPinCaja(negocio);
    setGenerandoPin(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    setPinNuevo(r.pin);
    const e = await estadoPinCaja(negocio);
    if (e.ok) setPinEstado(e.estado);
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
  // Canjes de hoy: para cruzar con el reporte de Cortesías de Byte (si Byte tiene una cortesía sin vale, se nota).
  const [hoyA, hoyM, hoyD] = hoyLima().split("-");
  const prefijoHoy = `${hoyD}/${hoyM}/${hoyA}`;
  const canjesHoy = vales.filter((v) => v.estado === "canjeado" && v.canjeadoEn?.startsWith(prefijoHoy));
  const valorHoy = valorCarta(canjesHoy.map((v) => ({ cantidad: 1, precio: v.valorCarta })));

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
        <>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1" role="tablist">
            {([["uno", "Un vale", Ticket], ["sorteo", "Sorteo", Dices]] as const).map(([id, texto, Icono]) => (
              <button
                key={id} role="tab" aria-selected={pestana === id} onClick={() => setPestana(id)}
                className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${pestana === id ? "bg-white text-[#004C40] shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
              >
                <Icono className="w-4 h-4" />{texto}
              </button>
            ))}
          </div>

          {pestana === "uno" ? (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
              <h2 className="text-sm font-bold text-gray-900">Nuevo vale</h2>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">¿Qué cubre? (de la carta)</label>
                <SelectorProductos productos={productos} elegidos={elegidos} onChange={setElegidos} />
              </div>

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
            </div>
          ) : (
            <SorteoPanel productos={productos} sedeInicial={negocio} onCreados={alCrearSorteo} />
          )}

          <ListaCreados vales={creados} onRepetir={repetir} />
        </>
      ) : (
        <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">Solo Jahnn emite y anula vales. Aquí puedes ver el registro y canjear.</div>
      )}

      <CanjearValeCard />

      <div>
        <h2 className="text-sm font-bold text-gray-900">Registro · {vigentes} vigente{vigentes === 1 ? "" : "s"}</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Canjes de hoy: <strong>{canjesHoy.length}</strong>{canjesHoy.length > 0 ? ` · ${formatCurrency(valorHoy)} en carta` : ""}. Deben coincidir con las cortesías de Byte de hoy.
        </p>
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
                    <button onClick={() => copiarLink(v.codigo)} className="text-xs font-medium text-gray-600 hover:underline">Copiar link</button>
                    <button onClick={() => anular(v)} className="text-xs font-medium text-red-600 hover:underline">Anular</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* El PIN va al final, lejos de «Generar vale»: se confundían los dos botones (22-nov-2026). */}
      {puedeEmitir && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div>
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" />
              PIN de caja · {sedeNombre}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Con este PIN de 6 números el cajero canjea el vale del invitado en su celular, sin cuenta en Cash Control.
              Es el mismo para todos los vales de {sedeNombre}. Dáselo en persona. Tras 5 intentos fallidos la caja se bloquea 10 minutos.
            </p>
          </div>
          <div className="text-xs text-gray-700">
            {pinEstado?.configurado
              ? <>PIN activo · actualizado {pinEstado.actualizadoEn}{pinEstado.actualizadoPor ? ` por ${pinEstado.actualizadoPor}` : ""}{pinEstado.bloqueadaHasta ? <strong className="text-red-700"> · caja bloqueada hasta las {pinEstado.bloqueadaHasta}</strong> : null}</>
              : <strong className="text-amber-700">Todavía no hay PIN: sin él, caja no puede canjear.</strong>}
          </div>
          <button
            onClick={generarPin} disabled={generandoPin}
            className="px-4 py-2 text-sm font-semibold text-white bg-gray-700 hover:bg-gray-800 rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
          >
            {generandoPin && <Loader2 className="w-4 h-4 animate-spin" />}
            {pinEstado?.configurado ? "Cambiar el PIN de caja" : "Generar PIN de caja"}
          </button>
          {pinNuevo && (
            <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 space-y-1">
              <div className="text-xs font-semibold text-amber-900">Anótalo ahora: no se vuelve a mostrar</div>
              <div className="font-mono text-3xl font-extrabold tracking-[0.3em] text-gray-900">{pinNuevo}</div>
              <button onClick={() => setPinNuevo(null)} className="text-xs font-medium text-amber-900 underline">Ya lo anoté, ocultar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
