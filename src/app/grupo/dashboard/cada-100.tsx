/**
 * «De cada S/ 100 que vendes» (pedido de Jahnn, 29-oct-2026): la regla 33-33-33 y Profit First en cinco líneas —costos
 * variables, costos fijos, EBITDA, utilidad apartada e impuestos/inversión/deudas— cada una con su meta marcada en la
 * barra y su semáforo. Lógica: lib/cada-100.ts. Va en la tarjeta de cada sede y en la del Grupo; reemplaza al
 * termómetro suelto del EBITDA.
 *
 * Mes abierto: el EBITDA es una ESTIMACIÓN (fijos del presupuesto o promedio de los meses cerrados, sobre las ventas al
 * ritmo actual) y se dice con una etiqueta; así no se ve el 50% falso de mitad de mes.
 */

import { ETIQUETA_TERMOMETRO } from "@/lib/regla-33";
import type { Cada100, LineaCada100, Tono } from "@/lib/cada-100";

/** Las barras llegan hasta 60 de cada 100: ahí caben las metas (33, 25, 8) y los excesos se ven. */
const ESCALA = 60;
const BARRA: Record<Tono, string> = { bien: "bg-emerald-500", ojo: "bg-amber-400", mal: "bg-red-500", neutro: "bg-gray-300" };
const TEXTO: Record<Tono, string> = { bien: "text-emerald-700", ojo: "text-amber-700", mal: "text-red-700", neutro: "text-gray-700" };

const entero = (n: number) => `${n < 0 ? "−" : ""}${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const soles = (n: number) => `${n < 0 ? "−" : ""}S/ ${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

function Fila({ l, c }: { l: LineaCada100; c: Cada100 }) {
  const ancho = Math.max(0, Math.min(ESCALA, l.cien)) / ESCALA * 100;
  const palabra = l.clave === "ebitda" && c.termometro ? ETIQUETA_TERMOMETRO[c.termometro] : null;
  const etiquetaMeta = l.sentido === "tope" ? "tope" : "meta";
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2 text-[11px] leading-tight">
        <span className="min-w-0 font-medium text-gray-800" title={l.ayuda}>
          {l.etiqueta}{palabra && <span className={`font-semibold ${TEXTO[l.tono]}`}> · {palabra}</span>}
        </span>
        <span className="shrink-0 whitespace-nowrap tabular-nums text-gray-400">
          <b className={`text-sm font-semibold ${TEXTO[l.tono]}`}>{entero(l.cien)}</b> {etiquetaMeta} {entero(l.meta)}
        </span>
      </div>
      <div className="relative mt-1 h-2 rounded-full bg-gray-200" role="img" aria-label={`${l.etiqueta}: ${entero(l.cien)} de cada 100 (${etiquetaMeta} ${entero(l.meta)})`}>
        <span className={`absolute inset-y-0 left-0 rounded-full ${BARRA[l.tono]}`} style={{ width: `${ancho}%` }} />
        <span className="absolute -top-0.5 h-3 w-0.5 rounded bg-gray-800" style={{ left: `${(l.meta / ESCALA) * 100}%` }} aria-hidden />
      </div>
      {l.nota && <p className="mt-0.5 text-[10px] leading-tight text-gray-400">{l.nota}</p>}
    </li>
  );
}

export function CadaCien({ c }: { c: Cada100 }) {
  if (c.modo === "sin-datos") {
    return <p className="mt-4 rounded-xl bg-gray-50 px-3 py-2.5 text-[11px] text-gray-400">EBITDA: todavía sin datos{c.porque ? ` (${c.porque.charAt(0).toLowerCase()}${c.porque.slice(1)})` : ""}.</p>;
  }
  const estimado = c.modo === "estimado";
  return (
    <div className="mt-4 rounded-xl bg-gray-50 px-3 py-3" role="group" aria-label={`De cada S/ 100 que vende ${c.sede}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-gray-500">De cada S/ 100 que vendes</span>
        {estimado && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">Estimado al cierre</span>}
        {!estimado && c.provisional && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">provisional</span>}
      </div>
      <ul className="mt-2.5 space-y-2.5">{c.lineas.map((l) => <Fila key={l.clave} l={l} c={c} />)}</ul>
      <p className="mt-3 border-t border-gray-200 pt-2 text-[11px] leading-snug text-gray-500">
        {estimado ? (
          <>
            {c.businessId === null ? "Ventas a clientes del mes al ritmo actual (sin contar lo que Atelier le vende a Fonavi y Centro)" : "Ventas del mes al ritmo actual"}: <b className="text-gray-700">{soles(c.ventas ?? 0)}</b>. Fijos del mes: <b className="text-gray-700">{soles(c.fijosEsperados ?? 0)}</b>{" "}
            ({c.fuenteFijos === "presupuesto" ? "presupuesto aprobado" : "promedio de los meses cerrados"}).
          </>
        ) : (
          c.caja !== null && <>Lo que quedó en caja del mes: <b className={c.caja < 0 ? "text-red-700" : "text-gray-700"}>{soles(c.caja)}</b>.</>
        )}
        {estimado && c.caja !== null && <> En caja{c.corte ? ` hasta el ${ddmm(c.corte)}` : ""}: <b className={c.caja < 0 ? "text-red-700" : "text-gray-700"}>{soles(c.caja)}</b>.</>}
      </p>
    </div>
  );
}
