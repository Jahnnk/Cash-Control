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
  CheckCircle2, AlertTriangle, Upload, ChevronDown, CalendarDays, ClipboardList, Circle,
} from "lucide-react";
import { getCargaProductosSede, type CargaSedePropia } from "@/app/actions/product-sales-import";
import { describirPeriodo } from "@/lib/productos/periodos";
import { nombrarFaltantes } from "@/lib/incentivos/reportes-semanales";
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
  esProduccion = false,
}: {
  refrescar?: number;
  /** Abre el modal de "Subir reportes de control". */
  onSubirReporte?: () => void;
  /**
   * Atelier: centro de producción, no cafetería. No lleva NPS y no
   * entra al bono por ticket promedio — hablarle de "la meta y el
   * bono" a Luis sería prometerle algo que no existe.
   */
  esProduccion?: boolean;
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
  const sem = data.semanal;
  // "Al día" exige TODOS los que le tocan a la sede. Antes bastaba el
  // de rotación y la tarjeta se ponía verde con los otros sin subir.
  const alDia = e.estado === "al-dia" && (sem?.completo ?? true);
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
  // Cuántos archivos le tocan a ESTA sede: Atelier solo sube el de
  // rotación (no da cortesías y su único vendedor es el propio
  // administrador). Hablar de "los 3" en su panel sería pedirle
  // archivos que no existen.
  const cuantos = sem?.reportes.length ?? 3;
  const nArchivos = cuantos === 1 ? "el reporte de Byte" : `los ${cuantos} reportes de Byte`;

  if (e.estado === "incompleto") {
    titulo = "El reporte de productos llegó incompleto";
    detalle =
      `Trajo ${e.productosUltimaCarga} platos y esta sede suele tener ~${e.productosHabitual}. ` +
      `En Byte exporta la lista COMPLETA, no el Top 10.`;
  } else if (alDia) {
    titulo = "Reportes de Byte: subidos";
    detalle = `Los subiste el ${e.ultimaCarga ? fechaCorta(e.ultimaCarga) : "—"} · ${e.productosUltimaCarga} platos. Nada pendiente.`;
  } else if (e.estado === "nunca") {
    titulo = "Faltan los reportes de Byte";
    detalle = "Todavía no se ha subido ninguno en esta sede.";
  } else if (sem && !sem.completo && sem.faltan.length < cuantos && e.estado === "al-dia") {
    // Subió algunos pero no todos: lo útil es decir CUÁLES faltan.
    titulo = `Faltan ${sem.faltan.length} de ${nArchivos}`;
    detalle = `${nombrarFaltantes(sem.faltan)}. Mismo rango: ${describirPeriodo(data.rangoQueToca)}.`;
  } else if (finDeSemana) {
    titulo = cuantos === 1 ? "Hoy toca subir el reporte de Byte" : "Hoy toca subir los reportes de Byte";
    // El rango EXACTO que hay que pedirle a Byte, ya calculado. Es el
    // mismo para todos los archivos: una sola instrucción, una sola
    // forma de equivocarse.
    detalle = cuantos === 1
      ? `Exporta Platos con Mayor Rotación ${describirPeriodo(data.rangoQueToca)}.`
      : `Exporta ${nArchivos} ${describirPeriodo(data.rangoQueToca)} y suéltalos juntos.`;
  } else {
    titulo = "Reportes de Byte pendientes";
    detalle = cuantos === 1
      ? `${e.detalle} Se sube cada sábado, ${describirPeriodo(data.rangoQueToca)}.`
      : `${e.detalle} El sábado se suben los ${cuantos}, ${describirPeriodo(data.rangoQueToca)}.`;
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

      {/* Los 4 del sábado, uno por uno. Es el pedido de Jahnn: que vean
          de un vistazo cuál falta, como en el Highlight. Se muestra
          mientras falte alguno; con todos subidos desaparece para
          no ocupar espacio con una lista de ✓. */}
      {sem && !sem.completo && (
        <div className="px-4 pb-2 space-y-1">
          {sem.reportes.map((r) => (
            <div key={r.clave} className="flex items-start gap-2 text-[11px]">
              {r.subidoEstaSemana ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-px shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-gray-300 mt-px shrink-0" />
              )}
              <div className="min-w-0">
                <span className={r.subidoEstaSemana ? "text-gray-500 line-through" : "font-medium text-gray-900"}>
                  {r.nombre}
                </span>
                {!r.subidoEstaSemana && (
                  <span className="text-gray-500"> — {r.porQue}</span>
                )}
                {!r.subidoEstaSemana && r.ultimaCarga === null && (
                  <span className="ml-1 text-[10px] text-amber-700 font-medium">nunca se ha subido</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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
              {esProduccion ? (
                <>
                  Llena el <strong>registro del día</strong> acá abajo: venta, pedidos y mermas. De
                  ahí salen tus KPIs y el seguimiento del mes — si falta un día, quedan incompletos.
                </>
              ) : (
                <>
                  Llena el <strong>registro del día</strong> acá abajo: personas atendidas, venta,
                  NPS y mermas. De ahí salen tus KPIs, el avance de la meta y el bono — si falta un
                  día, esos tres quedan incompletos.
                </>
              )}
            </p>
          </div>
          <div>
            <div className="font-semibold text-gray-900 text-xs">Cada sábado · antes de cerrar</div>
            <p className="mt-0.5">
              Con el botón <em>Subir ahora</em> suelta{" "}
              {cuantos === 1 ? (
                <><strong>el reporte de Byte</strong></>
              ) : (
                <><strong>los {cuantos} reportes de Byte</strong> juntos</>
              )}
              , con el rango <strong>{describirPeriodo(data.rangoQueToca)}</strong>:
            </p>
            {/* La lista sale de los reportes que ESTA sede sí produce.
                Escribirlos a mano volvería a pedirle a Atelier las
                cortesías que su operación no genera. */}
            <ul className="mt-1 space-y-0.5 list-disc pl-4">
              {(sem?.reportes ?? []).map((r) => (
                <li key={r.clave}>{r.nombre}</li>
              ))}
            </ul>
            {cuantos > 1 && (
              <p className="mt-1.5">
                Los tres últimos son el <strong>control del bono</strong> de ticket promedio: sin
                ellos el sistema no puede separar el upselling real de una cortesía o un cambio de
                precio.
              </p>
            )}
            <ul className="mt-1 space-y-0.5 list-disc pl-4">
              <li>
                Siempre <strong>desde el día 1 del mes hasta hoy</strong>, no solo la semana. El
                sistema reemplaza lo anterior, <strong>nunca duplica</strong>.
              </li>
              <li>
                Si un sábado se te pasó, no pasa nada: el rango del 1 a hoy recupera los días que
                faltaron.
              </li>
              <li>
                En rotación exporta <strong>todos los platos</strong>, no el Top 10: con 10 no se ve
                la carta completa.
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
