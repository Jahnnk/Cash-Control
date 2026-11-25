"use client";

/**
 * Grupo → Insumos y packaging → «Conectar productos de proveedores» (24-nov-2026). Los productos que anotan las
 * compras de Control de Caja («Leche Condensanda 1.2 Kg») con el insumo que son. Los de nombre igual y unidad que se
 * convierte sola se conectan con un botón; el resto se revisa uno por uno. Plegado por defecto, carga al abrir.
 * Reglas: lib/insumos-ficha.ts (parecidoTolerante, factorSeguro). Actions: actions/insumos-proveedores.ts.
 */

import { useMemo, useState } from "react";
import { ChevronDown, Loader2, Search } from "lucide-react";
import {
  conectarProductoInsumo, conectarSugerenciasSeguras, getSugerenciasProveedor, type SugerenciaProveedor,
} from "@/app/actions/insumos-proveedores";
import { Pastilla, Segmentado } from "@/components/productos/ui";
import { factorSeguro, normalizarNombre } from "@/lib/insumos-ficha";
import { fechaCorta, solesRedondo } from "./piezas";

type InsumoMin = { origen: "Atelier" | "Cafetería"; sku: string; nombre: string; unidad: string; archivado: boolean };
type Vista = "revisar" | "sinParecido";

export function ConectarProveedores({ insumos, onCambio }: { insumos: InsumoMin[]; onCambio: () => Promise<void> }) {
  const [datos, setDatos] = useState<{ sugerencias: SugerenciaProveedor[]; conectados: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [verLista, setVerLista] = useState(false);
  const [vista, setVista] = useState<Vista>("revisar");

  const cargar = async () => {
    const r = await getSugerenciasProveedor();
    if (r.ok) { setDatos({ sugerencias: r.sugerencias, conectados: r.conectados }); setError(null); } else setError(r.error);
  };

  const seguras = datos?.sugerencias.filter((s) => s.seguro) ?? [];
  const revisar = datos?.sugerencias.filter((s) => !s.seguro && s.candidatos.length > 0) ?? [];
  const sinParecido = datos?.sugerencias.filter((s) => s.candidatos.length === 0) ?? [];

  const conectarTodas = async () => {
    setOcupado(true);
    const r = await conectarSugerenciasSeguras();
    setOcupado(false);
    if (!r.ok) { setError(r.error); return; }
    setAviso(`${r.conectados} productos conectados.`);
    await Promise.all([cargar(), onCambio()]);
  };

  const conectar = async (productoId: number, origen: string, sku: string, cuanto: number | null) => {
    setOcupado(true);
    const r = await conectarProductoInsumo({ productoId, origen, sku, cuanto });
    setOcupado(false);
    if (!r.ok) return r.error;
    await Promise.all([cargar(), onCambio()]);
    return null;
  };

  return (
    <details className="group rounded-2xl border border-gray-200/80 bg-white px-4 py-3 sm:px-6"
      onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open && !datos) void cargar(); }}>
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-2 gap-y-1 [&::-webkit-details-marker]:hidden">
        <h2 className="text-[15px] font-semibold text-gray-900">Conectar productos de proveedores</h2>
        <span className="text-xs text-gray-500">
          {datos ? `${datos.conectados} conectados · ${datos.sugerencias.length} por conectar` : "Lo que anotan las compras de Control de Caja, con el insumo que es"}
        </span>
        <ChevronDown className="ml-auto h-4 w-4 self-center text-gray-400 transition-transform group-open:rotate-180" aria-hidden />
      </summary>

      <div className="mt-3 space-y-3">
        <p className="max-w-2xl text-xs leading-relaxed text-gray-500">
          Cada compra registrada en Control de Caja trae el proveedor, el producto y lo que se pagó. Al decir qué insumo es cada producto, la ficha del insumo muestra dónde se compra y a cuánto, y Precios de compra sabe qué insumo es. Se conecta una vez; las compras nuevas llegan solas.
        </p>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {aviso && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{aviso}</p>}
        {!datos && !error && <div className="flex justify-center py-6 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>}

        {datos && (
          <>
            {seguras.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 text-sm text-emerald-900"><b>{seguras.length}</b> tienen el mismo nombre que un insumo y una unidad que se convierte sola.</div>
                  <button type="button" onClick={() => setVerLista(!verLista)} className="text-xs font-medium text-emerald-800 underline">{verLista ? "Ocultar" : "Ver lista"}</button>
                  <button type="button" disabled={ocupado} onClick={() => void conectarTodas()}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{ocupado ? "Conectando…" : `Conectar las ${seguras.length}`}</button>
                </div>
                {verLista && (
                  <ul className="mt-2 space-y-0.5 text-[11px] text-emerald-900">
                    {seguras.map((s) => <li key={s.producto.id}>{s.producto.nombre} ({s.producto.unidad}) → {s.candidatos[0].nombre} · {s.candidatos[0].origen === "Atelier" ? "Atelier" : "cafeterías"}</li>)}
                  </ul>
                )}
              </div>
            )}

            <Segmentado tamano="sm" valor={vista} onChange={setVista} opciones={[
              { valor: "revisar", etiqueta: `Por revisar ${revisar.length}` },
              { valor: "sinParecido", etiqueta: `Sin parecido ${sinParecido.length}` },
            ]} />
            {vista === "sinParecido" && sinParecido.length > 0 && (
              <p className="text-[11px] text-gray-500">Ningún insumo se les parece. Muchos son gastos que no van en recetas (limpieza, pilas, arreglos): esos no hace falta conectarlos.</p>
            )}
            <ul className="divide-y divide-gray-100">
              {(vista === "revisar" ? revisar : sinParecido).map((s) => (
                <FilaProducto key={s.producto.id} s={s} insumos={insumos} ocupado={ocupado} conectar={conectar} />
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}

function FilaProducto({ s, insumos, ocupado, conectar }: {
  s: SugerenciaProveedor;
  insumos: InsumoMin[];
  ocupado: boolean;
  conectar: (productoId: number, origen: string, sku: string, cuanto: number | null) => Promise<string | null>;
}) {
  const [elegido, setElegido] = useState<{ origen: string; sku: string; nombre: string; unidad: string; calzan: boolean } | null>(null);
  const [cuanto, setCuanto] = useState("");
  const [buscar, setBuscar] = useState(false);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const p = s.producto;

  const resultados = useMemo(() => {
    const t = normalizarNombre(q);
    return t.length < 2 ? [] : insumos.filter((x) => !x.archivado && normalizarNombre(x.nombre).includes(t)).slice(0, 8);
  }, [q, insumos]);

  const ir = async (c: { origen: string; sku: string; nombre: string; unidad: string; calzan: boolean }) => {
    setError(null);
    if (!c.calzan && !(Number(cuanto.replace(",", ".")) > 0)) { setElegido(c); return; }
    const e = await conectar(p.id, c.origen, c.sku, c.calzan ? null : Number(cuanto.replace(",", ".")));
    if (e) { setError(e); setElegido(c); }
  };

  return (
    <li className="py-2.5">
      <div className="text-sm font-medium text-gray-900">{p.nombre} <span className="text-[11px] font-normal text-gray-400">/ {p.unidad}</span></div>
      {p.ultimo && <div className="text-[11px] text-gray-500">{p.ultimo.proveedor} · {p.ultimo.presentacion} · {solesRedondo(p.ultimo.precio)} · {fechaCorta(p.ultimo.fecha)}</div>}

      {elegido ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <span>→ <b>{elegido.nombre}</b>. 1 {p.unidad} trae</span>
          <input autoFocus inputMode="decimal" value={cuanto} onChange={(e) => setCuanto(e.target.value)} placeholder="1.2" aria-label={`Cuánto trae 1 ${p.unidad}`}
            className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm" />
          <span>{elegido.unidad}</span>
          <button type="button" disabled={ocupado || !(Number(cuanto.replace(",", ".")) > 0)} onClick={() => void ir(elegido)}
            className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white disabled:opacity-50">Conectar</button>
          <button type="button" onClick={() => setElegido(null)} className="text-gray-500">Atrás</button>
        </div>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {s.candidatos.slice(0, 3).map((c) => (
            <button key={`${c.origen}|${c.sku}`} type="button" disabled={ocupado}
              onClick={() => void ir({ origen: c.origen, sku: c.sku, nombre: c.nombre, unidad: c.unidad, calzan: c.unidadesCalzan })}
              className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-gray-800 ring-1 ring-inset ring-gray-200 hover:bg-emerald-50 hover:ring-primary/40">
              {c.nombre} <span className="text-gray-400">· {c.origen === "Atelier" ? "Atelier" : "cafeterías"} · {Math.round(c.parecido * 100)}%</span>
            </button>
          ))}
          <button type="button" onClick={() => setBuscar(!buscar)} className="inline-flex items-center gap-1 px-1.5 text-xs font-medium text-primary">
            <Search className="h-3 w-3" /> Otro insumo
          </button>
        </div>
      )}
      {buscar && !elegido && (
        <div className="mt-1.5">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar insumo"
            className="w-full max-w-xs rounded-lg border border-gray-300 px-2 py-1 text-sm" />
          {resultados.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {resultados.map((x) => (
                <button key={`${x.origen}|${x.sku}`} type="button" disabled={ocupado}
                  onClick={() => void ir({ origen: x.origen, sku: x.sku, nombre: x.nombre, unidad: x.unidad, calzan: factorSeguro(p.unidad, x.unidad) != null })}
                  className="rounded-full bg-white px-2.5 py-1 text-xs ring-1 ring-inset ring-gray-200 hover:bg-emerald-50">
                  {x.nombre} <span className="text-gray-400">· {x.origen === "Atelier" ? "Atelier" : "cafeterías"} · {x.unidad}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {error && <div className="mt-1"><Pastilla tono="rojo">{error}</Pastilla></div>}
    </li>
  );
}
