"use client";

import { useState, useTransition } from "react";
import { Wallet, AlertTriangle, CheckCircle2, Pencil, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getPanelGasto, guardarSaldoSede, type PanelGasto } from "@/app/actions/puedo-gastar";
import { DIAS_COLCHON_MINIMO } from "@/lib/saldos-sede";

/**
 * "¿Podemos asumir este gasto?" — el panel de la refrigeradora.
 *
 * 9-sep-2026: se malogró la refrigeradora de Atelier, el técnico cobraba
 * S/3,400 y Kelly pidió por teléfono siete cifras. Jahnn entró al
 * sistema con el técnico esperando y no encontró ninguna: estaban
 * repartidas en cuatro pantallas y la de liquidez no existía.
 *
 * Este panel las junta en el orden en que Kelly las preguntó, y agrega
 * lo que él necesitaba de verdad: escribir "3400" y saber si alcanza.
 *
 * La regla del componente: el veredicto NUNCA va solo. Kelly no
 * preguntaba "¿alcanza?", preguntaba las cifras con las que ella iba a
 * decidir — así que las cifras van al lado, para poder defenderlas en la
 * llamada en vez de citar un semáforo.
 */

const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","set","oct","nov","dic"];
const mesCorto = (m: string) => MESES[Number(m.slice(5, 7)) - 1] ?? m;

const ESTILO = {
  alcanza_holgado: { caja: "bg-emerald-50 border-emerald-200", texto: "text-emerald-900", ic: "text-emerald-600" },
  alcanza_justo: { caja: "bg-amber-50 border-amber-300", texto: "text-amber-900", ic: "text-amber-600" },
  no_alcanza: { caja: "bg-red-50 border-red-300", texto: "text-red-900", ic: "text-red-600" },
  sin_datos: { caja: "bg-gray-50 border-gray-300", texto: "text-gray-800", ic: "text-gray-500" },
} as const;

export function PanelGastoCard({ inicial }: { inicial: PanelGasto }) {
  const [data, setData] = useState(inicial);
  const [monto, setMonto] = useState("");
  const [editando, setEditando] = useState(false);
  const [pending, start] = useTransition();

  const liq = data.liquidez;
  const e = ESTILO[liq.veredicto];
  const simulando = liq.monto > 0;

  function simular(valor: string) {
    setMonto(valor);
    const n = Number(valor.replace(/[^\d.]/g, ""));
    start(async () => {
      const r = await getPanelGasto(Number.isFinite(n) ? n : 0);
      if (r.ok) setData(r.data);
    });
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200/70 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" />
          ¿Podemos asumir este gasto?
        </h2>
        <button
          onClick={() => setEditando((v) => !v)}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-800"
        >
          <Pencil className="w-3 h-3" /> Registrar saldos
        </button>
      </div>

      {/* El simulador: escribes el monto y tienes la respuesta. */}
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs text-gray-500">Quiero gastar</label>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">S/</span>
          <input
            inputMode="decimal"
            value={monto}
            onChange={(ev) => simular(ev.target.value)}
            placeholder="3400"
            className="w-32 pl-8 pr-2 py-1.5 text-sm border border-gray-300 rounded-lg tabular-nums
                       focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        {pending && <span className="text-[11px] text-gray-400">calculando…</span>}
      </div>

      {/* El veredicto. Con datos débiles, el aviso encabeza la frase. */}
      <div className={`rounded-xl border px-3.5 py-3 ${e.caja}`}>
        <div className="flex items-start gap-2.5">
          {liq.veredicto === "alcanza_holgado" && !liq.datosDebiles
            ? <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${e.ic}`} />
            : <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${e.ic}`} />}
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${e.texto}`}>
              {simulando ? liq.titular : `Hay ${formatCurrency(liq.disponibleTotal)} entre las tres sedes.`}
            </p>
            <p className="text-[11px] text-gray-500 mt-1">
              El colchón se mide contra los costos fijos del grupo
              ({formatCurrency(data.fijoDiarioGrupo)}/día: alquiler, planilla y servicios).
              Se considera holgado con {DIAS_COLCHON_MINIMO} días o más.
            </p>
          </div>
        </div>
      </div>

      {/* Liquidez por sede. */}
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        {liq.sedes.map((s) => (
          <div key={s.businessId} className="border border-gray-100 rounded-lg px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-gray-900">{s.nombre}</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">
                {s.fecha ? formatCurrency(s.disponible) : "—"}
              </span>
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              {s.fecha
                ? `${s.diasColchon !== null ? `${s.diasColchon} días de costos fijos` : "sin referencia"} · al ${s.fecha.slice(8)}/${s.fecha.slice(5, 7)}`
                : "sin saldo registrado"}
            </div>
            {s.avisos.map((a) => (
              <div key={a} className="text-[10px] text-amber-700 mt-1 leading-snug">⚠ {a}</div>
            ))}
          </div>
        ))}
      </div>

      {/* Las cifras que Kelly pidió, en el orden en que las pidió. */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase text-gray-400 border-b border-gray-100">
              <th className="text-left py-1.5 font-medium">Sede</th>
              {data.sedes[0]?.meses.map((m) => (
                <th key={m.month} className="text-right py-1.5 font-medium">{mesCorto(m.month)}</th>
              ))}
              <th className="text-right py-1.5 font-medium">Este mes</th>
              <th className="text-right py-1.5 font-medium">Proyección</th>
            </tr>
          </thead>
          <tbody>
            {data.sedes.map((s) => (
              <tr key={s.businessId} className="border-b border-gray-50">
                <td className="py-1.5 font-medium text-gray-900">{s.nombre}</td>
                {s.meses.map((m) => (
                  <td key={m.month} className="py-1.5 text-right tabular-nums">
                    <span className="text-gray-900">{formatCurrency(m.ventas)}</span>
                    <span className={`block text-[10px] ${m.resultado >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {m.resultado >= 0 ? "+" : ""}{formatCurrency(m.resultado)}
                    </span>
                  </td>
                ))}
                <td className="py-1.5 text-right tabular-nums text-gray-900">
                  {formatCurrency(s.enCurso.ventas)}
                  <span className="block text-[10px] text-gray-400">{s.enCurso.dias} días</span>
                </td>
                <td className="py-1.5 text-right tabular-nums font-medium text-gray-900">
                  {s.proyeccion !== null ? formatCurrency(s.proyeccion) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-gray-400 mt-1.5">
          Arriba la venta del mes; abajo el resultado (venta menos gasto operativo).
        </p>
      </div>

      {editando && <RegistroSaldos data={data} onListo={(d) => { setData(d); setEditando(false); }} />}
    </section>
  );
}

/** El formulario de saldos: tres sedes, dos campos cada una. */
function RegistroSaldos({ data, onListo }: { data: PanelGasto; onListo: (d: PanelGasto) => void }) {
  const [fecha, setFecha] = useState(data.todayISO);
  const [vals, setVals] = useState<Record<number, { banco: string; caja: string }>>(
    Object.fromEntries(data.liquidez.sedes.map((s) => [
      s.businessId,
      { banco: s.banco !== null ? String(s.banco) : "", caja: String(s.caja || "") },
    ])),
  );
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    setError(null);
    start(async () => {
      for (const s of data.liquidez.sedes) {
        const v = vals[s.businessId];
        const banco = v.banco.trim() === "" ? null : Number(v.banco);
        const caja = v.caja.trim() === "" ? 0 : Number(v.caja);
        if ((banco !== null && !Number.isFinite(banco)) || !Number.isFinite(caja)) {
          setError(`Revisa los montos de ${s.nombre}.`);
          return;
        }
        const r = await guardarSaldoSede({ businessId: s.businessId, fecha, banco, caja });
        if (!r.ok) { setError(r.error); return; }
      }
      const r = await getPanelGasto(data.liquidez.monto);
      if (r.ok) onListo(r.data);
    });
  }

  return (
    <div className="border-t border-gray-100 pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-900">Saldos al cierre del día</h3>
        <input
          type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
          className="text-xs border border-gray-300 rounded-lg px-2 py-1"
        />
      </div>
      <p className="text-[11px] text-gray-500">
        Abre el BCP de cada sede y copia el saldo disponible. La caja es el efectivo que
        hay físicamente. Es el único dato que el sistema no puede deducir solo.
      </p>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        {data.liquidez.sedes.map((s) => (
          <div key={s.businessId} className="border border-gray-100 rounded-lg px-3 py-2 space-y-1.5">
            <div className="text-xs font-medium text-gray-900">{s.nombre}</div>
            {(["banco", "caja"] as const).map((campo) => (
              <label key={campo} className="flex items-center gap-2">
                <span className="text-[11px] text-gray-500 w-11 capitalize">{campo}</span>
                <input
                  inputMode="decimal"
                  value={vals[s.businessId]?.[campo] ?? ""}
                  onChange={(ev) => setVals((p) => ({
                    ...p, [s.businessId]: { ...p[s.businessId], [campo]: ev.target.value },
                  }))}
                  placeholder="0.00"
                  className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-300 rounded tabular-nums
                             focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
            ))}
          </div>
        ))}
      </div>
      {error && <p className="text-[11px] text-red-700 flex items-center gap-1"><X className="w-3 h-3" />{error}</p>}
      <button
        onClick={guardar} disabled={pending}
        className="px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Guardar los tres saldos"}
      </button>
    </div>
  );
}
