"use client";

/**
 * De la venta a la ganancia: tres barras por sede y por mes (Vendido →
 * Cobrado → Ganancia real). Pedido de Jahnn, 3-oct-2026, tomado de un libro:
 * "facturación, efectivo y beneficio". Los números y la regla de cada barra:
 * src/lib/venta-a-ganancia.ts. Va plegada: el resumen ya dice lo esencial.
 */

import { SeccionDesplegable } from "@/components/productos/ui";
import { barrasDelMes, type BarrasSede } from "@/lib/venta-a-ganancia";
import type { SeisCifras } from "@/app/actions/seis-cifras";

const ALTO = 112;
const dd = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const pct = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;

const BARRAS = [
  { clave: "vendido", n: 1, nombre: "Vendido", color: "bg-[#004C40]", texto: "text-[#004C40]" },
  { clave: "cobrado", n: 2, nombre: "Cobrado", color: "bg-[#098B5F]", texto: "text-[#098B5F]" },
  { clave: "ganancia", n: 3, nombre: "Ganancia real", color: "bg-[#D9A441]", texto: "text-[#A7771B]" },
] as const;

function Sede({ b }: { b: BarrasSede }) {
  const valores = { vendido: b.vendido, cobrado: b.cobrado, ganancia: b.ganancia };
  const tope = Math.max(b.vendido ?? 0, b.cobrado ?? 0, b.ganancia ?? 0, 1);
  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 p-5 min-w-0 flex flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-900">{b.sede}</h4>
        {b.corte && <span className="text-[11px] text-gray-400">hasta el {dd(b.corte)}</span>}
      </div>

      {!b.conBarras ? (
        <p className="mt-6 mb-2 text-sm text-gray-400">{b.vendido === null || b.vendido <= 0 ? "Sin ventas cargadas." : "Sin Excel de este mes."}</p>
      ) : (
        <>
          <div className="mt-4 flex items-end justify-between gap-3" style={{ height: ALTO + 44 }}>
            {BARRAS.map((x) => {
              const v = valores[x.clave];
              const negativa = v !== null && v < 0;
              const alto = v === null ? 0 : Math.max(Math.round((Math.max(v, 0) / tope) * ALTO), v !== 0 ? 4 : 0);
              return (
                <div key={x.clave} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full">
                  <span className={`mb-1.5 text-[13px] font-semibold tabular-nums whitespace-nowrap ${negativa ? "text-red-600" : x.texto}`}>
                    {v === null ? "—" : `${negativa ? "−" : ""}S/ ${Math.round(Math.abs(v)).toLocaleString("es-PE")}`}
                  </span>
                  {v === null
                    ? <div className="w-full rounded-t-md border border-dashed border-gray-300" style={{ height: 24 }} />
                    : <div className={`w-full rounded-t-md ${x.color}`} style={{ height: alto }} />}
                </div>
              );
            })}
          </div>
          <div className="border-t border-gray-300 flex justify-between gap-3 pt-2">
            {BARRAS.map((x) => (
              <div key={x.clave} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                <span className={`w-5 h-5 rounded-full text-[11px] font-semibold text-white flex items-center justify-center ${x.color}`}>{x.n}</span>
                <span className="text-[11px] font-medium text-gray-700 text-center leading-tight">{x.nombre}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-1.5 text-xs text-gray-500 leading-relaxed">
            {b.gananciaPct !== null
              ? <p><strong className="text-gray-800">{pct(b.gananciaPct)}</strong> de lo vendido queda como ganancia.</p>
              : <p>Sin ganancia todavía: {(b.sinGananciaPorque ?? "faltan datos").toLowerCase()}.</p>}
            {b.nota && <p>{b.nota}</p>}
          </div>
        </>
      )}
    </div>
  );
}

/** Las tres tarjetas de sede, ya sin el desplegable (así también se pueden mostrar abiertas). */
export function BarrasVentaAGanancia({ cifras, periodo }: { cifras: SeisCifras | null; periodo: string }) {
  const barras = cifras ? barrasDelMes(cifras.sedes) : [];
  if (barras.length === 0) return <p className="text-sm text-gray-500">No se pudieron calcular las cifras de {periodo}.</p>;
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{barras.map((b) => <Sede key={b.businessId} b={b} />)}</div>
      <p className="mt-3 text-[11px] text-gray-400 leading-relaxed">
        Vendido = ventas de Byte · Cobrado = lo que entró de esas ventas según el Excel (sin préstamos, rescates ni reembolsos) · Ganancia real = ventas − costos − gastos − impuestos. Todo hasta el último día con Excel de cada sede.
      </p>
    </>
  );
}

export function VentaAGanancia({ cifras, periodo }: { cifras: SeisCifras | null; periodo: string }) {
  const barras = cifras ? barrasDelMes(cifras.sedes) : [];
  const conGanancia = barras.filter((b) => b.gananciaPct !== null);
  const resumen = conGanancia.length > 0
    ? <p className="text-xs text-gray-600">{conGanancia.map((b) => `${b.sede} ${pct(b.gananciaPct!)}`).join(" · ")} de la venta queda como ganancia.</p>
    : <p className="text-xs text-gray-500">Todavía no hay ganancia calculada para {periodo}.</p>;
  return (
    <SeccionDesplegable
      titulo={`De la venta a la ganancia · ${periodo}`}
      subtitulo="Vender no es cobrar, y cobrar no es ganar: tres números distintos por sede."
      resumen={resumen}
    >
      <BarrasVentaAGanancia cifras={cifras} periodo={periodo} />
    </SeccionDesplegable>
  );
}
