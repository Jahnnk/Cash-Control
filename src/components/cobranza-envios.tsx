"use client";

/**
 * Lo que le deben a Atelier según Finanzas de Yayi's Envíos (20-nov-2026), con su antigüedad. Se usa en
 * Atelier → Clientes y en Reportes → Atelier B2B. Un solo cerebro: la cifra la calcula Envíos.
 */

import { useEffect, useState } from "react";
import { ExternalLink, HandCoins } from "lucide-react";
import { getCobranzaEnvios, type CobranzaEnvios, type Tramos } from "@/app/actions/cobranza-envios";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TRAMOS: { k: keyof Tramos; label: string }[] = [
  { k: "0-15", label: "Hasta 15 días" }, { k: "16-30", label: "16 a 30 días" }, { k: "+30", label: "Más de 30 días" },
];

/** Carga sola. `datos` permite pasarla ya leída (para no pedirla dos veces). */
export function CobranzaEnviosCard({ datos: inicial }: { datos?: CobranzaEnvios | null }) {
  const [datos, setDatos] = useState<CobranzaEnvios | null | undefined>(inicial);
  useEffect(() => {
    if (inicial !== undefined) return;
    let vivo = true;
    void getCobranzaEnvios().then((r) => { if (vivo) setDatos(r.ok ? r.datos : null); });
    return () => { vivo = false; };
  }, [inicial]);

  if (datos === undefined) return <div className="h-48 animate-pulse rounded-2xl border border-gray-200/80 bg-white" aria-label="Cargando cuentas por cobrar" />;
  if (datos === null) {
    return <p className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">No pude leer Finanzas de Yayi&apos;s Envíos. Intenta de nuevo en un momento.</p>;
  }

  const filas = [
    ...datos.sedes.map((s) => ({ clave: s.sede, nombre: s.nombre, detalle: `${s.comprobantes} comprobante${s.comprobantes === 1 ? "" : "s"}`, saldo: s.saldo, tramos: s.tramos })),
    { clave: "b2b", nombre: "Clientes B2B", detalle: `${datos.b2b.clientes} cliente${datos.b2b.clientes === 1 ? "" : "s"}`, saldo: datos.b2b.saldo, tramos: datos.b2b.tramos },
  ];

  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="cobranza-envios-titulo">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-600"><HandCoins className="h-5 w-5" aria-hidden /></span>
          <div>
            <h2 id="cobranza-envios-titulo" className="text-base font-bold text-gray-900">Te deben a Atelier</h2>
            <p className="text-xs text-gray-500">Lo que Luis lleva en Finanzas de Yayi&apos;s Envíos: Fonavi, Centro y clientes B2B.</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold tabular-nums text-gray-900">{soles(datos.total)}</p>
          {datos.masDe30 > 0 && <p className="text-xs font-medium text-red-600">{soles(datos.masDe30)} con más de 30 días</p>}
        </div>
      </header>

      {/* Computadora: tabla. Celular: una tarjeta por fila. */}
      <div className="mt-4 hidden overflow-hidden rounded-xl border border-gray-100 sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 font-medium">Quién</th>
              <th className="px-3 py-2 text-right font-medium">Debe</th>
              {TRAMOS.map((t) => <th key={t.k} className="px-3 py-2 text-right font-medium">{t.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.map((f) => (
              <tr key={f.clave}>
                <td className="px-3 py-2.5"><span className="font-medium text-gray-900">{f.nombre}</span> <span className="text-xs text-gray-500">· {f.detalle}</span></td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">{soles(f.saldo)}</td>
                {TRAMOS.map((t) => (
                  <td key={t.k} className={`px-3 py-2.5 text-right tabular-nums ${t.k === "+30" && f.tramos[t.k] > 0 ? "font-semibold text-red-600" : "text-gray-600"}`}>{soles(f.tramos[t.k])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-4 space-y-2 sm:hidden">
        {filas.map((f) => (
          <li key={f.clave} className="rounded-xl border border-gray-100 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-gray-900">{f.nombre} <span className="text-xs font-normal text-gray-500">· {f.detalle}</span></span>
              <span className="font-semibold tabular-nums text-gray-900">{soles(f.saldo)}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
              {TRAMOS.map((t) => (
                <div key={t.k} className={`rounded-lg px-2 py-1 ${t.k === "+30" && f.tramos[t.k] > 0 ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-600"}`}>
                  <span className="block">{t.label}</span><span className="font-semibold tabular-nums">{soles(f.tramos[t.k])}</span>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <a href={datos.urlFinanzas} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary-light hover:text-primary">
        Ver el detalle en Finanzas de Envíos <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    </section>
  );
}
