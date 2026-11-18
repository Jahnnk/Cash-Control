"use client";

/**
 * «¿Qué precios subir?» (Grupo → Sistema de Dirección → Precios; antes en Productos). Pedido de Jahnn (17-nov-2026): para la próxima
 * carta, qué productos subir, cuánto y con qué riesgo, sin «subir por subir». Usa los mismos datos que
 * «¿Dónde ganamos plata?» (precio de carta o de Byte, costo de insumos del Excel de pricing): nada
 * nuevo que cargar ni guardar. Reglas y supuestos: lib/productos/subida-precios.ts. Va plegada.
 */

import { useEffect, useState } from "react";
import { getRentabilidadProductos } from "@/app/actions/productos-panorama";
import { esCafeteria } from "@/lib/productos/cafeterias";
import {
  NECESIDAD_ALTA_PCT, TOPE_SUBIR, subidaDePrecios,
  type FilaSubida, type Riesgo, type SubidaSede, type Veredicto,
} from "@/lib/productos/subida-precios";
import { ConPaso } from "./con-paso";
import { Pastilla, SeccionDesplegable, fechaCorta, nombreMes } from "@/components/productos/ui";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const soles0 = (n: number) => `${n < 0 ? "−" : "+"}S/ ${Math.abs(Math.round(n)).toLocaleString("es-PE")}`;
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`);
const finDeMes = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

const VEREDICTO: Record<Veredicto, { texto: string; tono: "verde" | "ambar" | "gris" }> = {
  subir: { texto: "Subir", tono: "verde" },
  "subir-poco": { texto: "Subir poco", tono: "ambar" },
  "no-tocar": { texto: "No tocar", tono: "gris" },
};
const RIESGO: Record<Riesgo, string> = {
  alto: "fácil de comparar",
  medio: "riesgo medio",
  bajo: "propio de Yayi's",
};

function Tabla({ filas }: { filas: FilaSubida[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm min-w-[760px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
            <th className="text-left font-medium py-2.5 pl-4 pr-3">Producto</th>
            <th className="text-right font-medium py-2.5 px-3">Precio hoy → nuevo</th>
            <th className="text-right font-medium py-2.5 px-3">Costo<div className="normal-case tracking-normal font-normal text-[10px]">insumos · para la cafetería</div></th>
            <th className="text-right font-medium py-2.5 px-3">Aguanta perder</th>
            <th className="text-right font-medium py-2.5 pl-3 pr-4">Extra al mes<div className="normal-case tracking-normal font-normal text-[10px]">igual · −5% · −10% de ventas</div></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filas.map((f) => (
            <tr key={f.nombre}>
              <td className="py-2.5 pl-4 pr-3 align-top max-w-[300px]">
                <div className="text-gray-900 leading-tight">{f.nombre}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Pastilla tono={VEREDICTO[f.veredicto].tono}>{VEREDICTO[f.veredicto].texto}</Pastilla>
                  <span className="text-[10px] text-gray-400">{RIESGO[f.riesgo]} · {f.unidades.toLocaleString("es-PE")} u</span>
                </div>
                <p className="mt-1 text-[11px] text-gray-500 leading-snug">{f.motivo}</p>
                {f.alertaInterno && f.costoCafeteria !== null && (
                  <p className="mt-1 text-[11px] text-amber-800 leading-snug">
                    Para la cafetería cuesta {pct(f.costoCafeteriaPct)} del precio: paga {soles(f.costoCafeteria)} de precio interno a Atelier. El problema es el precio interno, no el de carta.
                  </p>
                )}
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums align-top whitespace-nowrap">
                {f.precioNuevo !== null ? (
                  <>
                    <span className="text-gray-500">{soles(f.precio)}</span> → <span className="font-semibold text-gray-900">{soles(f.precioNuevo)}</span>
                    <div className="text-[10px] text-gray-400">+{pct(f.subidaPct)}</div>
                  </>
                ) : (
                  <>
                    <span className="text-gray-700">{soles(f.precio)}</span>
                    <div className="text-[10px] text-gray-400">se queda</div>
                  </>
                )}
                {!f.precioDeCarta && <div className="text-[10px] text-amber-700">promedio de Byte</div>}
              </td>
              <td className={`py-2.5 px-3 text-right tabular-nums align-top whitespace-nowrap ${f.costoPct > NECESIDAD_ALTA_PCT ? "text-amber-700 font-medium" : "text-gray-700"}`}>
                {pct(f.costoPct)}
                <div className="text-[10px] text-gray-400 font-normal">insumos</div>
                {f.deAtelier && f.costoCafeteriaPct !== null && (
                  <div className={`mt-1 ${f.costoCafeteriaPct > NECESIDAD_ALTA_PCT ? "text-amber-700 font-medium" : "text-gray-700"}`}>
                    {pct(f.costoCafeteriaPct)}
                    <div className="text-[10px] text-gray-400 font-normal">cafetería</div>
                  </div>
                )}
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums align-top whitespace-nowrap">
                {f.quiebrePct !== null ? (
                  <>
                    <span className="font-semibold text-gray-900">{pct(f.quiebrePct)}</span>
                    <div className="text-[10px] text-gray-400">de sus ventas</div>
                  </>
                ) : <span className="text-gray-400">—</span>}
              </td>
              <td className="py-2.5 pl-3 pr-4 text-right tabular-nums align-top whitespace-nowrap">
                {f.extraMes ? (
                  <>
                    <span className="font-semibold text-gray-900">{soles0(f.extraMes[0])}</span>
                    <div className="text-[10px]">
                      <span className={f.extraMes[1] < 0 ? "text-red-600" : "text-gray-500"}>{soles0(f.extraMes[1])}</span>
                      {" · "}
                      <span className={f.extraMes[2] < 0 ? "text-red-600" : "text-gray-500"}>{soles0(f.extraMes[2])}</span>
                    </div>
                  </>
                ) : <span className="text-gray-400">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Filtro = Veredicto | "candidatos" | "interno";
const FILTROS: { id: Filtro; texto: string }[] = [
  { id: "candidatos", texto: "Candidatos a subir" },
  { id: "subir", texto: "Subir" },
  { id: "subir-poco", texto: "Subir poco" },
  { id: "no-tocar", texto: "No tocar" },
  { id: "interno", texto: "Precio interno alto" },
];

function Cuerpo({ d }: { d: SubidaSede }) {
  const [filtro, setFiltro] = useState<Filtro>("candidatos");
  const visibles = d.filas.filter((f) => (filtro === "candidatos" ? f.veredicto !== "no-tocar" : filtro === "interno" ? f.alertaInterno : f.veredicto === filtro));
  const aMedias = d.hasta < finDeMes(d.mes);
  const candidatos = d.conteo.subir + d.conteo["subir-poco"];
  const cuenta = (id: Filtro) => (id === "candidatos" ? candidatos : id === "interno" ? d.conAlertaInterno : d.conteo[id]);

  return (
    <div className="space-y-5">
      {aMedias && <p className="text-[11px] text-amber-700">Mes a medias: el reporte de Byte llega hasta el {fechaCorta(d.hasta)}. Las cifras se llevan a un mes completo.</p>}

      <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-900 leading-relaxed">
        <strong>Desde abril no cambió ningún precio</strong>, así que todavía no se puede medir cuánto baja la venta cuando un precio sube.
        Por eso cada producto muestra cuánto <strong>aguanta perder</strong>: si pierde menos ventas que eso, la subida deja más plata.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Candidatos a subir</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{candidatos} de {d.filas.length}</div>
          <div className="text-xs text-gray-500">{d.conteo.subir} subir · {d.conteo["subir-poco"]} subir poco</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Extra al mes</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{soles0(d.extraTotal[0])}</div>
          <div className="text-xs text-gray-500">
            si se vende igual · {soles0(d.extraTotal[1])} si baja 5% · {soles0(d.extraTotal[2])} si baja 10%
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Lo que nota el cliente</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">+{pct(d.subidaPromedioPct)}</div>
          <div className="text-xs text-gray-500">sube en promedio su cuenta, con lo que compra hoy</div>
        </div>
      </div>

      {d.conAlertaInterno > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-700 leading-relaxed">
          <strong>Dos miradas del costo.</strong> En <strong>{d.conAlertaInterno} productos de Atelier</strong> los insumos están bien, pero la cafetería paga más del {NECESIDAD_ALTA_PCT}% del precio por el precio interno.
          Ahí subirle al cliente no arregla la causa: lo que conviene revisar es el precio interno de Atelier.{" "}
          <button type="button" onClick={() => setFiltro("interno")} className="font-medium text-primary hover:underline">Ver cuáles</button>
        </div>
      )}

      <div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {FILTROS.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setFiltro(x.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${filtro === x.id ? "border-primary bg-primary text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
            >
              {x.texto} ({cuenta(x.id)})
            </button>
          ))}
        </div>
        {visibles.length === 0
          ? <p className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">No hay productos en este grupo.</p>
          : <Tabla filas={visibles} />}
      </div>

      <div className="rounded-lg bg-gray-50 border border-gray-100 px-3.5 py-3 text-[11px] text-gray-600 leading-relaxed space-y-1.5">
        <p><strong>Cómo decide.</strong> Mira tres cosas de cada producto. <strong>Demanda</strong>: si vende al menos lo que vende el producto del medio de la carta, los clientes lo piden y aguanta mejor una subida. <strong>Costo</strong>: si pasa el {NECESIDAD_ALTA_PCT}% del precio, hace falta subirlo. <strong>Riesgo</strong>: los básicos que el cliente compara con otros locales (agua, americano, empanada) se notan más; los productos propios de Yayi&apos;s (desayunos, cheesecakes, Triple Yayi&apos;s) se notan menos.</p>
        <p><strong>Cuánto.</strong> Hasta +{Math.round(TOPE_SUBIR.bajo * 100)}% en los propios, +{Math.round(TOPE_SUBIR.medio * 100)}% en el resto y +{Math.round(TOPE_SUBIR.poco * 100)}% en «Subir poco», redondeado como la carta (S/ 0.50 bajo S/ 10, de sol en sol desde S/ 10, y el .9 se conserva). Si el paso más chico es demasiado (una cookie de S/ 2 a S/ 2.50 es +25%), espera a otra ronda.</p>
        <p><strong>Aguanta perder</strong> = subida ÷ (precio nuevo − costo). Ejemplo: un Triple Yayi&apos;s de S/ 21 con S/ 6 de costo que sube a S/ 23 puede perder hasta 11.8% de sus ventas y aún deja lo mismo. <strong>«No tocar»</strong> no es «nunca»: es «no en esta ronda». Un producto que vende poco no se sube, porque vendería menos todavía.</p>
        <p>El precio de partida es el de la carta (Excel de pricing); si no enlaza, el promedio que cobró Byte. El veredicto usa el costo de insumos: lo que de verdad cuesta hacerlo, la mirada del Grupo. Debajo, en los productos de Atelier, va el costo para la cafetería: el precio interno que le paga a Atelier, porque la cafetería es otra empresa. En lo que se prepara en la cafetería las dos miradas son iguales. {d.fuera > 0 ? `${d.fuera} productos no entran: no tienen costo de insumos o vendieron menos de 8 unidades.` : ""}</p>
      </div>
    </div>
  );
}

export function SubidaPrecios({ month, sede, paso }: { month: string; sede: number; /** Número del paso dentro de Sistema de Dirección → Precios. */ paso?: number }) {
  const [estado, setEstado] = useState<{ clave: string; data: SubidaSede | null; error: string | null } | null>(null);
  const clave = `${month}-${sede}`;

  useEffect(() => {
    if (!esCafeteria(sede)) return;
    let vivo = true;
    getRentabilidadProductos(month, sede).then((r) => {
      if (!vivo) return;
      setEstado(r.ok ? { clave, data: r.data ? subidaDePrecios(r.data) : null, error: null } : { clave, data: null, error: r.error });
    });
    return () => { vivo = false; };
  }, [month, sede, clave]);

  if (!esCafeteria(sede)) return null;
  const listo = estado && estado.clave === clave ? estado : null;
  const d = listo?.data ?? null;

  const resumen = !listo
    ? <p className="text-xs text-gray-400">Calculando…</p>
    : d
      ? <p className="text-xs text-gray-600">
          <strong className="text-gray-800">{d.conteo.subir + d.conteo["subir-poco"]} candidatos</strong> a subir ·
          dejarían <strong className="text-gray-800">{soles0(d.extraTotal[0])}</strong> al mes si se vende igual
          ({soles0(d.extraTotal[1])} si las ventas bajan 5%) · el cliente paga en promedio <strong className="text-gray-800">+{pct(d.subidaPromedioPct)}</strong>.
        </p>
      : <p className="text-xs text-gray-500">Sin reporte de rotación de {nombreMes(month)}.</p>;

  return (
    <SeccionDesplegable
      titulo={<ConPaso paso={paso}>{"¿Qué precios subir?"}</ConPaso>}
      subtitulo="Para la próxima carta: en qué productos, cuánto y cuántas ventas aguanta perder cada uno."
      resumen={resumen}
    >
      {listo?.error ? <p className="text-sm text-gray-500">{listo.error}</p>
        : !listo ? <p className="text-sm text-gray-400">Calculando…</p>
        : d ? <Cuerpo d={d} />
        : <p className="text-sm text-gray-500">Esta sede no tiene reporte de rotación de {nombreMes(month)}.</p>}
    </SeccionDesplegable>
  );
}
