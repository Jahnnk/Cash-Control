"use client";

/**
 * "Por definir" — donde Jahnn decide lo que el sistema no clasifica solo.
 *
 * Orden de la pantalla: primero lo que falta decidir (por sede, categorías
 * antes que gastos sueltos: una decisión de categoría arregla muchos
 * gastos a la vez), después la lista que hay que mandarle a Kelly, y al
 * final lo decidido en los últimos 30 días.
 *
 * Cada tarjeta trae lo necesario para decidir sin ir a buscar nada: cómo lo
 * clasifica Kelly, cómo el sistema, cuánta plata es y ejemplos reales.
 */

import { useMemo, useState, useTransition } from "react";
import { ListChecks, Copy, Loader2, Check, HelpCircle } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { formatCurrency } from "@/lib/utils";
import {
  getPorDefinir, resolverCategoria, resolverGasto, marcarCorregidoPorKelly,
  type BandejaPorDefinir, type ItemPorDefinir,
} from "@/app/actions/por-definir";
import type { TipoPE } from "@/lib/pe-kelly";
import type { GrupoCategoria } from "@/lib/catalogo-categorias";

const MOTIVO: Record<string, string> = {
  difiere: "Kelly y el sistema lo clasifican distinto",
  no_calza: "La categoría del sistema junta grupos que Kelly clasifica distinto",
  sin_kelly: "Este grupo no está en la lista «Categorías PE» de Kelly",
  sin_sistema: "La categoría no tiene grupo en el sistema",
  bolson: "Gasto en el bolsón OTROS / PENDIENTE",
  atipico: "Monto fuera de lo normal para su categoría",
};
const GRUPO_LABEL: Record<GrupoCategoria, string> = {
  fijo: "Fijo", variable: "Variable", financiamiento: "Financiamiento (fuera del EBITDA)", fuera: "Fuera de la operación (inversión / no recurrente)",
};
const GRUPO_POR_TIPO: Record<TipoPE, GrupoCategoria> = { Fijo: "fijo", Variable: "variable", Excluido: "fuera" };
const TIPOS: TipoPE[] = ["Fijo", "Variable", "Excluido"];

function Chip({ children, tono = "gris" }: { children: React.ReactNode; tono?: "gris" | "ambar" | "verde" }) {
  const c = tono === "ambar" ? "bg-amber-50 text-amber-800 border-amber-200" : tono === "verde" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-gray-50 text-gray-600 border-gray-200";
  return <span className={`text-[11px] rounded-full px-2 py-0.5 border ${c}`}>{children}</span>;
}

function SelectorTipo({ valor, onChange }: { valor: TipoPE | null; onChange: (t: TipoPE) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs">
      {TIPOS.map((t) => (
        <button key={t} type="button" onClick={() => onChange(t)}
          className={`px-3 py-1.5 ${valor === t ? "bg-primary text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}>
          {t}
        </button>
      ))}
    </div>
  );
}

function TarjetaCategoria({ item, categorias, onHecho }: { item: ItemPorDefinir; categorias: string[]; onHecho: () => void }) {
  const { showToast } = useToast();
  const d = item.datos as {
    grupo: string; categoria: string; tipoKelly: TipoPE | null; tipoSistema: TipoPE | null; grupoSistema: GrupoCategoria | null;
    filas: number; monto: number; ejemplos: { fecha: string; monto: number; concepto: string | null }[];
    otrosGruposEnCategoria: { grupo: string; tipoKelly: TipoPE | null }[];
  };
  const [tipo, setTipo] = useState<TipoPE | null>(d.tipoKelly ?? d.tipoSistema);
  const [grupoSis, setGrupoSis] = useState<GrupoCategoria | null>(d.grupoSistema ?? (d.tipoKelly ? GRUPO_POR_TIPO[d.tipoKelly] : null));
  const [destino, setDestino] = useState("");
  const [guardando, start] = useTransition();

  function como(t: TipoPE | null, g: GrupoCategoria | null) { setTipo(t); setGrupoSis(g); }

  function guardar() {
    if (!tipo || !grupoSis) { showToast("Elige cómo cuenta en el punto de equilibrio y en el sistema.", "error"); return; }
    start(async () => {
      const r = await resolverCategoria(item.id, { tipoPE: tipo, grupoSistema: grupoSis, categoriaDestino: destino || null });
      if (!r.ok) { showToast(r.error, "error"); return; }
      showToast("Decisión guardada", "success");
      onHecho();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-gray-900">Grupo «{d.grupo}» <span className="font-normal text-gray-500">· categoría del sistema: {d.categoria}</span></div>
          <div className="text-xs text-amber-800 mt-0.5">{MOTIVO[item.motivo]}</div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Chip>{item.sede}</Chip>
          <Chip>{d.filas} gasto(s) · {formatCurrency(d.monto)}</Chip>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-gray-50 px-3 py-2">Excel de Kelly: <strong>{d.tipoKelly ?? "no está en su lista"}</strong></div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">Sistema: <strong>{d.grupoSistema ? GRUPO_LABEL[d.grupoSistema] : "sin grupo"}</strong></div>
      </div>

      {d.ejemplos?.length > 0 && (
        <ul className="text-xs text-gray-600 space-y-0.5">
          {d.ejemplos.map((e, i) => <li key={i}>{e.fecha} · {formatCurrency(e.monto)} · {e.concepto ?? "—"}</li>)}
        </ul>
      )}
      {d.otrosGruposEnCategoria?.length > 0 && (
        <div className="text-[11px] text-gray-500">
          En «{d.categoria}» también hay: {d.otrosGruposEnCategoria.map((o) => `${o.grupo} (${o.tipoKelly ?? "sin tipo"})`).join(", ")}. Cambiar el grupo de la categoría los afecta a todos; si este grupo es distinto, muévelo a otra categoría.
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        {d.tipoKelly && <button onClick={() => como(d.tipoKelly, GRUPO_POR_TIPO[d.tipoKelly!])} className="px-2.5 py-1 rounded-lg border border-gray-300 hover:bg-gray-50">Como Kelly</button>}
        {d.tipoSistema && <button onClick={() => como(d.tipoSistema, d.grupoSistema)} className="px-2.5 py-1 rounded-lg border border-gray-300 hover:bg-gray-50">Como el sistema</button>}
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-44 text-gray-600">Punto de equilibrio:</span>
          <SelectorTipo valor={tipo} onChange={setTipo} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-44 text-gray-600">Sistema (EBITDA, reportes):</span>
          <select value={grupoSis ?? ""} onChange={(e) => setGrupoSis((e.target.value || null) as GrupoCategoria | null)} className="border border-gray-300 rounded-lg px-2 py-1.5">
            <option value="">Elegir…</option>
            {(Object.keys(GRUPO_LABEL) as GrupoCategoria[]).map((g) => <option key={g} value={g}>{GRUPO_LABEL[g]}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-44 text-gray-600">Mover a otra categoría:</span>
          <input list={`cats-${item.businessId}`} value={destino} onChange={(e) => setDestino(e.target.value.toUpperCase())}
            placeholder={`(dejar en ${d.categoria})`} className="border border-gray-300 rounded-lg px-2 py-1.5 w-60" />
          <datalist id={`cats-${item.businessId}`}>{categorias.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={guardar} disabled={guardando} className="px-4 py-2 rounded-lg bg-primary text-white text-sm flex items-center gap-1.5 disabled:opacity-60">
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Guardar decisión
        </button>
      </div>
    </div>
  );
}

function TarjetaGasto({ item, categorias, conListaKelly, onHecho }: { item: ItemPorDefinir; categorias: string[]; conListaKelly: boolean; onHecho: () => void }) {
  const { showToast } = useToast();
  const d = item.datos as { fecha: string; monto: number; concepto: string | null; grupo: string; categoria: string; tipoKelly: TipoPE | null; tipoSistema: TipoPE | null; mediana?: number };
  const consulta = item.decision && "accion" in item.decision && item.decision.accion === "consultar" ? item.decision.pregunta : null;
  const [modo, setModo] = useState<"nada" | "reclasificar" | "consultar">("nada");
  const [tipo, setTipo] = useState<TipoPE | null>(null);
  const [destino, setDestino] = useState("");
  const [pregunta, setPregunta] = useState("");
  const [guardando, start] = useTransition();

  function enviar(decision: Parameters<typeof resolverGasto>[1], ok: string) {
    start(async () => {
      const r = await resolverGasto(item.id, decision);
      if (!r.ok) { showToast(r.error, "error"); return; }
      showToast(ok, "success");
      onHecho();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">{d.concepto ?? "Sin concepto"}</div>
          <div className="text-xs text-gray-500">{d.fecha} · grupo «{d.grupo}» · categoría {d.categoria}</div>
          <div className="text-xs text-amber-800 mt-0.5">
            {MOTIVO[item.motivo]}{item.motivo === "atipico" && d.mediana ? ` (lo normal ahí: ${formatCurrency(d.mediana)}; este es ${Math.round(d.monto / d.mediana)} veces más)` : ""}
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Chip>{item.sede}</Chip>
          <Chip tono="ambar">{formatCurrency(d.monto)}</Chip>
        </div>
      </div>
      <div className="text-xs text-gray-600">Hoy cuenta como: <strong>{d.tipoKelly ?? d.tipoSistema ?? "sin tipo"}</strong> en el punto de equilibrio.</div>
      {consulta && <div className="text-xs text-sky-800 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2 flex gap-1.5"><HelpCircle className="w-3.5 h-3.5 mt-0.5" /> Consultado a Kelly: «{consulta}»</div>}

      {modo === "nada" && (
        <div className="flex flex-wrap gap-2 text-xs">
          <button disabled={guardando} onClick={() => enviar({ accion: "ok" }, "Marcado como correcto")} className="px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-800 hover:bg-emerald-50">Está bien así</button>
          <button onClick={() => setModo("reclasificar")} className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50">Va en otro lado</button>
          {!consulta && <button onClick={() => setModo("consultar")} className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50">No sé: preguntarle a Kelly</button>}
        </div>
      )}
      {modo === "reclasificar" && (
        <div className="space-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-2"><span className="w-40 text-gray-600">Punto de equilibrio:</span><SelectorTipo valor={tipo} onChange={setTipo} /></div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-40 text-gray-600">Categoría {conListaKelly ? "(opcional)" : ""}:</span>
            <input list={`catsg-${item.id}`} value={destino} onChange={(e) => setDestino(e.target.value.toUpperCase())} placeholder={`(dejar en ${d.categoria})`} className="border border-gray-300 rounded-lg px-2 py-1.5 w-60" />
            <datalist id={`catsg-${item.id}`}>{categorias.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setModo("nada")} className="px-3 py-1.5 text-gray-600">Cancelar</button>
            <button disabled={guardando || !tipo} onClick={() => enviar({ accion: "reclasificar", tipoPE: tipo!, categoriaDestino: destino || null }, "Gasto reclasificado")} className="px-3 py-1.5 rounded-lg bg-primary text-white disabled:opacity-60">Guardar</button>
          </div>
        </div>
      )}
      {modo === "consultar" && (
        <div className="space-y-2 text-xs">
          <textarea value={pregunta} onChange={(e) => setPregunta(e.target.value)} rows={2} placeholder="¿Qué quieres saber? (ej. ¿fue un gasto del local o personal?)" className="w-full border border-gray-300 rounded-lg px-2 py-1.5" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setModo("nada")} className="px-3 py-1.5 text-gray-600">Cancelar</button>
            <button disabled={guardando} onClick={() => enviar({ accion: "consultar", pregunta }, "Agregado a la lista para Kelly")} className="px-3 py-1.5 rounded-lg bg-primary text-white disabled:opacity-60">Agregar a la lista de Kelly</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PorDefinirClient({ inicial }: { inicial: BandejaPorDefinir }) {
  const { showToast } = useToast();
  const [data, setData] = useState(inicial);
  const [sede, setSede] = useState<number | null>(null);
  const [cargando, start] = useTransition();

  function recargar() {
    start(async () => {
      const r = await getPorDefinir();
      if (r.ok) setData(r.data); else showToast(r.error, "error");
    });
  }

  const pendientes = useMemo(() => data.pendientes.filter((i) => sede === null || i.businessId === sede), [data, sede]);
  const cuenta = (id: number) => data.pendientes.filter((i) => i.businessId === id).length;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-primary" /> Por definir {cargando && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Lo que el sistema no puede clasificar solo: grupos que el Excel de Kelly y el sistema clasifican distinto, y gastos que no se entienden.
          Tu decisión se aplica ya; si contradice el Excel, queda en la lista para Kelly hasta que su Excel lo traiga corregido.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {[{ id: null, nombre: "Todas" }, { id: 1, nombre: "Atelier" }, { id: 2, nombre: "Fonavi" }, { id: 3, nombre: "Centro" }].map((s) => (
          <button key={String(s.id)} onClick={() => setSede(s.id)}
            className={`px-3 py-1.5 rounded-lg border ${sede === s.id ? "bg-primary text-white border-primary" : "bg-white text-gray-700 border-gray-300"}`}>
            {s.nombre} ({s.id === null ? data.pendientes.length : cuenta(s.id)})
          </button>
        ))}
      </div>

      <section className="space-y-3">
        {pendientes.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-emerald-700">Nada por definir. 👏</div>
        ) : pendientes.map((i) => i.alcance === "categoria"
          ? <TarjetaCategoria key={i.id} item={i} categorias={data.categorias[i.businessId] ?? []} onHecho={recargar} />
          : <TarjetaGasto key={i.id} item={i} categorias={data.categorias[i.businessId] ?? []} conListaKelly={data.sedesConListaKelly.includes(i.businessId)} onHecho={recargar} />)}
      </section>

      {data.paraKelly.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Lista para Kelly</h2>
          <p className="text-xs text-gray-500">Correcciones para su Excel. Cada punto se cierra solo cuando llega un Excel que ya lo trae corregido.</p>
          {data.paraKelly.map((k) => {
            const texto = `Kelly, correcciones para el Excel de ${k.sede}:\n${k.lineas.join("\n")}`;
            return (
              <div key={k.businessId} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-gray-800">{k.sede}</span>
                  <button onClick={() => { void navigator.clipboard.writeText(texto); showToast("Copiado para enviar a Kelly", "success"); }} className="text-xs text-primary flex items-center gap-1">
                    <Copy className="w-3.5 h-3.5" /> Copiar
                  </button>
                </div>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">{k.lineas.join("\n")}</pre>
              </div>
            );
          })}
        </section>
      )}

      {data.resueltasRecientes.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Decidido en los últimos 30 días</div>
          <ul className="divide-y divide-gray-100">
            {data.resueltasRecientes.map((i) => {
              const d = i.datos as { grupo?: string; concepto?: string; categoria?: string; monto?: number };
              const dec = i.decision as { tipoPE?: TipoPE; accion?: string; categoriaDestino?: string | null } | null;
              return (
                <li key={i.id} className="px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
                  <span className="text-gray-700">
                    {i.sede} · {i.alcance === "categoria" ? `Grupo «${d.grupo}»` : d.concepto} →{" "}
                    <strong>{dec?.accion === "ok" ? "está bien" : dec?.tipoPE ?? "—"}</strong>
                    {dec?.categoriaDestino ? ` (${dec.categoriaDestino})` : ""} · {i.decididoPor}
                  </span>
                  {i.kellyPendiente && !i.kellyCorregidoEn ? (
                    <button onClick={() => start(async () => { await marcarCorregidoPorKelly(i.id); recargar(); })} className="text-primary">Kelly ya lo corrigió</button>
                  ) : i.kellyPendiente ? <Chip tono="verde">Kelly corrigió</Chip> : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
