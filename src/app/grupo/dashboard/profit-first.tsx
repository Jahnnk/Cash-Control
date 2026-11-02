"use client";

/**
 * «Profit First» — apartar la utilidad ANTES de gastar el resto (pedido de Jahnn,
 * 15-oct-2026, de la asesoría con su coach). Tres principios, uno por bloque:
 *   1. Separación: el 25% (ajustable) de la venta va primero a la cuenta de la utilidad
 *      (los fondos mutuos), intocable.
 *   2. Termómetro: la operación completa debe caber en el 75% restante; si no cabe, es un
 *      problema de eficiencia, no de ventas.
 *   3. EBITDA y socios: el 25% sale del EBITDA objetivo (el resto, impuestos y reinversión) y
 *      el sueldo de los socios se paga de la utilidad (interruptor del CEO; hoy sigue en planilla).
 * Reglas y números: src/lib/regla-33.ts; nada nuevo que llenar. Los ajustes viven en
 * profit_first_config (actions/profit-first.ts).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SeccionDesplegable } from "@/components/productos/ui";
import { profitFirst, validarConfig, type ConfigProfitFirst, type EstadoApartado, type FilaProfitFirst } from "@/lib/regla-33";
import { guardarConfigProfitFirst } from "@/app/actions/profit-first";
import type { SeisCifras } from "@/app/actions/seis-cifras";

const soles = (n: number) => `${n < 0 ? "−" : ""}S/${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const pct = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;
const dd = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const ESTADO: Record<EstadoApartado, { texto: string; chip: string; barra: string; num: string }> = {
  cumple: { texto: "Cumple", chip: "bg-emerald-50 text-emerald-800 ring-emerald-200", barra: "bg-emerald-600", num: "text-emerald-700" },
  parcial: { texto: "A medias", chip: "bg-amber-50 text-amber-800 ring-amber-200", barra: "bg-amber-400", num: "text-amber-700" },
  sin_apartar: { texto: "Sin apartar", chip: "bg-red-50 text-red-700 ring-red-200", barra: "bg-red-400", num: "text-red-700" },
};

function Bloque({ n, titulo, children }: { n: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-100 pt-2.5 first:border-t-0 first:pt-0">
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">{n} · {titulo}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Tarjeta({ f, finDeMes }: { f: FilaProfitFirst; finDeMes: string }) {
  const aMedias = !f.mesCompleto && (f.esGrupo || (f.corte !== null && f.corte < finDeMes));
  const e = f.estado;
  const ap = f.apartado;
  const op = f.operacion;
  const avance = ap && f.meta ? Math.max(0, Math.min(100, (ap.neto / f.meta) * 100)) : 0;
  const detalle = ap && (ap.rescates > 0 || ap.utilidadesPagadas > 0)
    ? `${soles(ap.ahorro)} a fondos mutuos${ap.rescates > 0 ? ` − ${soles(ap.rescates)} que se sacaron` : ""}${ap.utilidadesPagadas > 0 ? ` + ${soles(ap.utilidadesPagadas)} de utilidades ya pagadas` : ""}`
    : null;
  return (
    <div className={`min-w-0 rounded-xl px-4 py-3.5 ${f.esGrupo ? "bg-gray-50" : "border border-gray-100"}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-gray-900">{f.etiqueta}</span>
          {!f.esGrupo && f.corte && aMedias && <span className="text-[10px] text-amber-700">datos hasta el {dd(f.corte)}</span>}
        </div>
        {e && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${ESTADO[e].chip}`}>{ESTADO[e].texto}</span>}
      </div>

      {ap && op && e && f.meta !== null && f.ebitda !== null && f.ebitdaPct !== null ? (
        <div className="mt-2.5 space-y-2.5">
          <Bloque n="1" titulo={`Separar el ${f.utilidadPct}%`}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className={`text-2xl font-bold tabular-nums leading-none ${ESTADO[e].num}`}>{soles(ap.neto)}</span>
              <span className="text-xs text-gray-500">apartados de {soles(f.meta)} · {pct(ap.pct)} de la venta</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100" role="meter" aria-valuemin={0} aria-valuemax={f.meta} aria-valuenow={Math.max(0, ap.neto)} aria-label={`Apartado contra la meta de ${soles(f.meta)}`}>
              <div className={`h-full rounded-full ${ESTADO[e].barra}`} style={{ width: `${avance}%` }} />
            </div>
            {detalle && <p className="mt-1 text-[11px] leading-snug text-gray-400">{detalle}.</p>}
            <p className="mt-1 text-[11px] leading-snug text-gray-600">{e === "cumple" ? "Apartaste la utilidad completa." : `Faltaron ${soles(f.falta ?? 0)} para la meta.`}</p>
            {f.retiroAjeno > 0 && (
              <p className="mt-1 text-[11px] leading-snug text-red-700">Se sacaron {soles(f.retiroAjeno)} del ahorro que no fueron para pagar utilidades: la reserva debe ser intocable.</p>
            )}
          </Bloque>

          <Bloque n="2" titulo={`La operación con el ${op.limitePct}%`}>
            <p className="text-xs text-gray-700 tabular-nums">
              Operar costó <b>{soles(op.monto)}</b> · {pct(op.pct)} de la venta · límite {pct(op.limitePct)} ({soles(op.limite)})
            </p>
            {op.dentro ? (
              <p className="mt-1 text-[11px] leading-snug text-emerald-700">Dentro del límite.</p>
            ) : (
              <p className="mt-1 text-[11px] leading-snug text-amber-800">
                Se pasó {soles(op.exceso)}. Es un tema de eficiencia en los costos y procesos, no de ventas bajas: vender más no lo arregla.
                {f.fugas && (f.fugas.costos >= 1 || f.fugas.fijos >= 1) && (
                  <> Las fugas: {[f.fugas.costos >= 1 ? `${soles(f.fugas.costos)} en costos variables` : null, f.fugas.fijos >= 1 ? `${soles(f.fugas.fijos)} en costos fijos` : null].filter(Boolean).join(" y ")} sobre su parte de la regla.</>
                )}
              </p>
            )}
          </Bloque>

          <Bloque n="3" titulo="EBITDA y socios">
            <p className="text-xs text-gray-700 tabular-nums">
              La operación dejó <b>{soles(f.ebitda)}</b> · {pct(f.ebitdaPct)} · objetivo {pct(f.ebitdaObjetivoPct)} = {pct(f.utilidadPct)} utilidad + {pct(f.restoPct)} impuestos y reinversión
            </p>
            {f.operacionAlcanza === false && (
              <p className="mt-1 text-[11px] leading-snug text-amber-800">La operación no dejó ni para la utilidad ({soles(f.meta)}): primero hay que subir el EBITDA.</p>
            )}
            {f.sueldoSocios > 0 && (
              <p className="mt-1 text-[11px] leading-snug text-gray-600">
                {f.sociosDeUtilidad
                  ? <>Los socios cobraron {soles(f.sueldoSocios)}: se pagan de la utilidad. Después de pagarles queda <b className={f.utilidadTrasSocios !== null && f.utilidadTrasSocios < 0 ? "text-red-700" : ""}>{soles(f.utilidadTrasSocios ?? 0)}</b>.</>
                  : <>Sueldo de los socios {soles(f.sueldoSocios)}: hoy va dentro de la planilla, no de la utilidad.</>}
              </p>
            )}
          </Bloque>
        </div>
      ) : (
        <p className="mt-2 text-xs text-gray-400">{f.sinResultadoPorque ?? "Sin datos"}: todavía no se puede medir.</p>
      )}
    </div>
  );
}

/** Los ajustes del CEO: el % de utilidad, el EBITDA objetivo y dónde se pagan los socios. */
function Ajustes({ config, guardable }: { config: ConfigProfitFirst; guardable: boolean }) {
  const router = useRouter();
  const [u, setU] = useState(String(Math.round(config.utilidadPct * 100) / 100));
  const [e, setE] = useState(String(Math.round(config.ebitdaPct * 100) / 100));
  const [socios, setSocios] = useState(config.sociosDeUtilidad);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, startTransition] = useTransition();
  const nuevo: ConfigProfitFirst = { utilidadPct: Number(u.replace(",", ".")), ebitdaPct: Number(e.replace(",", ".")), sociosDeUtilidad: socios };
  const problema = validarConfig(nuevo);
  const igual = nuevo.utilidadPct === Math.round(config.utilidadPct * 100) / 100 && nuevo.ebitdaPct === Math.round(config.ebitdaPct * 100) / 100 && nuevo.sociosDeUtilidad === config.sociosDeUtilidad;
  const guardar = () => {
    setMsg(null);
    startTransition(async () => {
      const r = await guardarConfigProfitFirst(nuevo);
      if (r.ok) { setMsg({ ok: true, texto: "Guardado." }); router.refresh(); } else setMsg({ ok: false, texto: r.error });
    });
  };
  return (
    <details className="group rounded-xl border border-gray-100 px-4 py-3">
      <summary className="cursor-pointer list-none text-xs font-medium text-primary hover:underline">
        <span className="group-open:hidden">Ajustar los porcentajes</span><span className="hidden group-open:inline">Ocultar los ajustes</span>
      </summary>
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs text-gray-600">
            Utilidad que se aparta (% de la venta)
            <input type="number" inputMode="decimal" min={1} max={60} step={0.5} value={u} onChange={(ev) => setU(ev.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm tabular-nums text-gray-900" />
          </label>
          <label className="block text-xs text-gray-600">
            EBITDA objetivo (% de la venta)
            <input type="number" inputMode="decimal" min={1} max={80} step={0.5} value={e} onChange={(ev) => setE(ev.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm tabular-nums text-gray-900" />
          </label>
        </div>
        <label className="flex items-start gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={socios} onChange={(ev) => setSocios(ev.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300" />
          <span>
            Pagar el sueldo de los socios de la utilidad
            <span className="block text-[11px] text-gray-500">
              Activado: el sueldo de los socios sale del EBITDA y de los costos fijos, y se descuenta de la utilidad (el modelo de tu coach). Apagado: sigue dentro de la planilla, como hoy. La Ganancia real no cambia.
            </span>
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={guardar} disabled={pendiente || !!problema || igual || !guardable}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-40">
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
          {problema && <span className="text-[11px] text-red-700">{problema}</span>}
          {!guardable && <span className="text-[11px] text-amber-700">Los ajustes todavía no están activados: falta crearlos una sola vez (lo hace Claude con tu OK).</span>}
          {msg && <span className={`text-[11px] ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.texto}</span>}
        </div>
      </div>
    </details>
  );
}

export function ProfitFirst({ cifras, periodo }: { cifras: SeisCifras | null; periodo: string }) {
  if (!cifras) return null;
  const filas = profitFirst(cifras);
  const c = cifras.config;
  const [y, m] = cifras.mes.split("-").map(Number);
  const finDeMes = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const g = filas.find((x) => x.esGrupo);
  const resumen = g?.apartado && g.estado
    ? <p className="text-xs text-gray-600">Grupo: apartaste <b className={ESTADO[g.estado].num}>{soles(g.apartado.neto)}</b> de {soles(g.meta ?? 0)} · {pct(g.apartado.pct)} de la venta (meta {pct(c.utilidadPct)})</p>
    : <p className="text-xs text-gray-500">Todavía sin datos para {periodo}.</p>;

  return (
    <SeccionDesplegable
      titulo="Profit First · apartar la utilidad primero"
      subtitulo={`Se aparta el ${pct(c.utilidadPct)} de la venta antes de pagar nada; la operación vive con el ${pct(100 - c.utilidadPct)} restante. Sale del EBITDA objetivo (${pct(c.ebitdaPct)}): el resto, ${pct(c.ebitdaPct - c.utilidadPct)}, es para impuestos y reinversión.`}
      resumen={resumen}
    >
      <div className="space-y-3">
        <Ajustes key={`${c.utilidadPct}-${c.ebitdaPct}-${c.sociosDeUtilidad}`} config={c} guardable={cifras.configGuardable} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filas.map((f) => <Tarjeta key={f.etiqueta} f={f} finDeMes={finDeMes} />)}
        </div>
        <p className="text-[11px] leading-relaxed text-gray-500">
          «Apartado» es lo que de verdad quedó guardado para los socios en {periodo.toLowerCase()}: lo mandado a fondos mutuos (la cuenta de la utilidad), menos lo que se sacó de ahí, más las utilidades ya pagadas
          (esas salen de un rescate del ahorro, por eso se suman). Sale de las filas del Excel, no hay nada nuevo que llenar. La idea: separar la utilidad primero, no esperar a ver qué sobra;
          y si con el resto no alcanza, corregir la operación, no vender más.
        </p>
      </div>
    </SeccionDesplegable>
  );
}
