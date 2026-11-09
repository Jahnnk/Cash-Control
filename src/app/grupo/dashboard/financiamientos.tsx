"use client";

/**
 * Deudas que estamos pagando mes a mes (Diners, deuda antigua, congeladora, préstamo familiar…) bajo «Movimiento de dinero»
 * (pedido de Jahnn, 9-nov-2026). Informativo: el capital que se devuelve no es gasto. Muestra cuánto sale por mes, cuánto se
 * pagó y cuánto falta; lo que no se sabe todavía dice «falta dato». Jahnn completa o corrige cada ficha aquí mismo
 * (lib/financiamientos.ts calcula; actions/financiamientos.ts guarda).
 */

import { useCallback, useEffect, useState } from "react";
import { Landmark, Loader2 } from "lucide-react";
import { getFinanciamientos, guardarFinanciamiento } from "@/app/actions/financiamientos";
import { cuotaMensualTotal, type EstadoFinanciamiento } from "@/lib/financiamientos";
import { useToast } from "@/components/toast-provider";

const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const SEDES: [number, string][] = [[1, "Atelier"], [2, "Fonavi"], [3, "Centro"]];
const num = (t: string): number | null | "mal" => { const v = t.trim().replace(/,/g, ""); if (!v) return null; const n = Number(v); return Number.isFinite(n) ? n : "mal"; };

function Ficha({ d, sedeInicial, onListo, onCancelar }: { d?: EstadoFinanciamiento; sedeInicial: number | null; onListo: () => void; onCancelar: () => void }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [sede, setSede] = useState(String(d?.businessId ?? sedeInicial ?? ""));
  const [nombre, setNombre] = useState(d?.nombre ?? "");
  const [acreedor, setAcreedor] = useState(d?.acreedor ?? "");
  const [monto, setMonto] = useState(d?.montoOriginal?.toString() ?? "");
  const [cuotasTotal, setCuotasTotal] = useState(d?.cuotasTotal?.toString() ?? "");
  const [cuota, setCuota] = useState(d?.cuota?.toString() ?? "");
  const [dia, setDia] = useState(d?.diaPago?.toString() ?? "");
  const [intereses, setIntereses] = useState(d?.incluyeIntereses === null || d?.incluyeIntereses === undefined ? "" : d.incluyeIntereses ? "si" : "no");
  const [patron, setPatron] = useState(d?.patron ?? "");
  const [desde, setDesde] = useState(d?.desde ?? "");

  async function guardar() {
    const m = num(monto), c = num(cuota), t = num(cuotasTotal), p = num(dia);
    if ([m, c, t, p].includes("mal")) { showToast("Revisa los números: solo cifras.", "error"); return; }
    setBusy(true);
    const r = await guardarFinanciamiento({
      id: d?.id, businessId: Number(sede), nombre, acreedor, patron, desde: desde || null,
      montoOriginal: m as number | null, cuota: c as number | null, cuotasTotal: t as number | null, diaPago: p as number | null,
      incluyeIntereses: intereses === "" ? null : intereses === "si",
    });
    setBusy(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(d ? "Ficha actualizada." : "Financiamiento registrado.", "success");
    onListo();
  }
  const campo = "w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm";
  const etiqueta = "text-xs text-gray-600";
  return (
    <div className="mt-2 rounded-xl bg-white/70 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={etiqueta}><span className="mb-1 block">Sede que paga</span>
          <select value={sede} onChange={(e) => setSede(e.target.value)} className={campo} disabled={!!d}>
            <option value="">Elige…</option>{SEDES.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select></label>
        <label className={etiqueta}><span className="mb-1 block">Nombre de la deuda</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Préstamo familiar" className={campo} /></label>
        <label className={etiqueta}><span className="mb-1 block">Quién dio la plata</span>
          <input value={acreedor} onChange={(e) => setAcreedor(e.target.value)} placeholder="Banco, familiar, socio…" className={campo} /></label>
        <label className={etiqueta}><span className="mb-1 block">Monto original (S/)</span>
          <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} className={`${campo} tabular-nums`} /></label>
        <label className={etiqueta}><span className="mb-1 block">Número de cuotas</span>
          <input inputMode="numeric" value={cuotasTotal} onChange={(e) => setCuotasTotal(e.target.value)} className={`${campo} tabular-nums`} /></label>
        <label className={etiqueta}><span className="mb-1 block">Cuota mensual (S/)</span>
          <input inputMode="decimal" value={cuota} onChange={(e) => setCuota(e.target.value)} className={`${campo} tabular-nums`} /></label>
        <label className={etiqueta}><span className="mb-1 block">Día del mes en que se paga</span>
          <input inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} className={`${campo} tabular-nums`} /></label>
        <label className={etiqueta}><span className="mb-1 block">¿La cuota trae intereses?</span>
          <select value={intereses} onChange={(e) => setIntereses(e.target.value)} className={campo}>
            <option value="">No sé todavía</option><option value="no">No, sin intereses</option><option value="si">Sí, trae intereses</option>
          </select></label>
        <label className={etiqueta}><span className="mb-1 block">Palabra que aparece en sus pagos del Excel (opcional)</span>
          <input value={patron} onChange={(e) => setPatron(e.target.value)} placeholder="diners" className={campo} /></label>
        <label className={etiqueta}><span className="mb-1 block">Contar pagos desde (opcional)</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={campo} /></label>
      </div>
      <p className="mt-2 text-[11px] text-gray-500">Los pagos se reconocen solos entre los egresos «Préstamos y tarjetas»: por la palabra del Excel o por el día y la cuota. Lo que dejes vacío queda como «falta dato».</p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={guardar} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar
        </button>
        <button type="button" onClick={onCancelar} className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
      </div>
    </div>
  );
}

export function Financiamientos({ sede }: { sede: number | null }) {
  const [datos, setDatos] = useState<{ deudas: EstadoFinanciamiento[]; sinDeuda: number } | null>(null);
  const [editando, setEditando] = useState<number | "nuevo" | null>(null);
  const cargar = useCallback(() => { void getFinanciamientos().then((r) => setDatos(r.ok ? { deudas: r.deudas, sinDeuda: r.sinDeuda.length } : { deudas: [], sinDeuda: 0 })); }, []);
  useEffect(() => { cargar(); }, [cargar]);
  if (!datos) return null;
  const ver = datos.deudas.filter((d) => !d.saldado && (sede === null || d.businessId === sede));
  const listo = () => { setEditando(null); cargar(); };
  return (
    <div className="mt-3 rounded-2xl bg-amber-50/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-sm text-gray-600"><Landmark className="h-4 w-4 text-amber-600" aria-hidden />Deudas que estamos pagando · sale cada mes</div>
        {ver.length > 0 && <b className="text-xl font-semibold tabular-nums text-gray-900">{soles(cuotaMensualTotal(ver))}</b>}
      </div>
      {ver.length === 0 && <p className="mt-1 text-sm text-gray-500">No hay deudas registradas{sede !== null ? " para esta sede" : ""}.</p>}
      <ul className="mt-1 divide-y divide-amber-100">
        {ver.map((d) => (
          <li key={d.id} className="py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-gray-700">{d.nombre} · {d.sede}</span>
              {d.saldo !== null
                ? <b className="text-lg font-semibold tabular-nums text-gray-900">falta {soles(d.saldo)}</b>
                : <span className="text-sm text-gray-400">falta dato</span>}
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
              {d.acreedor && <>{d.acreedor} · </>}
              {d.cuota !== null && <>Cuota {soles(d.cuota)}{d.diaPago ? ` (día ${d.diaPago})` : ""} · </>}
              pagado {soles(d.pagado)} en {d.cuotasPagadas} {d.cuotasPagadas === 1 ? "mes" : "meses"}
              {d.cuotasFaltan !== null && <> · faltan {d.cuotasFaltan} cuotas</>}
              {d.incluyeIntereses === true && <> · la cuota trae intereses</>}
              {d.faltaDato.length > 0 && <> · pendiente de saber: {d.faltaDato.join(", ")}</>}
            </p>
            <button type="button" onClick={() => setEditando(editando === d.id ? null : d.id)} aria-expanded={editando === d.id} className="mt-1 text-xs font-medium text-primary hover:underline">
              {editando === d.id ? "Cerrar" : "Completar datos"}
            </button>
            {editando === d.id && <Ficha d={d} sedeInicial={sede} onListo={listo} onCancelar={() => setEditando(null)} />}
          </li>
        ))}
      </ul>
      {datos.sinDeuda > 0 && <p className="mt-1 text-[11px] text-amber-700">{datos.sinDeuda} {datos.sinDeuda === 1 ? "pago" : "pagos"} de «Préstamos y tarjetas» todavía no se {datos.sinDeuda === 1 ? "reconoce" : "reconocen"} como de ninguna deuda.</p>}
      <button type="button" onClick={() => setEditando(editando === "nuevo" ? null : "nuevo")} aria-expanded={editando === "nuevo"} className="mt-1 text-xs font-medium text-primary hover:underline">
        {editando === "nuevo" ? "Cerrar" : "Registrar financiamiento nuevo"}
      </button>
      {editando === "nuevo" && <Ficha sedeInicial={sede} onListo={listo} onCancelar={() => setEditando(null)} />}
      <p className="mt-1 text-[11px] text-gray-500">Devolver el capital de una deuda no es gasto del negocio; solo lo son los intereses.</p>
    </div>
  );
}
