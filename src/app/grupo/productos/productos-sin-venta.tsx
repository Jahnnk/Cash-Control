"use client";

/**
 * "Productos que no se venden" (pedido de Jahnn, 28-sep-2026): sale del
 * reporte «Platos con menor rotación» que él sube de Byte. Tres grupos:
 * nunca vendidos, dormidos (sin venta en 30 días o más) y con muy pocas
 * ventas. Son candidatos a sacar de la carta o de Byte. Lo que no es carta
 * (extras, empaques, delivery) queda fuera de la lista.
 */

import { useEffect, useState } from "react";
import { SeccionDesplegable } from "@/components/productos/ui";
import { formatCurrency } from "@/lib/utils";
import { getProductosSinVenta, type SinVentaSede, type ProductoSinVenta } from "@/app/actions/reportes-direccion";
import { CAFETERIAS, juntarSinVenta, type SinVentaJunto } from "@/lib/productos/cafeterias";

const GRUPOS: { clave: ProductoSinVenta["grupo"]; titulo: string; ayuda: string }[] = [
  { clave: "nunca", titulo: "Nunca vendidos", ayuda: "Están en Byte y nadie los pidió nunca." },
  { clave: "dormido", titulo: "Dormidos", ayuda: "Sin ventas en el rango y la última fue hace 30 días o más." },
  { clave: "poco", titulo: "Muy pocas ventas", ayuda: "Se vendieron, pero casi nada en el rango." },
];

const fecha = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const legible = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

const ETIQUETA_GRUPO: Record<ProductoSinVenta["grupo"], string> = { nunca: "nunca vendido", dormido: "dormido", poco: "muy pocas ventas" };

/** Cómo está un producto en una cafetería: «dormido · 0 vendidos» o «no está en su lista». */
function Estado({ p }: { p: ProductoSinVenta | null }) {
  if (!p) return <span className="text-gray-400">no está en su lista</span>;
  return <span>{ETIQUETA_GRUPO[p.grupo]} · {p.vendido} vendidos</span>;
}

function ListaJunta({ titulo, ayuda, items }: { titulo: string; ayuda: string; items: SinVentaJunto[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-800">{titulo} · {items.length}</h4>
      <p className="text-[11px] text-gray-500 mb-1.5">{ayuda}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
              <th className="text-left font-medium py-1.5 pr-3">Producto</th>
              <th className="text-left font-medium py-1.5 pr-3">Fonavi</th>
              <th className="text-left font-medium py-1.5 pr-3">Centro</th>
              <th className="text-right font-medium py-1.5">Vendidos</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.producto} className="border-b border-gray-50 last:border-0">
                <td className="py-1.5 pr-3 text-gray-900">{legible(p.producto)}</td>
                <td className="py-1.5 pr-3 text-xs text-gray-600"><Estado p={p.fonavi} /></td>
                <td className="py-1.5 pr-3 text-xs text-gray-600"><Estado p={p.centro} /></td>
                <td className="py-1.5 text-right text-gray-700">{p.vendido}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SinVentaCafeterias({ fonavi, centro }: { fonavi: SinVentaSede | null; centro: SinVentaSede | null }) {
  const j = juntarSinVenta(fonavi, centro);
  const rango = (s: SinVentaSede | null, n: string) => (s ? `${n} ${fecha(s.desde)} al ${fecha(s.hasta)}` : `${n}: sin lista`);
  return (
    <SeccionDesplegable
      titulo="Productos que no se venden · Fonavi + Centro"
      subtitulo={`Del reporte «Platos con menor rotación» de Byte (${rango(fonavi, "Fonavi")} · ${rango(centro, "Centro")}). Se cruzan las dos cafeterías: lo que casi no se vende en las dos es lo más claro para sacar.`}
      resumen={(fonavi || centro) && (
        <span className="text-xs text-gray-600">
          <b className="text-gray-800">{j.ambas.length}</b> flojos en las dos · {j.soloFonavi.length} solo en Fonavi · {j.soloCentro.length} solo en Centro
        </span>
      )}
    >
      {!fonavi && !centro ? (
        <p className="text-sm text-gray-500">Todavía no hay reporte de menor rotación de las cafeterías.</p>
      ) : (
        <div className="space-y-5">
          {(!fonavi || !centro) && <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Falta la lista de {!fonavi ? "Fonavi" : "Centro"}: lo que ves es solo de {!fonavi ? "Centro" : "Fonavi"}.</p>}
          <ListaJunta titulo="No se venden en ninguna de las dos" ayuda="Están en la lista de menor rotación de Fonavi y de Centro: los candidatos más claros a sacar de la carta o de Byte." items={j.ambas} />
          <ListaJunta titulo="Solo flojos en Fonavi" ayuda="En Centro se venden: puede ser un problema de la sede (vitrina, cómo se ofrece) y no del producto." items={j.soloFonavi} />
          <ListaJunta titulo="Solo flojos en Centro" ayuda="En Fonavi se venden: puede ser un problema de la sede (vitrina, cómo se ofrece) y no del producto." items={j.soloCentro} />
          {j.ambas.length + j.soloFonavi.length + j.soloCentro.length === 0 && <p className="text-sm text-gray-500">Ninguna cafetería tiene productos de la carta en su lista de menor rotación.</p>}
        </div>
      )}
    </SeccionDesplegable>
  );
}

export function ProductosSinVenta({ sede }: { sede: number }) {
  const [datos, setDatos] = useState<SinVentaSede[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void getProductosSinVenta().then((r) => { if (!vivo) return; if (r.ok) setDatos(r.sedes); else setError(r.error); });
    return () => { vivo = false; };
  }, []);

  if (error) return null;
  if (sede === CAFETERIAS) {
    if (!datos) return null;
    return <SinVentaCafeterias fonavi={datos.find((x) => x.businessId === 2) ?? null} centro={datos.find((x) => x.businessId === 3) ?? null} />;
  }
  const s = datos?.find((x) => x.businessId === sede) ?? null;
  const cuenta = (g: ProductoSinVenta["grupo"]) => s?.carta.filter((p) => p.grupo === g).length ?? 0;

  return (
    <SeccionDesplegable
      titulo="Productos que no se venden"
      subtitulo={s
        ? `Del reporte «Platos con menor rotación» de Byte (${fecha(s.desde)} al ${fecha(s.hasta)}, subido el ${fecha(s.subidoEl)}). Candidatos a sacar de la carta o de Byte.`
        : "Sube el reporte «Platos con menor rotación» de Byte de esta sede con «Subir Reportes Gerencia»."}
      resumen={s && (
        <span className="text-xs text-gray-600">
          {cuenta("nunca")} nunca vendidos · {cuenta("dormido")} dormidos · {cuenta("poco")} con muy pocas ventas
        </span>
      )}
    >
      {!s ? (
        <p className="text-sm text-gray-500">Todavía no hay reporte de menor rotación para esta sede.</p>
      ) : (
        <div className="space-y-5">
          {GRUPOS.map((g) => {
            const lista = s.carta.filter((p) => p.grupo === g.clave);
            if (lista.length === 0) return null;
            return (
              <div key={g.clave}>
                <h4 className="text-xs font-semibold text-gray-800">{g.titulo} · {lista.length}</h4>
                <p className="text-[11px] text-gray-500 mb-1.5">{g.ayuda}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm tabular-nums">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                        <th className="text-left font-medium py-1.5 pr-3">Producto</th>
                        <th className="text-left font-medium py-1.5 pr-3">Tipo en Byte</th>
                        <th className="text-right font-medium py-1.5 pr-3">Precio</th>
                        <th className="text-right font-medium py-1.5 pr-3">Vendidos</th>
                        <th className="text-right font-medium py-1.5">Última venta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map((p) => (
                        <tr key={p.producto} className="border-b border-gray-50 last:border-0">
                          <td className="py-1.5 pr-3 text-gray-900">{legible(p.producto)}</td>
                          <td className="py-1.5 pr-3 text-xs text-gray-500">{p.tipoByte ? legible(p.tipoByte) : "—"}</td>
                          <td className="py-1.5 pr-3 text-right text-gray-700">{p.precio ? formatCurrency(p.precio) : "—"}</td>
                          <td className="py-1.5 pr-3 text-right text-gray-700">{p.vendido}</td>
                          <td className="py-1.5 text-right text-gray-500">{p.nuncaVendido ? "Nunca" : fecha(p.ultimaVenta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {s.noCarta > 0 && (
            <p className="text-[11px] text-gray-500">No se listan {s.noCarta} líneas que no son de la carta (extras, empaques, delivery, combos).</p>
          )}
        </div>
      )}
    </SeccionDesplegable>
  );
}
