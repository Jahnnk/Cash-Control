"use client";

/**
 * Flujo de caja mensual: barras de lo que entró y salió cada mes y la línea
 * del flujo neto acumulado (pedido de Jahnn, 3-oct-2026, idea de un libro).
 * Un solo gráfico con selector de sede. Los números y la regla del acumulado:
 * src/lib/flujo-caja.ts. Va plegado: el resumen ya dice el mes y el acumulado.
 *
 * El ahorro no se ve como pérdida: lo que se depositó a fondos mutuos y lo
 * pagado a socios es un tramo APARTE de la barra de salidas, lo rescatado es
 * un tramo aparte de la de entradas, y la línea no los cuenta (corrección de
 * Jahnn: Centro mandó S/32,700 al fondo y el gráfico lo mostraba como pérdida).
 */

import { useMemo, useState } from "react";
import { SeccionDesplegable } from "@/components/productos/ui";
import { formatCurrency } from "@/lib/utils";
import { armarSerie, sumarSedes, textoMovimientosAhorro, entroOperativo, salioOperativo, type PuntoFlujo } from "@/lib/flujo-caja";
import type { FlujoCaja } from "@/app/actions/flujo-caja";

const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const corto = (m: string) => MESES_CORTO[Number(m.slice(5, 7)) - 1];
const largo = (m: string) => `${MESES_LARGO[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

const VERDE = "#098B5F";
const VERDE_CLARO = "#A7D8C4";
const ROJO = "#C0392B";
const AZUL = "#5B8DB8";
const AMBAR = "#D9A441";
const AMBAR_TEXTO = "#A7771B";

const W = 760, ML = 52, MR = 28;
// Dos paneles que comparten los meses: arriba las barras, abajo el acumulado con SU escala
// (el acumulado es una diferencia pequeña entre dos números grandes: en la misma escala no se vería).
const MT = 26, P1 = 190, GAP = 52, P2 = 92, MB = 34;
const H = MT + P1 + GAP + P2 + MB;

const soles0 = (n: number) => `${n < 0 ? "−" : ""}S/ ${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const miles = (n: number) => `${n < 0 ? "−" : ""}${(Math.abs(n) / 1000).toLocaleString("es-PE", { maximumFractionDigits: 1 })}k`;
const con = (n: number) => (n >= 0 ? "+" : "−") + formatCurrency(Math.abs(n));

/** Una escala "redonda" (1, 2, 5 × 10^k) con unas 4 marcas. */
function escala(min: number, max: number): { min: number; max: number; marcas: number[] } {
  const rango = Math.max(max - min, 1);
  const crudo = rango / 4;
  const pot = Math.pow(10, Math.floor(Math.log10(crudo)));
  const paso = [1, 2, 5, 10].map((k) => k * pot).find((p) => p >= crudo) ?? 10 * pot;
  const lo = Math.floor(min / paso) * paso, hi = Math.ceil(max / paso) * paso;
  const marcas: number[] = [];
  for (let v = lo; v <= hi + paso / 2; v += paso) marcas.push(Math.round(v));
  return { min: lo, max: hi, marcas };
}

function Grafico({ puntos }: { puntos: PuntoFlujo[] }) {
  const [activo, setActivo] = useState<number | null>(null);
  const n = puntos.length;
  const pw = W - ML - MR;
  const banda = pw / n;
  const bw = Math.min(34, banda * 0.3);
  const cx = (i: number) => ML + banda * i + banda / 2;

  // Panel 1 · barras de entró y salió (cada una en dos tramos)
  const e1 = escala(0, Math.max(...puntos.map((p) => Math.max(p.entro, p.salio)), 1));
  const y1 = (v: number) => MT + P1 - ((v - e1.min) / (e1.max - e1.min)) * P1;
  const base = y1(0);
  const alto = (v: number) => Math.max(base - y1(Math.max(v, 0)), 0);

  // Panel 2 · flujo neto acumulado (sin mover el ahorro)
  const top2 = MT + P1 + GAP;
  const acum = puntos.map((p) => p.acumulado);
  const e2 = escala(Math.min(0, ...acum), Math.max(0, ...acum, 1));
  const y2 = (v: number) => top2 + P2 - ((v - e2.min) / (e2.max - e2.min)) * P2;
  const ultimo = puntos[n - 1];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
        aria-label={`Flujo de caja de ${puntos.map((p) => corto(p.mes)).join(", ")}: entradas, salidas y flujo neto acumulado sin mover el ahorro.`}>
        {/* Panel 1: cuadrícula tenue */}
        {e1.marcas.map((v) => (
          <g key={v}>
            <line x1={ML} x2={W - MR} y1={y1(v)} y2={y1(v)} stroke={v === 0 ? "#9CA3AF" : "#E5E7EB"} strokeWidth={v === 0 ? 1 : 0.75} strokeDasharray={v === 0 ? undefined : "3 4"} />
            <text x={ML - 8} y={y1(v) + 3.5} textAnchor="end" fontSize={10.5} fill="#6B7280">{v === 0 ? "0" : miles(v)}</text>
          </g>
        ))}

        {puntos.map((p, i) => {
          const xE = cx(i) - bw - 1, xS = cx(i) + 1;
          const hEop = alto(entroOperativo(p)), hResc = alto(p.rescate);
          const hSop = alto(salioOperativo(p)), hAh = alto(p.ahorro + p.reparto);
          const topE = base - hEop - hResc, topS = base - hSop - hAh;
          return (
            <g key={p.mes}>
              {activo === i && <rect x={ML + banda * i + 4} y={MT - 6} width={banda - 8} height={H - MT - MB + 12} rx={6} fill="#F3F4F6" />}
              {/* Entró: lo operativo abajo; lo que volvió del fondo, arriba y más claro */}
              <rect x={xE} y={base - hEop} width={bw} height={hEop} rx={hResc > 0 ? 0 : 3} fill={VERDE} />
              {hResc > 0 && <rect x={xE} y={base - hEop - hResc} width={bw} height={hResc} rx={3} fill={VERDE_CLARO} />}
              {/* Salió: lo que el negocio paga abajo; ahorro y socios arriba, en otro color */}
              <rect x={xS} y={base - hSop} width={bw} height={hSop} rx={hAh > 0 ? 0 : 3} fill={ROJO} />
              {hAh > 0 && <rect x={xS} y={base - hSop - hAh} width={bw} height={hAh} rx={3} fill={AZUL} />}
              <text x={xE + bw / 2} y={topE - 5} textAnchor="middle" fontSize={10} fill="#4B5563">{miles(p.entro)}</text>
              <text x={xS + bw / 2} y={topS - 5} textAnchor="middle" fontSize={10} fill="#4B5563">{miles(p.salio)}</text>
              <text x={cx(i)} y={H - MB + 22} textAnchor="middle" fontSize={12} fontWeight={activo === i ? 700 : 500} fill="#374151">{corto(p.mes)}</text>
            </g>
          );
        })}

        {/* Panel 2: flujo neto acumulado, con su propia escala */}
        <text x={ML} y={top2 - 22} fontSize={11} fontWeight={600} fill={AMBAR_TEXTO}>Flujo neto acumulado (sin mover el ahorro)</text>
        {e2.marcas.map((v) => (
          <g key={v}>
            <line x1={ML} x2={W - MR} y1={y2(v)} y2={y2(v)} stroke={v === 0 ? "#9CA3AF" : "#E5E7EB"} strokeWidth={v === 0 ? 1 : 0.75} strokeDasharray={v === 0 ? undefined : "3 4"} />
            <text x={ML - 8} y={y2(v) + 3.5} textAnchor="end" fontSize={10.5} fill="#6B7280">{v === 0 ? "0" : miles(v)}</text>
          </g>
        ))}
        <polyline points={puntos.map((p, i) => `${cx(i)},${y2(p.acumulado)}`).join(" ")} fill="none" stroke={AMBAR} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {puntos.map((p, i) => (
          <g key={p.mes}>
            <circle cx={cx(i)} cy={y2(p.acumulado)} r={p === ultimo ? 5.5 : 4} fill={AMBAR} stroke="#fff" strokeWidth={2} />
            <text x={cx(i)} y={y2(p.acumulado) - 11} textAnchor="middle" fontSize={p === ultimo ? 12 : 10.5} fontWeight={p === ultimo ? 700 : 500}
              fill={p.acumulado < 0 ? ROJO : AMBAR_TEXTO} stroke="#fff" strokeWidth={3.5} paintOrder="stroke">{soles0(p.acumulado)}</text>
          </g>
        ))}

        {/* Zonas de hover (más grandes que las barras) */}
        {puntos.map((p, i) => (
          <rect key={p.mes} x={ML + banda * i} y={MT - 6} width={banda} height={H - MT - MB + 12} fill="transparent" tabIndex={0}
            aria-label={`${largo(p.mes)}: entró ${soles0(p.entro)}, salió ${soles0(p.salio)}, flujo ${soles0(p.flujo)}, flujo sin mover el ahorro ${soles0(p.neto)}, acumulado ${soles0(p.acumulado)}`}
            onMouseEnter={() => setActivo(i)} onMouseLeave={() => setActivo(null)} onFocus={() => setActivo(i)} onBlur={() => setActivo(null)}
            onClick={() => setActivo(activo === i ? null : i)} style={{ outline: "none", cursor: "pointer" }} />
        ))}
      </svg>

      {activo !== null && (() => {
        const p = puntos[activo];
        const ahorro = textoMovimientosAhorro(p);
        const izq = Math.min(Math.max((cx(activo) / W) * 100, 18), 82);
        return (
          <div className="pointer-events-none absolute top-0 -translate-x-1/2 w-64 rounded-xl border border-gray-200 bg-white p-3 text-xs shadow-lg" style={{ left: `${izq}%` }}>
            <div className="font-semibold text-gray-900 capitalize">{largo(p.mes)}</div>
            <dl className="mt-1.5 space-y-0.5 tabular-nums">
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Entró</dt><dd className="font-medium text-gray-900">{formatCurrency(p.entro)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Salió</dt><dd className="font-medium text-gray-900">{formatCurrency(p.salio)}</dd></div>
              <div className="flex justify-between gap-3 border-t border-gray-100 pt-0.5"><dt className="text-gray-500">Flujo del mes</dt><dd className={`font-medium ${p.flujo < 0 ? "text-red-600" : "text-gray-900"}`}>{con(p.flujo)}</dd></div>
              {ahorro && <div className="flex justify-between gap-3"><dt className="text-gray-500">Sin mover el ahorro</dt><dd className={`font-semibold ${p.neto < 0 ? "text-red-600" : "text-gray-900"}`}>{con(p.neto)}</dd></div>}
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Acumulado</dt><dd className="font-semibold" style={{ color: AMBAR_TEXTO }}>{con(p.acumulado)}</dd></div>
            </dl>
            {ahorro && <p className="mt-1.5 border-t border-gray-100 pt-1.5 text-[11px] leading-snug text-sky-700">{ahorro}</p>}
          </div>
        );
      })()}

      {/* Para lectores de pantalla: los mismos números en una tabla */}
      <table className="sr-only">
        <caption>Flujo de caja por mes</caption>
        <thead><tr><th>Mes</th><th>Entró</th><th>Salió</th><th>Flujo</th><th>Flujo sin mover el ahorro</th><th>Acumulado</th></tr></thead>
        <tbody>{puntos.map((p) => <tr key={p.mes}><td>{largo(p.mes)}</td><td>{soles0(p.entro)}</td><td>{soles0(p.salio)}</td><td>{soles0(p.flujo)}</td><td>{soles0(p.neto)}</td><td>{soles0(p.acumulado)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function BarrasFlujoDeCaja({ flujo }: { flujo: FlujoCaja | null }) {
  const opciones = useMemo(() => {
    if (!flujo) return [];
    const porId = (id: number) => flujo.sedes.find((s) => s.businessId === id);
    return [
      { id: 0, nombre: "Grupo", meses: sumarSedes(flujo.sedes.map((s) => s.meses)) },
      ...[2, 3, 1].map(porId).filter((s): s is NonNullable<typeof s> => !!s).map((s) => ({ id: s.businessId, nombre: s.sede, meses: s.meses })),
    ];
  }, [flujo]);
  const [id, setId] = useState(0);
  if (!flujo || opciones.length === 0) return <p className="text-sm text-gray-500">No se pudo calcular el flujo de caja.</p>;
  const elegida = opciones.find((o) => o.id === id) ?? opciones[0];
  const puntos = armarSerie(elegida.meses, 6);
  const hayAhorro = puntos.some((p) => p.ahorro + p.reparto + p.rescate > 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Sede" className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          {opciones.map((o) => (
            <button key={o.id} type="button" role="tab" aria-selected={o.id === elegida.id} onClick={() => setId(o.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${o.id === elegida.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {o.nombre}
            </button>
          ))}
        </div>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
          <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: VERDE }} />Entró</li>
          <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: ROJO }} />Salió</li>
          {hayAhorro && <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: AZUL }} />Al ahorro y socios</li>}
          {hayAhorro && <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: VERDE_CLARO }} />Rescatado del ahorro</li>}
          <li className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: AMBAR }} />Flujo neto acumulado</li>
        </ul>
      </div>

      {puntos.length === 0
        ? <p className="mt-6 text-sm text-gray-400">Esta sede todavía no tiene movimientos hasta este mes.</p>
        : <div className="mt-4"><Grafico key={elegida.id} puntos={puntos} /></div>}

      <p className="mt-3 text-[11px] text-gray-400 leading-relaxed">
        La altura de cada barra es lo que entró y salió según el Excel (igual que la tarjeta Caja). Lo que se mandó a fondos mutuos y las utilidades pagadas a los socios van en azul, y lo rescatado en verde claro: mover plata al ahorro no es perderla, así que la línea no lo cuenta. El acumulado suma los flujos desde que llevamos el control en el sistema; no es el saldo del banco.
      </p>
    </div>
  );
}

export function FlujoDeCaja({ flujo, periodo }: { flujo: FlujoCaja | null; periodo: string }) {
  const grupo = flujo ? armarSerie(sumarSedes(flujo.sedes.map((s) => s.meses)), 6) : [];
  const ultimo = grupo[grupo.length - 1];
  const resumen = ultimo
    ? <p className="text-xs text-gray-600">
        {periodo}: entró {soles0(ultimo.entro)} · salió {soles0(ultimo.salio)}. Sin mover el ahorro, el flujo del mes fue <strong className={ultimo.neto < 0 ? "text-red-600" : "text-gray-800"}>{con(ultimo.neto)}</strong> y el acumulado va en <strong className="text-gray-800">{con(ultimo.acumulado)}</strong>.
      </p>
    : <p className="text-xs text-gray-500">Sin movimientos para {periodo}.</p>;
  return (
    <SeccionDesplegable
      titulo={`Flujo de caja · hasta ${periodo}`}
      subtitulo="Lo que entró y salió cada mes, y cuánto va juntando el negocio sin contar lo que se manda al ahorro."
      resumen={resumen}
    >
      <BarrasFlujoDeCaja flujo={flujo} />
    </SeccionDesplegable>
  );
}
