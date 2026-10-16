"use client";

/**
 * «Los cuatro motores del EBITDA» (pedido de Jahnn, 15-oct-2026, de la asesoría con su coach):
 * ventas, costo del producto, costos fijos y eficiencia del sistema. Cuando el EBITDA sale bajo,
 * la causa es un desbalance de estos motores: arriba dice cuál frena más (en soles) y cada
 * motor muestra su estado, su cifra contra la meta y una frase. El selector cambia de sede.
 * Cálculo: lib/motores-ebitda.ts · datos: lib/motores-ebitda-sql.ts.
 */

import { useState } from "react";
import { Gauge, Package, Building2, Settings2 } from "lucide-react";
import { SeccionDesplegable, Segmentado } from "@/components/productos/ui";
import type { EstadoMotor, Motor, Motores } from "@/lib/motores-ebitda";

const soles = (n: number) => `S/${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;

export const ESTILO_MOTOR: Record<EstadoMotor, { punto: string; chip: string; texto: string; etiqueta: string }> = {
  verde: { punto: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-800 ring-emerald-200", texto: "text-emerald-700", etiqueta: "En su lugar" },
  ambar: { punto: "bg-amber-400", chip: "bg-amber-50 text-amber-800 ring-amber-200", texto: "text-amber-700", etiqueta: "Cuidado" },
  rojo: { punto: "bg-red-500", chip: "bg-red-50 text-red-700 ring-red-200", texto: "text-red-700", etiqueta: "Fuera de meta" },
  gris: { punto: "bg-gray-300", chip: "bg-gray-100 text-gray-500 ring-gray-200", texto: "text-gray-400", etiqueta: "Sin dato" },
};

const ICONO = { ventas: Gauge, producto: Package, fijos: Building2, eficiencia: Settings2 } as const;

function TarjetaMotor({ m, frena }: { m: Motor; frena: boolean }) {
  const e = ESTILO_MOTOR[m.estado];
  const Icono = ICONO[m.clave];
  return (
    <div className={`min-w-0 rounded-xl border px-4 py-3.5 ${frena ? "border-amber-300 bg-amber-50/40" : "border-gray-100"}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900"><Icono className="h-4 w-4 text-gray-400" aria-hidden />{m.titulo}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${e.chip}`}>{frena ? "El que más frena" : e.etiqueta}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <span className={`text-2xl font-bold tabular-nums leading-none ${m.estado === "gris" ? "text-gray-400" : e.texto}`}>{m.cifra}</span>
        {m.meta && <span className="text-xs text-gray-500">{m.meta}</span>}
      </div>
      {m.quita !== null && m.quita >= 1 && (
        <p className="mt-1.5 text-[11px] font-medium text-amber-800">Le quita {soles(m.quita)} al EBITDA</p>
      )}
      <p className="mt-1.5 text-[11px] leading-snug text-gray-600">{m.frase}</p>
      {m.senales && m.senales.length > 0 && (
        <ul className="mt-2.5 space-y-1.5 border-t border-gray-100 pt-2.5">
          {m.senales.map((s) => (
            <li key={s.clave} className="flex items-start gap-2 text-[11px] leading-snug">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${ESTILO_MOTOR[s.estado].punto}`} aria-hidden />
              <span className="min-w-0 text-gray-700"><b className="font-medium">{s.etiqueta}</b> <span className="text-gray-500">· {s.detalle}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MotoresEbitda({ motores, periodo }: { motores: Motores[] | null; periodo: string }) {
  const [elegida, setElegida] = useState(motores?.find((x) => x.esGrupo)?.etiqueta ?? motores?.[0]?.etiqueta ?? "");
  if (!motores || motores.length === 0) return null;
  const orden = [...motores.filter((x) => x.esGrupo), ...motores.filter((x) => !x.esGrupo)];
  const actual = orden.find((x) => x.etiqueta === elegida) ?? orden[0];
  const g = orden.find((x) => x.esGrupo);

  const resumen = g ? <p className="text-xs text-gray-600">{g.etiqueta}: {g.titular}</p> : <p className="text-xs text-gray-500">Todavía sin datos para {periodo}.</p>;

  return (
    <SeccionDesplegable
      titulo="Los cuatro motores del EBITDA"
      subtitulo="Ventas, costo del producto, costos fijos y eficiencia del sistema: cuando el EBITDA sale bajo, la causa está en uno de estos motores."
      resumen={resumen}
    >
      <div className="space-y-4">
        <Segmentado tamano="sm" valor={actual.etiqueta} onChange={setElegida} opciones={orden.map((x) => ({ valor: x.etiqueta, etiqueta: x.etiqueta }))} />
        <p className="text-[15px] font-medium leading-snug text-gray-900">{actual.titular}</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {actual.motores.map((m) => <TarjetaMotor key={m.clave} m={m} frena={actual.frena === m.clave} />)}
        </div>
        <p className="text-[11px] leading-relaxed text-gray-500">
          Los tres primeros son plata y se reparten, sin contar nada dos veces, lo que le falta al EBITDA para llegar a su meta: el costo del producto, lo que los costos fijos se pasaron de su tercio y,
          dentro de eso, la parte que se debe a vender menos de lo esperado (los fijos se reparten entre menos ventas). La venta esperada es la meta del presupuesto aprobado o, si no hay, la venta típica de los últimos meses.
          El cuarto no es plata: es un semáforo con lo que el sistema puede comprobar (mermas, tiempos de atención, registro diario, reportes del sábado, Highlight y supervisiones), nunca casillas que alguien marca.
          En las cafeterías, el costo del producto incluye lo que le compran a Atelier a precio interno.
        </p>
      </div>
    </SeccionDesplegable>
  );
}
