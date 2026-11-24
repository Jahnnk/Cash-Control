"use client";

import { ArrowLeftRight, Copy, MessageCircle, Repeat2 } from "lucide-react";
import type { ValeVista } from "@/app/actions/vales";
import { linkVale, mensajeWhatsApp, resumenItems, textoTodosLosVales } from "@/lib/vales";
import { useToast } from "@/components/toast-provider";

/**
 * Los vales que acabas de crear en esta visita, todos juntos: cada uno con su
 * WhatsApp y su link, más «Copiar todos» para pegarlos de una vez. Pensado para
 * los 6 vales del sorteo de los martes: no se pierde ninguno entre medio.
 */
export function ListaCreados({ vales, onRepetir, onCambiarSede }: { vales: ValeVista[]; onRepetir?: (v: ValeVista) => void; onCambiarSede?: (v: ValeVista) => void }) {
  const { showToast } = useToast();
  if (vales.length === 0) return null;

  async function copiar(texto: string, aviso: string) {
    try {
      await navigator.clipboard.writeText(texto);
      showToast(aviso, "success");
    } catch {
      showToast("No pude copiar. Mantén presionado el link para copiarlo.", "error");
    }
  }

  function whatsapp(v: ValeVista) {
    const texto = mensajeWhatsApp({ link: linkVale(v.codigo), sede: v.sede, items: v.items, venceEl: v.venceEl, para: v.para });
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  }

  return (
    <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-emerald-900">
          Vales creados ahora · {vales.length}
        </h2>
        {vales.length > 1 && (
          <button
            onClick={() => copiar(textoTodosLosVales([...vales].reverse()), `${vales.length} vales copiados`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-white border border-emerald-300 hover:bg-emerald-50 rounded-lg"
          >
            <Copy className="w-3.5 h-3.5" />
            Copiar todos los links
          </button>
        )}
      </div>
      <ul className="space-y-2">
        {vales.map((v) => (
          <li key={v.id} className="bg-white border border-emerald-100 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-lg font-extrabold tracking-widest text-[#004C40]">{v.codigo}</span>
              <span className="text-xs text-gray-500">{v.sede}</span>
            </div>
            <div className="text-sm text-gray-900">
              {v.para && <strong>{v.para} · </strong>}
              {resumenItems(v.items)}
              <span className="text-gray-500"> · hasta el {v.venceEl.split("-").reverse().join("/")}</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-0.5">
              <button onClick={() => whatsapp(v)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">
                <MessageCircle className="w-3.5 h-3.5" />WhatsApp
              </button>
              <button onClick={() => copiar(linkVale(v.codigo), "Link copiado")} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-800 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg">
                <Copy className="w-3.5 h-3.5" />Copiar link
              </button>
              {onCambiarSede && v.estado === "emitido" && (
                <button onClick={() => onCambiarSede(v)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-800 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg">
                  <ArrowLeftRight className="w-3.5 h-3.5" />Pasar a {v.businessId === 2 ? "Centro" : "Fonavi"}
                </button>
              )}
              {onRepetir && (
                <button onClick={() => onRepetir(v)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-800 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg">
                  <Repeat2 className="w-3.5 h-3.5" />Usar los mismos productos
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
