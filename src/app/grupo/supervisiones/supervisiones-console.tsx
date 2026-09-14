"use client";

/**
 * Consola de supervisiones — la pantalla de Juani.
 *
 * El orden responde a lo que Juani tiene que hacer, no a cómo se guarda:
 *   1. ¿Cómo va cada sede? (el requisito del bono, de un vistazo)
 *   2. Lo que está esperando SU respuesta: correcciones por confirmar.
 *      Va arriba porque mientras no confirme, el administrador no sabe si
 *      cumplió.
 *   3. Nueva visita.
 *   4. Lo que sigue abierto en los locales.
 *   5. Las visitas del mes y la lista de puntos.
 */

import { useState, useTransition } from "react";
import { ClipboardCheck, Plus, Loader2, ChevronDown, Trash2 } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { conReintento } from "@/lib/con-reintento";
import { ObservacionSupervision } from "@/components/observacion-supervision";
import {
  getConsolaSupervision, getListaSupervision, anularVisita,
  type ConsolaSupervision, type PuntoSupervision, type SedeSupervision,
} from "@/app/actions/supervisiones";
import { ETIQUETA_ESTADO_MES, type EstadoSupervisionMes } from "@/lib/supervisiones";
import { NuevaVisita } from "./nueva-visita";
import { ListaPuntos } from "./lista-puntos";

const CHIP_ESTADO: Record<EstadoSupervisionMes, string> = {
  sin_visitas: "bg-gray-100 text-gray-600 border-gray-200",
  al_dia: "bg-emerald-50 text-emerald-800 border-emerald-200",
  pendiente: "bg-amber-50 text-amber-800 border-amber-200",
  incumplido: "bg-red-50 text-red-800 border-red-200",
};

function TarjetaSede({ s }: { s: SedeSupervision }) {
  const r = s.resumen;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-gray-900">{s.sede}</div>
        <span className={`text-[11px] rounded-full px-2 py-0.5 border ${CHIP_ESTADO[r.estado]}`}>{ETIQUETA_ESTADO_MES[r.estado]}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><div className="text-lg font-bold text-gray-900">{r.visitas}</div><div className="text-[10px] text-gray-500 uppercase">Visitas</div></div>
        <div><div className="text-lg font-bold text-gray-900">{r.puntajePromedio !== null ? `${r.puntajePromedio}%` : "—"}</div><div className="text-[10px] text-gray-500 uppercase">Puntaje</div></div>
        <div><div className={`text-lg font-bold ${r.criticas.fueraDePlazo > 0 ? "text-red-600" : "text-gray-900"}`}>{r.criticas.total}</div><div className="text-[10px] text-gray-500 uppercase">Críticas</div></div>
      </div>
      <div className="text-[11px] text-gray-500">
        {r.estado === "incumplido"
          ? `${r.criticas.fueraDePlazo} crítica(s) fuera de plazo: ${s.requisito ? "este mes no hay bono" : "desde octubre, esto deja al equipo sin bono"}.`
          : r.estado === "pendiente"
            ? `${r.criticas.enPlazo} crítica(s) en plazo · ${r.criticas.porConfirmar} esperando tu confirmación.`
            : s.requisito
              ? "Requisito del bono cumplido por ahora."
              : "Desde octubre, esto es requisito del bono."}
      </div>
    </div>
  );
}

export function SupervisionesConsole({ inicial, hoy }: { inicial: ConsolaSupervision; hoy: string }) {
  const { showToast } = useToast();
  const [data, setData] = useState(inicial);
  const [month, setMonth] = useState(inicial.month);
  const [puntos, setPuntos] = useState<PuntoSupervision[] | null>(null);
  const [nueva, setNueva] = useState(false);
  const [verLista, setVerLista] = useState(false);
  const [cargando, startTransition] = useTransition();

  function recargar(m = month) {
    startTransition(async () => {
      const r = await conReintento(() => getConsolaSupervision(m));
      if (r.ok) setData(r.data);
      else showToast(r.error, "error");
    });
  }

  async function cargarPuntos() {
    const r = await getListaSupervision();
    if (r.ok) setPuntos(r.puntos);
    else showToast(r.error, "error");
    return r.ok;
  }

  async function abrirNueva() {
    if (await cargarPuntos()) setNueva(true);
  }

  async function anular(id: string) {
    if (!window.confirm("¿Anular esta visita? Se borran sus observaciones y fotos.")) return;
    const r = await anularVisita(id);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast("Visita anulada");
    recargar();
  }

  const porConfirmar = data.observaciones.filter((o) => o.estado === "corregida");
  const abiertas = data.observaciones.filter((o) => o.estado === "abierta");
  const cerradas = data.observaciones.filter((o) => o.estado === "confirmada");

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary" /> Supervisiones
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Crítica: 24 h para corregir · Normal: 7 días. Para el bono cuentan las críticas corregidas a tiempo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cargando && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          <input
            type="month"
            value={month}
            max={hoy.slice(0, 7)}
            onChange={(e) => { setMonth(e.target.value); recargar(e.target.value); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-xs bg-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.sedes.map((s) => <TarjetaSede key={s.businessId} s={s} />)}
      </div>

      {porConfirmar.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">Esperan tu confirmación ({porConfirmar.length})</h2>
          {porConfirmar.map((o) => (
            <ObservacionSupervision key={o.id} o={o} ahora={data.ahora} modo="supervisor" mostrarSede onCambio={() => recargar()} />
          ))}
        </section>
      )}

      {nueva && puntos ? (
        <NuevaVisita puntos={puntos} hoy={hoy} onCerrar={() => setNueva(false)} onGuardada={() => recargar()} />
      ) : (
        <button
          onClick={() => void abrirNueva()}
          className="w-full py-3 rounded-xl bg-primary text-white text-sm font-medium flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Registrar visita
        </button>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">Abiertas en los locales ({abiertas.length})</h2>
        {abiertas.length === 0 ? (
          <div className="text-xs text-gray-500 bg-white border border-gray-200 rounded-xl p-4">Nada pendiente de corregir.</div>
        ) : (
          abiertas.map((o) => (
            <ObservacionSupervision key={o.id} o={o} ahora={data.ahora} modo="supervisor" mostrarSede onCambio={() => recargar()} />
          ))
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Visitas del mes ({data.visitas.length})</div>
        {data.visitas.length === 0 ? (
          <div className="px-4 py-4 text-xs text-gray-500">Todavía no hay visitas este mes.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.visitas.map((v) => (
              <li key={v.id} className="px-4 py-2.5 flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="text-gray-900">{v.sede} · {v.fecha.slice(8)}/{v.fecha.slice(5, 7)}</div>
                  <div className="text-[11px] text-gray-500 truncate">
                    {v.puntosCumplidos}/{v.puntosEvaluados} puntos · {v.observaciones} observación(es) · {v.registradaPor}
                    {v.notas && ` · ${v.notas}`}
                  </div>
                </div>
                <button onClick={() => void anular(v.id)} aria-label="Anular visita" className="text-gray-300 hover:text-red-600 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {cerradas.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-500">
            {cerradas.length} observación(es) del mes ya confirmadas.
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-200">
        <button
          onClick={async () => { if (!verLista && !puntos) await cargarPuntos(); setVerLista((v) => !v); }}
          className="w-full px-4 py-3 flex items-center justify-between text-sm font-semibold text-gray-900"
        >
          Lista de puntos
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${verLista ? "rotate-180" : ""}`} />
        </button>
        {verLista && puntos && <ListaPuntos puntos={puntos} onCambio={() => void cargarPuntos()} />}
      </section>
    </div>
  );
}
