"use client";

/**
 * "¿Qué me toca subir?" — la rutina del administrador, con su estado.
 *
 * Pedido de Jahnn (18-ago-2026): "quiero que haya una guía de uso con
 * comentarios sutiles de qué es lo que tienen que subir… y una manera de
 * controlar que todos los días suban sus KPIs y los sábados su reporte
 * de productos, así como en el Highlight, de manera visual".
 *
 * Dos cosas que se cuidaron:
 *
 *  1. La guía y el control son LO MISMO. Una guía aparte se lee una vez
 *     y se olvida; pegada al estado ("esto te toca · esto llevas") se
 *     lee justo cuando hace falta.
 *  2. El aviso del sábado no aparece el lunes. Reclamarle el reporte
 *     semanal un martes es ruido: hasta el sábado no hay nada que
 *     hacer, y una alerta encendida toda la semana deja de leerse.
 */

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2, AlertTriangle, Upload, ChevronDown, CalendarDays, ClipboardList,
} from "lucide-react";
import { getCargaProductosSede, type CargaSedePropia } from "@/app/actions/product-sales-import";
import { describirPeriodo } from "@/lib/productos/periodos";
import { conReintento } from "@/lib/con-reintento";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const fechaCorta = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1]}`;
};

/** ¿Hoy es sábado o domingo? Es cuando toca el reporte semanal. */
function esFinDeSemana(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 6 || dow === 0;
}

export function MiRutina({
  refrescar,
  onSubirReporte,
}: {
  refrescar?: number;
  /** Abre el modal de "Subir reportes de control". */
  onSubirReporte?: () => void;
}) {
  const [data, setData] = useState<CargaSedePropia | null>(null);
  const [verGuia, setVerGuia] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setData(await conReintento(() => getCargaProductosSede()));
    } catch (e) {
      console.error("[MiRutina] cargar:", e);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar, refrescar]);

  if (!data || !data.visible || !data.estado) return null;

  const e = data.estado;
  const alDia = e.estado === "al-dia";
  const finDeSemana = esFinDeSemana(data.hoy);
  // Solo se levanta la voz el fin de semana o cuando ya se saltaron
  // sábados. Un martes con el reporte del sábado subido: silencio.
  const urgente = !alDia && (finDeSemana || (e.diasSinSubir ?? 0) > 7 || e.estado === "incompleto");

  const tono = alDia
    ? { caja: "border-emerald-200 bg-emerald-50/60", texto: "text-emerald-900", sub: "text-emerald-800/90", icono: "text-emerald-600" }
    : urgente
      ? { caja: "border-amber-200 bg-amber-50", texto: "text-amber-900", sub: "text-amber-800/90", icono: "text-amber-600" }
      : { caja: "border-gray-200 bg-white", texto: "text-gray-900", sub: "text-gray-500", icono: "text-gray-400" };

  const Icono = alDia ? CheckCircle2 : urgente ? AlertTriangle : CalendarDays;

  let titulo: string;
  let detalle: string;
  if (e.estado === "incompleto") {
    titulo = "El reporte de productos llegó incompleto";
    detalle =
      `Trajo ${e.productosUltimaCarga} platos y esta sede suele tener ~${e.productosHabitual}. ` +
      `En Byte exporta la lista COMPLETA, no el Top 10.`;
  } else if (alDia) {
    titulo = "Reporte de productos: subido";
    detalle = `Lo subiste el ${e.ultimaCarga ? fechaCorta(e.ultimaCarga) : "—"} con ${e.productosUltimaCarga} platos. Nada pendiente.`;
  } else if (e.estado === "nunca") {
    titulo = "Falta subir el reporte de productos";
    detalle = "Todavía no se ha subido ninguno en esta sede.";
  } else if (finDeSemana) {
    titulo = "Hoy toca el reporte de productos";
    // Se le dice la semana EXACTA que tiene que pedirle a Byte. Sin
    // esto tiene que calcularla él, y ahí es donde se equivoca.
    detalle = `Exporta de Byte ${describirPeriodo(data.semanaQueToca)} y súbelo antes de cerrar.`;
  } else {
    titulo = "Reporte de productos pendiente";
    detalle = `${e.detalle} El sábado toca ${describirPeriodo(data.semanaQueToca)}.`;
  }

  return (
    <div className={`rounded-xl border ${tono.caja} overflow-hidden`}>
      <div className="px-4 py-3 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2.5 min-w-0">
          <Icono className={`w-5 h-5 ${tono.icono} mt-0.5 shrink-0`} />
          <div className="min-w-0">
            <div className={`text-sm font-bold ${tono.texto}`}>{titulo}</div>
            <div className={`text-xs ${tono.sub} mt-0.5`}>{detalle}</div>
          </div>
        </div>
        {!alDia && onSubirReporte && (
          <button
            onClick={onSubirReporte}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary-light rounded-lg shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            Subir ahora
          </button>
        )}
      </div>

      {/* La cobertura del mes: lo que hace esto verificable. Ver un
          total no dice si falta una semana; ver el hueco, sí. */}
      {data.cobertura && data.cobertura.diasEsperados > 0 && (
        <div className="px-4 pb-2 -mt-1">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-gray-200 overflow-hidden">
              <div
                className={`h-full rounded-full ${data.cobertura.completa ? "bg-emerald-500" : "bg-amber-400"}`}
                style={{ width: `${Math.round((data.cobertura.diasCubiertos / data.cobertura.diasEsperados) * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-500 shrink-0">
              {data.cobertura.diasCubiertos} de {data.cobertura.diasEsperados} días del mes
            </span>
          </div>
          {!data.cobertura.completa && data.huecos && (
            <div className="text-[11px] text-amber-700 mt-1">Faltan {data.huecos}.</div>
          )}
        </div>
      )}

      <button
        onClick={() => setVerGuia((v) => !v)}
        className="w-full px-4 py-2 border-t border-black/5 flex items-center justify-between text-[11px] text-gray-500 hover:bg-black/[0.02]"
      >
        <span className="flex items-center gap-1.5">
          <ClipboardList className="w-3.5 h-3.5" />
          ¿Qué tengo que subir y cuándo?
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${verGuia ? "rotate-180" : ""}`} />
      </button>

      {verGuia && (
        <div className="px-4 pb-3 bg-white/70 space-y-2.5 text-[11px] text-gray-600">
          <div>
            <div className="font-semibold text-gray-900 text-xs">Todos los días · al cerrar</div>
            <p className="mt-0.5">
              Llena el <strong>registro del día</strong> acá abajo: personas atendidas, venta, NPS y
              mermas. De ahí salen tus KPIs, el avance de la meta y el bono — si falta un día, esos
              tres quedan incompletos.
            </p>
          </div>
          <div>
            <div className="font-semibold text-gray-900 text-xs">Cada sábado · antes de cerrar</div>
            <p className="mt-0.5">
              Sube el reporte de Byte <strong>&ldquo;Platos con mayor rotación&rdquo;</strong> con el
              botón <em>Subir reportes de control</em>.
            </p>
            <ul className="mt-1 space-y-0.5 list-disc pl-4">
              <li>
                En Byte elige <strong>la semana que terminó</strong> — este sábado toca{" "}
                {describirPeriodo(data.semanaQueToca)}. Las semanas se van sumando solas.
              </li>
              <li>
                Si un sábado se te pasó, no importa: sube el rango que falte, o el mes entero. El
                sistema lo ordena y <strong>nunca cuenta dos veces</strong>.
              </li>
              <li>
                Exporta <strong>todos los platos</strong>, no el Top 10: con 10 no se ve la carta
                completa.
              </li>
              <li>Es el de &ldquo;rotación&rdquo;, no el de &ldquo;rentabilidad&rdquo;.</li>
            </ul>
          </div>
          <p className="text-gray-400 pt-1 border-t border-gray-100">
            Dirección ve lo mismo que ves acá: qué día subiste y si el archivo vino completo.
          </p>
        </div>
      )}
    </div>
  );
}
