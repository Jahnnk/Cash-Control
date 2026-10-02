"use client";

import { SeccionDesplegable } from "@/components/productos/ui";
import { formatCurrency } from "@/lib/utils";
import { desgloseDeNivel, ejemplosDeBono } from "@/lib/incentives/desglose-nivel";
import type { IncentiveLevel } from "@/lib/incentives/engine";

/**
 * «¿Cuánto gana el equipo en cada nivel?» — informativo, para que el
 * administrador pueda explicarle al equipo cómo se calcula el bono.
 *
 * Solo muestra TOTALES y el valor por hora de ESTA sede: no hay montos por
 * persona (eso lo ve solo la dirección en el reporte) ni nada de la otra sede.
 * La pantalla ya es de una sola sede: el administrador de Fonavi no abre la de
 * Centro, así que no puede compararlas.
 */
export function CuantoGanaCard({
  staff, levels, ticketBase, month, nivelAlcanzado,
}: {
  staff: { name: string; jornada: string; horasMes: number | null }[];
  levels: IncentiveLevel[];
  ticketBase: number;
  month: string;
  nivelAlcanzado: string | null;
}) {
  const personas = staff.map((s) => ({
    name: s.name,
    jornada: s.jornada as "tiempo_completo" | "medio_turno" | "administrador",
    horasMes: s.horasMes,
  }));
  const filas = levels.map((l) => ({ l, d: desgloseDeNivel(personas, l, month), ej: ejemplosDeBono(l) }));
  if (filas.length === 0) return null;
  const [n1, n2, n3] = filas;

  return (
    <SeccionDesplegable
      titulo="💰 ¿Cuánto gana el equipo en cada nivel?"
      subtitulo="Cuánto se reparte en total y cómo se calcula. Es informativo: sirve para explicarle al equipo cómo funciona."
      resumen={
        <span className="text-xs text-gray-700">
          {filas.map(({ l, d }) => `${l.nombre} ${formatCurrency(d.total)}`).join(" · ")}
        </span>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="py-1.5 font-medium">Nivel</th>
              <th className="py-1.5 font-medium text-right">Ticket meta</th>
              <th className="py-1.5 font-medium text-right">Valor por hora</th>
              <th className="py-1.5 font-medium text-right">Horas del equipo</th>
              <th className="py-1.5 font-medium text-right">Bonos por horas</th>
              <th className="py-1.5 font-medium text-right">Administración</th>
              <th className="py-1.5 font-medium text-right">Premio mejor vendedor</th>
              <th className="py-1.5 font-medium text-right">Total a repartir</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ l, d }) => (
              <tr key={l.nombre} className={`border-b border-gray-50 ${nivelAlcanzado === l.nombre ? "bg-emerald-50/60" : ""}`}>
                <td className="py-1.5 font-medium text-gray-900">{nivelAlcanzado === l.nombre && "✅ "}{l.nombre}</td>
                <td className="py-1.5 text-right text-gray-700">{formatCurrency(ticketBase + l.delta)}</td>
                <td className="py-1.5 text-right text-gray-700">S/{d.valorHora.toFixed(4)}</td>
                <td className="py-1.5 text-right text-gray-700">{d.horasEquipo.toLocaleString("es-PE", { maximumFractionDigits: 1 })} h</td>
                <td className="py-1.5 text-right">{formatCurrency(d.bonosPorHoras)}</td>
                <td className="py-1.5 text-right">{formatCurrency(d.administracion)}</td>
                <td className="py-1.5 text-right">{formatCurrency(d.premio)}</td>
                <td className="py-1.5 text-right font-bold text-gray-900">{formatCurrency(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 space-y-1.5 text-[11px] text-gray-600 leading-relaxed">
        <p>
          <strong>Cómo se calcula:</strong> el total es los <em>bonos por horas</em> + la <em>administración</em> + el <em>premio al mejor vendedor</em>.
          Cada persona cobra sus <strong>horas del mes</strong> (las de Planilla) por el <strong>valor por hora</strong> del nivel. La administración
          y el premio son montos fijos: la administración se paga una vez por puesto y el premio es para una sola persona.
        </p>
        {n1 && n2 && n3 && (
          <p>
            <strong>Ejemplo:</strong> una persona de medio turno con 94 horas gana {formatCurrency(n1.ej.medioTurno)} en el {n1.l.nombre},{" "}
            {formatCurrency(n2.ej.medioTurno)} en el {n2.l.nombre} y {formatCurrency(n3.ej.medioTurno)} en {n3.l.nombre}; una de tiempo completo
            con 192 horas gana {formatCurrency(n1.ej.tiempoCompleto)}, {formatCurrency(n2.ej.tiempoCompleto)} y {formatCurrency(n3.ej.tiempoCompleto)}.
            Más horas trabajadas en el mes, más bono.
          </p>
        )}
        <p>
          El ticket meta es la base de la sede más el aumento de cada nivel. Para cobrar, además hay que cumplir las condiciones del mes
          (ver «Tu bono de este mes»).
        </p>
      </div>
    </SeccionDesplegable>
  );
}
