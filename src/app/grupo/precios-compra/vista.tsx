"use client";

/**
 * Grupo → Precios de compra (21-nov-2026). Lo que de verdad se compra en las 3 sedes, traído de Control de Caja, para
 * que la dirección vea dónde se gasta de más. Responde cuatro preguntas, cada una en su sección plegada:
 *   1. ¿Cuánto se pagó de más (o se ahorró) frente al precio habitual, por sede y mes?
 *   2. ¿Qué sede paga más caro lo mismo?
 *   3. ¿Qué precios están subiendo?
 *   4. ¿Qué proveedor es el más barato en cada producto? (con «Usar en Recetas»)
 * Más el directorio, solo para mirar. Los administradores registran todo en Control de Caja: aquí no se carga nada.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, PiggyBank, TrendingUp } from "lucide-react";
import { sincronizarConControlCaja, type DatosProveedores, type ProductoComparable } from "@/app/actions/proveedores";
import { useToast } from "@/components/toast-provider";
import { SeccionDesplegable } from "@/components/productos/ui";
import {
  SEDES, ahorroPorSedeMes, compararSedes, diasEntre, diferenciasContraHabitual, dondeComprar, preciosQueSuben, vigentes,
  type CompraReal, type ProveedorCompra,
} from "@/lib/proveedores";
import { Comparar, Directorio, FranjaCaja } from "./piezas";
import { ConectarModal } from "./conectar-modal";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const solesU = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })}`;
const fechaCorta = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
const nombreMes = (mes: string) => {
  const t = new Date(`${mes}-15T12:00:00Z`).toLocaleDateString("es-PE", { month: "long", year: "numeric", timeZone: "UTC" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const sede = (id: number | null) => (id ? SEDES[id] ?? "—" : "—");
/** Si la última compra registrada tiene más de esto, Control de Caja no se está usando para comprar. */
const DIAS_SIN_COMPRAS = 14;

export function PreciosCompraVista({ datos, onCambio }: { datos: DatosProveedores; onCambio: () => void }) {
  const { showToast } = useToast();
  const [sync, setSync] = useState<{ estado: "trayendo" | "ok" | "error"; mensaje?: string }>({ estado: "ok" });
  const [conectando, setConectando] = useState<ProductoComparable | null>(null);

  async function traer(siHaceFalta: boolean) {
    setSync({ estado: "trayendo" });
    const r = await sincronizarConControlCaja({ siHaceFalta });
    if (!r.ok) { setSync({ estado: "error", mensaje: r.error }); return; }
    setSync({ estado: "ok" });
    if (r.nuevosProveedores || r.nuevosPrecios) {
      showToast(`De Control de Caja: ${r.nuevosProveedores} proveedor${r.nuevosProveedores === 1 ? "" : "es"} y ${r.nuevosPrecios} compra${r.nuevosPrecios === 1 ? "" : "s"} nuevas`, "success");
      onCambio();
    } else if (!siHaceFalta) {
      showToast("Ya estaba al día con Control de Caja", "success");
    }
  }
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- traer de Control de Caja solo al abrir (solo la dirección) */
    if (datos.puedeEditar) void traer(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const productoPorId = useMemo(() => new Map(datos.productos.map((p) => [p.id, p])), [datos.productos]);
  const proveedorPorId = useMemo(() => new Map(datos.proveedores.map((p) => [p.id, p.nombre])), [datos.proveedores]);
  const compras: CompraReal[] = useMemo(
    () => datos.precios.map((p) => ({ productoId: p.productoId, proveedorId: p.proveedorId, sedeId: p.sedeId, fecha: p.fecha, cantidad: p.cantidad, precio: p.precio })),
    [datos.precios],
  );
  const compra: ProveedorCompra[] = useMemo(
    () => datos.proveedores.filter((p) => p.tipo === "proveedor").map((p) => ({ id: p.id, nombre: p.nombre, costoEnvio: p.costoEnvio, pedidoMinimo: p.pedidoMinimo })),
    [datos.proveedores],
  );
  const ofertas = useMemo(() => vigentes(datos.precios), [datos.precios]);
  const donde = useMemo(() => dondeComprar(ofertas, compra, datos.hoy), [ofertas, compra, datos.hoy]);

  const ahorro = useMemo(() => ahorroPorSedeMes(compras), [compras]);
  const diferencias = useMemo(() => diferenciasContraHabitual(compras), [compras]);
  const sedes = useMemo(() => compararSedes(compras, datos.hoy), [compras, datos.hoy]);
  const suben = useMemo(() => preciosQueSuben(compras, datos.hoy), [compras, datos.hoy]);

  const ultimaCompra = compras.reduce<string | null>((m, c) => (!m || c.fecha > m ? c.fecha : m), null);
  const diasSinCompras = ultimaCompra ? diasEntre(ultimaCompra, datos.hoy) : null;
  const desde90 = new Date(Date.parse(`${datos.hoy}T12:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);
  const recientes = compras.filter((c) => c.fecha >= desde90);
  const gasto90 = recientes.reduce((t, c) => t + c.precio, 0);
  const mesActual = ahorro[0]?.mes ?? null;
  const delMes = ahorro.filter((a) => a.mes === mesActual);
  const deMasMes = delMes.reduce((t, a) => t + a.deMas, 0);
  const ahorroMes = delMes.reduce((t, a) => t + a.ahorro, 0);
  const peores = diferencias.filter((d) => d.soles > 0).sort((a, b) => b.soles - a.soles).slice(0, 5);
  const ahorroPosible = sedes.reduce((t, s) => t + s.ahorroPosible, 0);
  const nombreProd = (id: number) => productoPorId.get(id)?.nombre ?? "—";
  const unidadProd = (id: number) => productoPorId.get(id)?.unidad ?? "unidad";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Precios de compra</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-500">
          Lo que de verdad se compra en las 3 sedes, traído de Control de Caja. Los administradores registran proveedores, listas y compras allá; aquí se mira dónde se paga de más.
        </p>
      </div>

      {datos.puedeEditar && <FranjaCaja sync={sync} ultima={datos.sincronizado} onActualizar={() => void traer(false)} />}

      {diasSinCompras !== null && diasSinCompras > DIAS_SIN_COMPRAS && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden />
          La última compra registrada en Control de Caja es del {fechaCorta(ultimaCompra!)} (hace {diasSinCompras} días). Si las compras no se registran allá, estos precios se quedan viejos.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra etiqueta="Proveedores" valor={String(datos.proveedores.length)} />
        <Cifra etiqueta="Productos comprados" valor={String(datos.productos.length)} />
        <Cifra etiqueta="Compras · 90 días" valor={String(recientes.length)} />
        <Cifra etiqueta="Gastado en esas compras" valor={soles(gasto90)} />
      </dl>

      <SeccionDesplegable
        titulo="1. Ahorro y sobrecosto"
        subtitulo="Cada compra contra el precio habitual del producto (la mediana de sus 3 compras anteriores, la misma regla de Control de Caja)."
        resumen={mesActual ? (
          <p className="text-xs text-gray-600">{nombreMes(mesActual)}: <b className="text-red-700">{soles(deMasMes)} de más</b> · <b className="text-emerald-700">{soles(ahorroMes)} ahorrados</b></p>
        ) : <p className="text-xs text-gray-500">Hace falta que un producto se compre más de una vez.</p>}
      >
        {ahorro.length === 0 ? <p className="text-sm text-gray-500">Todavía no hay productos comprados más de una vez.</p> : (
          <div className="space-y-5">
            <Tabla cabeza={["Mes", "Sede", "Pagado de más", "Ahorrado", "Neto"]}>
              {ahorro.map((a) => {
                const neto = a.ahorro - a.deMas;
                return (
                  <tr key={`${a.mes}|${a.sedeId}`}>
                    <td className="px-3 py-2 text-gray-700">{nombreMes(a.mes)}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{sede(a.sedeId)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-700">{soles(a.deMas)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{soles(a.ahorro)}</td>
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${neto >= 0 ? "text-emerald-700" : "text-red-700"}`}>{neto > 0.004 ? "+" : neto < -0.004 ? "−" : ""}{soles(Math.abs(neto))}</td>
                  </tr>
                );
              })}
            </Tabla>
            {peores.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Las compras que más se pagaron de más</h4>
                <ul className="space-y-2">
                  {peores.map((d, i) => (
                    <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-red-100 bg-red-50/40 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <b className="text-gray-900">{nombreProd(d.compra.productoId)}</b>
                        <span className="text-xs text-gray-500"> · {sede(d.compra.sedeId)} · {proveedorPorId.get(d.compra.proveedorId) ?? "—"} · {fechaCorta(d.compra.fecha)}</span>
                        <span className="block text-xs text-gray-600">Pagó {solesU(d.unitario)} por {unidadProd(d.compra.productoId)}; lo habitual es {solesU(d.habitual)} (+{Math.round(d.pct)}%).</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-red-700">{soles(d.soles)} de más</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </SeccionDesplegable>

      <SeccionDesplegable
        titulo="2. La misma compra en las sedes"
        subtitulo="Productos que compraron 2 o más sedes en los últimos 90 días: el último precio por unidad de cada una."
        resumen={<p className="text-xs text-gray-600">{sedes.length === 0 ? "Ningún producto lo compraron 2 sedes todavía." : <>{sedes.length} producto{sedes.length === 1 ? "" : "s"} · si todas pagaran como la más barata: <b className="text-gray-900">{soles(ahorroPosible)} menos</b></>}</p>}
      >
        {sedes.length === 0 ? <p className="text-sm text-gray-500">Ningún producto lo compraron 2 sedes en los últimos 90 días.</p> : (
          <ul className="space-y-2">
            {sedes.map((s) => (
              <li key={s.productoId} className="rounded-xl border border-gray-100 px-3 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-gray-900">{nombreProd(s.productoId)} <span className="text-xs font-normal text-gray-500">por {unidadProd(s.productoId)}</span></span>
                  <span className="text-xs text-gray-600">La más cara paga <b className="text-red-700">+{Math.round(s.brecha)}%</b>{s.ahorroPosible > 0 && <> · {soles(s.ahorroPosible)} que se pudo ahorrar</>}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.porSede.map((x, i) => (
                    <span key={x.sedeId} className={`rounded-lg px-2 py-1 text-xs ${i === 0 ? "bg-emerald-50 text-emerald-800" : "bg-gray-50 text-gray-700"}`}>
                      {sede(x.sedeId)} <b className="tabular-nums">{solesU(x.unitario)}</b> · {fechaCorta(x.fecha)}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SeccionDesplegable>

      <SeccionDesplegable
        titulo="3. Precios que suben"
        subtitulo="Primera contra última compra de los últimos 90 días, por unidad. Desde 5% de subida."
        resumen={<p className="text-xs text-gray-600">{suben.length === 0 ? "Ningún precio subió en los últimos 90 días." : <>{suben.length === 1 ? "1 producto subió" : `${suben.length} productos subieron`} · el que más: <b className="text-gray-900">{nombreProd(suben[0].productoId)} +{Math.round(suben[0].pct)}%</b></>}</p>}
      >
        {suben.length === 0 ? <p className="text-sm text-gray-500">Ningún precio subió en los últimos 90 días.</p> : (
          <Tabla cabeza={["Producto", "Antes", "Ahora", "Subió"]}>
            {suben.map((p) => (
              <tr key={p.productoId}>
                <td className="px-3 py-2 font-medium text-gray-900">{nombreProd(p.productoId)} <span className="text-xs font-normal text-gray-500">por {unidadProd(p.productoId)}</span></td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{solesU(p.desde.unitario)} <span className="text-xs text-gray-400">{fechaCorta(p.desde.fecha)}</span></td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-900">{solesU(p.hasta.unitario)} <span className="text-xs text-gray-400">{fechaCorta(p.hasta.fecha)}</span></td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-red-700"><TrendingUp className="mr-1 inline h-3.5 w-3.5" aria-hidden />+{Math.round(p.pct)}%</td>
              </tr>
            ))}
          </Tabla>
        )}
      </SeccionDesplegable>

      <SeccionDesplegable
        titulo="4. Comparar proveedores"
        subtitulo="El más barato por unidad en cada producto, y la conexión con Recetas y costos («Usar en Recetas»)."
        resumen={<p className="text-xs text-gray-600"><PiggyBank className="mr-1 inline h-3.5 w-3.5 text-primary-light" aria-hidden />{donde.size === 0 ? "Todavía ningún producto se compró a 2 proveedores." : <>{(() => { const n = [...donde.values()].reduce((t, l) => t + l.length, 0); return n === 1 ? "1 producto con 2 o más proveedores" : `${n} productos con 2 o más proveedores`; })()}</>}</p>}
      >
        <Comparar datos={datos} compra={compra} ofertas={ofertas} donde={donde} productoPorId={productoPorId} onConectar={setConectando} onCambio={onCambio} />
      </SeccionDesplegable>

      <SeccionDesplegable
        titulo="Directorio de proveedores"
        subtitulo="Solo para mirar. Los teléfonos y datos se completan en Control de Caja."
        resumen={<p className="text-xs text-gray-600">{datos.proveedores.length} proveedores · {datos.proveedores.filter((p) => p.telefono).length} con teléfono</p>}
      >
        <Directorio proveedores={datos.proveedores} donde={donde} productoPorId={productoPorId} sedeId={datos.sedeId} />
      </SeccionDesplegable>

      {conectando && (
        <ConectarModal producto={conectando} insumos={datos.insumos} enlaces={datos.enlaces} sedeId={2}
          onCerrar={() => setConectando(null)} onGuardado={() => { setConectando(null); onCambio(); }} />
      )}
    </div>
  );
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white px-4 py-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{etiqueta}</dt>
      <dd className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">{valor}</dd>
    </div>
  );
}

function Tabla({ cabeza, children }: { cabeza: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
            {cabeza.map((c, i) => <th key={c} className={`px-3 py-2 font-medium ${i >= 2 || (cabeza.length === 4 && i >= 1) ? "text-right" : ""}`}>{c}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  );
}
