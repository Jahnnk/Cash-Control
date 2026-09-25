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
import { ListChecks, Copy, Loader2, Check, HelpCircle, Scissors, ChevronDown, ChevronUp, Undo2 } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { formatCurrency } from "@/lib/utils";
import {
  getPorDefinir, resolverCategoria, resolverGasto, marcarCorregidoPorKelly,
  getGastosDeGrupo, separarGastos, deshacerSeparacion,
  type BandejaPorDefinir, type ItemPorDefinir, type GastoDelGrupo, type SeparacionDelGrupo,
} from "@/app/actions/por-definir";
import type { TipoPE } from "@/lib/pe-kelly";
import type { GrupoCategoria } from "@/lib/catalogo-categorias";
import { coincideRegla, textoSugeridoParaRegla } from "@/lib/texto-regla";

const MOTIVO: Record<string, string> = {
  difiere: "El Excel y el sistema lo clasifican distinto",
  no_calza: "La categoría del sistema junta grupos que el Excel clasifica distinto",
  sin_kelly: "Este grupo no está en la lista «Categorías PE» del Excel",
  sin_sistema: "La categoría no tiene grupo en el sistema",
  bolson: "Gasto en el bolsón OTROS / PENDIENTE",
  atipico: "Monto fuera de lo normal para su categoría",
  separado: "Separado de su grupo",
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

const NUEVA = "__nueva__";

/**
 * Elegir la categoría destino: una de la sede o una NUEVA (con cómo cuenta
 * en el sistema). "" = dejarla donde está.
 */
function SelectorCategoria({ categorias, valor, onChange, actual, grupoNueva, onGrupoNueva, mostrarGrupoNueva = true }: {
  categorias: string[]; valor: string; onChange: (v: string) => void; actual: string;
  grupoNueva?: GrupoCategoria | null; onGrupoNueva?: (g: GrupoCategoria) => void; mostrarGrupoNueva?: boolean;
}) {
  const [creando, setCreando] = useState(false);
  const existe = categorias.includes(valor);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={creando ? NUEVA : existe ? valor : ""}
        onChange={(e) => {
          if (e.target.value === NUEVA) { setCreando(true); onChange(""); }
          else { setCreando(false); onChange(e.target.value); }
        }}
        className="border border-gray-300 rounded-lg px-2 py-1.5 max-w-[16rem]">
        <option value="">(dejar en {actual})</option>
        {categorias.filter((c) => c !== actual).map((c) => <option key={c} value={c}>{c}</option>)}
        <option value={NUEVA}>＋ Crear categoría nueva…</option>
      </select>
      {creando && (
        <>
          <input autoFocus value={valor} onChange={(e) => onChange(e.target.value.toUpperCase())}
            placeholder="Nombre de la categoría" className="border border-gray-300 rounded-lg px-2 py-1.5 w-52" />
          {mostrarGrupoNueva && onGrupoNueva && (
            <select value={grupoNueva ?? ""} onChange={(e) => onGrupoNueva(e.target.value as GrupoCategoria)} className="border border-gray-300 rounded-lg px-2 py-1.5">
              <option value="" disabled>Cuenta en el sistema como…</option>
              {(Object.keys(GRUPO_LABEL) as GrupoCategoria[]).map((g) => <option key={g} value={g}>{GRUPO_LABEL[g]}</option>)}
            </select>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Los gastos del grupo uno por uno, para sacar los que no pertenecen
 * (ej. "PRESTAMO VEHICULAR" en FINANCIAMIENTO = sueldos → PLANILLA). Se
 * separa un solo pago o todos los que dicen un texto; la regla queda
 * guardada y se aplica sola en cada Excel que se suba.
 */
function GastosDelGrupo({ item, categorias, onCambio }: { item: ItemPorDefinir; categorias: string[]; onCambio: () => void }) {
  const { showToast } = useToast();
  const d = item.datos as { categoria: string; tipoKelly: TipoPE | null };
  const [lista, setLista] = useState<{ gastos: GastoDelGrupo[]; separados: SeparacionDelGrupo[] } | null>(null);
  const [cargando, startCarga] = useTransition();
  const [guardando, startGuardar] = useTransition();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [todos, setTodos] = useState(true);
  const [texto, setTexto] = useState("");
  const [tipo, setTipo] = useState<TipoPE | null>(null);
  const [destino, setDestino] = useState("");
  const [grupoNueva, setGrupoNueva] = useState<GrupoCategoria | null>(null);

  function cargar() {
    startCarga(async () => {
      const r = await getGastosDeGrupo(item.id);
      if (r.ok) setLista({ gastos: r.gastos, separados: r.separados }); else showToast(r.error, "error");
    });
  }

  function abrir(g: GastoDelGrupo) {
    setAbierto(g.huella); setTodos(true); setTexto(textoSugeridoParaRegla(g.concepto));
    setTipo(null); setDestino(""); setGrupoNueva(null);
  }

  const coinciden = lista && abierto && todos && texto.trim().length >= 4
    ? lista.gastos.filter((g) => coincideRegla(g.concepto, texto))
    : [];

  function guardar(g: GastoDelGrupo) {
    if (!tipo) { showToast("Elige cómo cuenta en el punto de equilibrio.", "error"); return; }
    if (!destino.trim()) { showToast("Elige a qué categoría van.", "error"); return; }
    startGuardar(async () => {
      const r = await separarGastos(item.id, {
        huella: todos ? null : g.huella, texto: todos ? texto : null,
        tipoPE: tipo, categoriaDestino: destino, grupoSistema: grupoNueva,
      });
      if (!r.ok) { showToast(r.error, "error"); return; }
      showToast(`${r.pagos} pago(s) separados a ${destino.trim().toUpperCase()}`, "success");
      setAbierto(null);
      cargar();
      onCambio();
    });
  }

  function deshacer(id: string) {
    startGuardar(async () => {
      const r = await deshacerSeparacion(id);
      if (!r.ok) { showToast(r.error, "error"); return; }
      showToast("Separación deshecha", "success");
      cargar();
      onCambio();
    });
  }

  if (!lista) {
    return (
      <button type="button" onClick={cargar} disabled={cargando} className="text-xs text-primary flex items-center gap-1">
        {cargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
        Ver todos los gastos y separar los que van en otra categoría
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 text-xs">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg">
        <span className="font-medium text-gray-700">Gastos del grupo ({lista.gastos.length}) {cargando && <Loader2 className="inline w-3 h-3 animate-spin" />}</span>
        <button type="button" onClick={() => setLista(null)} className="text-gray-500 flex items-center gap-1"><ChevronUp className="w-3.5 h-3.5" /> Ocultar</button>
      </div>

      {lista.separados.length > 0 && (
        <ul className="px-3 py-2 space-y-1 border-b border-gray-100 bg-emerald-50/40">
          {lista.separados.map((sp) => (
            <li key={sp.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-emerald-900">
                <Scissors className="inline w-3.5 h-3.5 mr-1" />
                {sp.texto ? <>Todos los que dicen «{sp.texto}»</> : <>«{sp.concepto ?? "sin concepto"}»</>} → <strong>{sp.categoriaDestino}</strong> ({sp.tipoPE}) · {sp.pagos} pago(s) · {formatCurrency(sp.monto)}
                {sp.texto && <span className="text-emerald-700"> · también los meses que vengan</span>}
              </span>
              <button type="button" disabled={guardando} onClick={() => deshacer(sp.id)} className="text-gray-500 hover:text-gray-800 flex items-center gap-1"><Undo2 className="w-3.5 h-3.5" /> Deshacer</button>
            </li>
          ))}
        </ul>
      )}

      <ul className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
        {lista.gastos.map((g) => {
          const marcado = abierto !== null && (g.huella === abierto || coinciden.some((c) => c.huella === g.huella));
          return (
            <li key={g.huella + g.fecha} className={`px-3 py-2 ${marcado ? "bg-amber-50" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-700 min-w-0">{g.fecha} · <strong>{formatCurrency(g.monto)}</strong> · {g.concepto ?? "—"}</span>
                {abierto !== g.huella && (
                  <button type="button" onClick={() => abrir(g)} className="shrink-0 px-2 py-1 rounded-md border border-gray-300 hover:bg-white flex items-center gap-1">
                    <Scissors className="w-3.5 h-3.5" /> Separar
                  </button>
                )}
              </div>
              {abierto === g.huella && (
                <div className="mt-2 space-y-2 rounded-lg border border-gray-200 bg-white p-3">
                  <div className="space-y-1">
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={todos} onChange={() => setTodos(true)} />
                      <span>Todos los pagos de «{d.categoria}» que dicen</span>
                      <input value={texto} onChange={(e) => setTexto(e.target.value.toUpperCase())} disabled={!todos} className="border border-gray-300 rounded-md px-2 py-1 w-56" />
                    </label>
                    {todos && (
                      <div className="pl-6 text-gray-500">
                        {texto.trim().length < 4 ? "Escribe al menos 4 letras." : `Aquí coinciden ${coinciden.length} pago(s). Recomendado si se repite cada mes: se aplica solo en los próximos Excels.`}
                      </div>
                    )}
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={!todos} onChange={() => setTodos(false)} />
                      <span>Solo este pago</span>
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-2"><span className="w-36 text-gray-600">Mover a:</span>
                    <SelectorCategoria categorias={categorias} valor={destino} onChange={setDestino} actual={d.categoria}
                      grupoNueva={grupoNueva ?? (tipo ? GRUPO_POR_TIPO[tipo] : null)} onGrupoNueva={setGrupoNueva} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2"><span className="w-36 text-gray-600">Punto de equilibrio:</span><SelectorTipo valor={tipo} onChange={setTipo} /></div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setAbierto(null)} className="px-3 py-1.5 text-gray-600">Cancelar</button>
                    <button type="button" disabled={guardando} onClick={() => guardar(g)} className="px-3 py-1.5 rounded-lg bg-primary text-white disabled:opacity-60 flex items-center gap-1">
                      {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scissors className="w-3.5 h-3.5" />} Separar
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {lista.gastos.length === 0 && <li className="px-3 py-2 text-gray-500">No quedan gastos en este grupo.</li>}
      </ul>
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
        <div className="rounded-lg bg-gray-50 px-3 py-2">Excel: <strong>{d.tipoKelly ?? "no está en su lista"}</strong></div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">Sistema: <strong>{d.grupoSistema ? GRUPO_LABEL[d.grupoSistema] : "sin grupo"}</strong></div>
      </div>

      {d.ejemplos?.length > 0 && (
        <ul className="text-xs text-gray-600 space-y-0.5">
          {d.ejemplos.map((e, i) => <li key={i}>{e.fecha} · {formatCurrency(e.monto)} · {e.concepto ?? "—"}</li>)}
        </ul>
      )}
      <GastosDelGrupo item={item} categorias={categorias} onCambio={onHecho} />
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
          <SelectorCategoria categorias={categorias} valor={destino} onChange={setDestino} actual={d.categoria} mostrarGrupoNueva={false} />
          {destino && !categorias.includes(destino) && <span className="text-gray-500">Se crea como «{grupoSis ? GRUPO_LABEL[grupoSis] : "…"}»</span>}
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
  const [grupoNueva, setGrupoNueva] = useState<GrupoCategoria | null>(null);
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
      {consulta && <div className="text-xs text-sky-800 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2 flex gap-1.5"><HelpCircle className="w-3.5 h-3.5 mt-0.5" /> Consultado: «{consulta}»</div>}

      {modo === "nada" && (
        <div className="flex flex-wrap gap-2 text-xs">
          <button disabled={guardando} onClick={() => enviar({ accion: "ok" }, "Marcado como correcto")} className="px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-800 hover:bg-emerald-50">Está bien así</button>
          <button onClick={() => setModo("reclasificar")} className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50">Va en otro lado</button>
          {!consulta && <button onClick={() => setModo("consultar")} className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50">No sé: consultar</button>}
        </div>
      )}
      {modo === "reclasificar" && (
        <div className="space-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-2"><span className="w-40 text-gray-600">Punto de equilibrio:</span><SelectorTipo valor={tipo} onChange={setTipo} /></div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-40 text-gray-600">Categoría {conListaKelly ? "(opcional)" : ""}:</span>
            <SelectorCategoria categorias={categorias} valor={destino} onChange={setDestino} actual={d.categoria}
              grupoNueva={grupoNueva ?? (tipo ? GRUPO_POR_TIPO[tipo] : null)} onGrupoNueva={setGrupoNueva} />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setModo("nada")} className="px-3 py-1.5 text-gray-600">Cancelar</button>
            <button disabled={guardando || !tipo} onClick={() => enviar({ accion: "reclasificar", tipoPE: tipo!, categoriaDestino: destino || null, grupoSistema: grupoNueva }, "Gasto reclasificado")} className="px-3 py-1.5 rounded-lg bg-primary text-white disabled:opacity-60">Guardar</button>
          </div>
        </div>
      )}
      {modo === "consultar" && (
        <div className="space-y-2 text-xs">
          <textarea value={pregunta} onChange={(e) => setPregunta(e.target.value)} rows={2} placeholder="¿Qué quieres saber? (ej. ¿fue un gasto del local o personal?)" className="w-full border border-gray-300 rounded-lg px-2 py-1.5" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setModo("nada")} className="px-3 py-1.5 text-gray-600">Cancelar</button>
            <button disabled={guardando} onClick={() => enviar({ accion: "consultar", pregunta }, "Agregado a las correcciones para el Excel")} className="px-3 py-1.5 rounded-lg bg-primary text-white disabled:opacity-60">Agregar a la lista de Kelly</button>
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
          Lo que el sistema no puede clasificar solo: grupos que el Excel y el sistema clasifican distinto, y gastos que no se entienden.
          Tu decisión se aplica ya; si contradice el Excel, queda en «Correcciones para el Excel» hasta que el Excel lo traiga corregido.
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
          <h2 className="text-sm font-semibold text-gray-900">Correcciones para el Excel</h2>
          <p className="text-xs text-gray-500">Cada punto se cierra solo cuando llega un Excel que ya lo trae corregido.</p>
          {data.paraKelly.map((k) => {
            const texto = `Correcciones para el Excel de ${k.sede}:\n${k.lineas.join("\n")}`;
            return (
              <div key={k.businessId} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-gray-800">{k.sede}</span>
                  <button onClick={() => { void navigator.clipboard.writeText(texto); showToast("Copiado", "success"); }} className="text-xs text-primary flex items-center gap-1">
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
              const d = i.datos as { grupo?: string; concepto?: string; categoria?: string; monto?: number; texto?: string };
              const dec = i.decision as { tipoPE?: TipoPE; accion?: string; categoriaDestino?: string | null } | null;
              return (
                <li key={i.id} className="px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
                  <span className="text-gray-700">
                    {i.sede} · {i.alcance === "categoria" ? `Grupo «${d.grupo}»` : i.alcance === "concepto" ? `Pagos que dicen «${d.texto}»` : d.concepto} →{" "}
                    <strong>{dec?.accion === "ok" ? "está bien" : dec?.tipoPE ?? "—"}</strong>
                    {dec?.categoriaDestino ? ` (${dec.categoriaDestino})` : ""} · {i.decididoPor}
                  </span>
                  {i.kellyPendiente && !i.kellyCorregidoEn ? (
                    <button onClick={() => start(async () => { await marcarCorregidoPorKelly(i.id); recargar(); })} className="text-primary">Ya se corrigió en el Excel</button>
                  ) : i.kellyPendiente ? <Chip tono="verde">Corregido en el Excel</Chip> : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
