"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Target, Gauge, HeartPulse, Users, ClipboardCheck, AlertTriangle,
  Plus, Pencil, X, Check, Loader2, Trash2, Sparkles,
} from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { ProgressBar } from "@/components/ui/Sparkline";
import {
  getDireccionBoard, saveDireccionItem, setDireccionStatus, archiveDireccionItem, seedDireccionBoard,
  type DireccionBoard,
} from "@/app/actions/direccion";
import {
  METRIC_KEYS, METRIC_LABELS, SALUD_STATUS, DECISION_STATUS,
  type Block, type DireccionItem, type MetricKey,
} from "@/lib/direccion/types";
import { resolverNumero, formatValor, resumenSalud } from "@/lib/direccion/engine";
import type { NumeroResuelto } from "@/lib/direccion/types";

/**
 * Sistema de Dirección (ASDR CORE) — adaptado de la pizarra del asesor
 * de Jahnn. Seis bloques, TODO editable: las metas son de Yayi's.
 *
 * Lo que este tablero hace y una pizarra no: los "números que mandan"
 * pueden enlazarse al sistema y actualizarse solos, con su semáforo
 * contra la meta. Lo demás se escribe a mano, como en la pared.
 */

const SALUD_UI: Record<string, { dot: string; text: string; label: string }> = {
  bien: { dot: "bg-emerald-500", text: "text-emerald-700", label: "Funciona" },
  atencion: { dot: "bg-amber-500", text: "text-amber-700", label: "Atención" },
  roto: { dot: "bg-red-500", text: "text-red-700", label: "Roto" },
};

const DECISION_UI: Record<string, { label: string; cls: string }> = {
  tomada: { label: "Tomadas", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pendiente: { label: "Pendientes", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  delegada: { label: "Delegadas", cls: "bg-sky-50 text-sky-700 border-sky-200" },
};

const SEMAFORO_TEXT: Record<string, string> = {
  verde: "text-emerald-600", ambar: "text-amber-600", rojo: "text-red-600",
};
const SEMAFORO_BAR: Record<string, "positive" | "warning" | "negative"> = {
  verde: "positive", ambar: "warning", rojo: "negative",
};

function Card({
  icon: Icon, title, hint, children, className = "",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string; hint?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`bg-white rounded-2xl border border-gray-200/70 shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-6 ${className}`}>
      <div className="flex items-baseline gap-2">
        <Icon className="w-4 h-4 text-gray-400 shrink-0 translate-y-0.5" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-gray-500">{title}</h2>
      </div>
      {hint && <p className="text-[11px] text-gray-400 mt-1 ml-6">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-primary transition-colors"
    >
      <Plus className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

/** Objetivo con meta: muestra el avance vivo, igual que un número. */
function GoalRow({
  n, onEdit, onDelete,
}: { n: NumeroResuelto; onEdit: () => void; onDelete: () => void }) {
  return (
    <li className="group py-3 border-t border-gray-100 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-gray-900 leading-snug">{n.title}</span>
          {n.detail && <span className="block text-[11px] text-gray-400 mt-0.5 leading-snug">{n.detail}</span>}
        </span>
        <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={onEdit} className="text-gray-300 hover:text-primary p-1"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={onDelete} className="text-gray-300 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
        </span>
      </div>
      {n.targetValue !== null && (
        <div className="mt-2">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className={`font-semibold tabular-nums ${n.semaforo ? SEMAFORO_TEXT[n.semaforo] : "text-gray-900"}`}>
              {formatValor(n.value, n.targetUnit)}
            </span>
            <span className="text-gray-400 tabular-nums">
              meta {formatValor(n.targetValue, n.targetUnit)}
              {n.cumplimientoPct !== null && ` · ${Math.round(n.cumplimientoPct)}%`}
            </span>
          </div>
          {n.cumplimientoPct !== null && n.semaforo && (
            <div className="mt-1.5"><ProgressBar pct={n.cumplimientoPct} tone={SEMAFORO_BAR[n.semaforo]} /></div>
          )}
          {n.value === null && (
            <p className="mt-1 text-[11px] text-amber-600">Aún sin dato para medir el avance.</p>
          )}
        </div>
      )}
    </li>
  );
}

/** Fila de texto simple (personas, alertas). */
function TextRow({
  item, onEdit, onDelete,
}: { item: DireccionItem; onEdit: () => void; onDelete: () => void }) {
  return (
    <li className="group flex items-start gap-3 py-2.5 border-t border-gray-100 first:border-t-0">
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-gray-900 leading-snug">{item.title}</span>
        {item.detail && <span className="block text-xs text-gray-400 mt-0.5 leading-snug">{item.detail}</span>}
      </span>
      <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={onEdit} className="text-gray-300 hover:text-primary p-1" title="Editar"><Pencil className="w-3.5 h-3.5" /></button>
        <button onClick={onDelete} className="text-gray-300 hover:text-red-600 p-1" title="Quitar"><Trash2 className="w-3.5 h-3.5" /></button>
      </span>
    </li>
  );
}

export function DireccionClient() {
  const { showToast } = useToast();
  const [board, setBoard] = useState<DireccionBoard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ block: Block; item: DireccionItem | null } | null>(null);

  // Sin dependencias: `showToast` cambia en cada render y hacía que el
  // efecto recargara el tablero en bucle.
  const load = useCallback(async () => {
    const r = await getDireccionBoard();
    if (r.ok) { setBoard(r.data); setLoadError(null); }
    else setLoadError(r.error);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  if (loadError) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/70 p-8 text-center text-sm text-gray-500">
        {loadError}
      </div>
    );
  }
  if (!board) return null;

  const vacio = board.items.length === 0;
  const by = (b: Block) => board.items.filter((i) => i.block === b);
  const numeros = by("numero").map((i) => resolverNumero(i, board.metricas));
  // Los objetivos también pueden llevar meta y avance (pedido de Jahnn:
  // "si decido que Profit First sea 10%, el sistema debe mostrarme a
  // qué nivel estamos"). Sin meta se ven como texto simple.
  const objetivos = by("objetivo").map((i) => resolverNumero(i, board.metricas));
  const salud = resumenSalud(by("salud"));

  async function handleDelete(item: DireccionItem) {
    if (!confirm(`¿Quitar "${item.title}" del tablero?`)) return;
    setBusy(true);
    const r = await archiveDireccionItem(item.id);
    setBusy(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    load();
  }

  async function handleStatus(item: DireccionItem, status: string) {
    setBusy(true);
    const r = await setDireccionStatus(item.id, status);
    setBusy(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    load();
  }

  async function handleSeed() {
    setBusy(true);
    const r = await seedDireccionBoard();
    setBusy(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(
      r.creados === 0
        ? "El tablero ya tiene toda la estructura base."
        : `${r.creados} ${r.creados === 1 ? "elemento añadido" : "elementos añadidos"} — ahora ajusta las metas a tu realidad.`,
      "success",
    );
    load();
  }

  return (
    <div className="space-y-8 pb-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] font-semibold text-gray-900 tracking-[-0.02em] leading-none">
            Sistema de Dirección
          </h1>
          <p className="text-sm text-gray-400 mt-1.5">
            El tablero con el que se dirige: metas, números, sistema, personas y decisiones.
          </p>
        </div>
        <div className="flex items-center gap-5">
          {!vacio && !board.tablaFalta && (
            <button
              onClick={handleSeed}
              disabled={busy}
              title="Añade las piezas nuevas de la estructura base (EBITDA, Profit First…) sin tocar lo que ya escribiste"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-primary transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Completar con lo que falta
            </button>
          )}
          {salud.pct !== null && (
            <div className="text-right">
              <div className="text-[10px] font-medium uppercase tracking-[0.09em] text-gray-400">Sistema funcionando</div>
              <div className="text-2xl font-semibold text-gray-900 tabular-nums">{salud.pct}%</div>
            </div>
          )}
        </div>
      </header>

      {board.tablaFalta && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-sm text-amber-900">
          Falta correr la migración <code className="font-mono text-xs">2026-07-29-sistema-direccion.sql</code> en
          Neon. Mientras tanto el tablero no puede guardar nada.
        </div>
      )}

      {vacio && !board.tablaFalta && (
        <div className="bg-white rounded-2xl border border-gray-200/70 p-8 text-center">
          <Sparkles className="w-6 h-6 text-primary mx-auto" />
          <h2 className="mt-3 text-base font-semibold text-gray-900">Prepara tu tablero</h2>
          <p className="mt-1.5 text-sm text-gray-500 max-w-md mx-auto">
            Creo la estructura con tus sedes, tu equipo y tus números ya enlazados al sistema.
            Las metas quedan en blanco a propósito: son tuyas, no de otra empresa.
          </p>
          <button
            onClick={handleSeed}
            disabled={busy}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-xl disabled:opacity-50 transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Preparar tablero
          </button>
        </div>
      )}

      {!vacio && (
        <>
          {/* Objetivos + Números que mandan */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            <Card icon={Target} title="Objetivos del año" hint="¿A dónde vamos?">
              <ul>
                {objetivos.map((o) =>
                  o.targetValue !== null ? (
                    <GoalRow key={o.id} n={o} onEdit={() => setEditing({ block: "objetivo", item: o })} onDelete={() => handleDelete(o)} />
                  ) : (
                    <TextRow key={o.id} item={o} onEdit={() => setEditing({ block: "objetivo", item: o })} onDelete={() => handleDelete(o)} />
                  ),
                )}
              </ul>
              <AddButton label="Añadir objetivo" onClick={() => setEditing({ block: "objetivo", item: null })} />
            </Card>

            <Card icon={Gauge} title="Números que mandan" hint="Los que deciden si el mes va bien" className="lg:col-span-2">
              <div className="space-y-1">
                {numeros.map((n) => (
                  <div key={n.id} className="group py-2.5 border-t border-gray-100 first:border-t-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-gray-900 leading-snug">
                          {n.title}
                          {n.automatico && (
                            <span className="ml-1.5 text-[10px] uppercase tracking-wide text-primary/70 font-medium">auto</span>
                          )}
                        </span>
                        {n.detail && <span className="block text-[11px] text-gray-400 mt-0.5">{n.detail}</span>}
                      </span>
                      <span className="text-right shrink-0">
                        <span className={`block text-base font-semibold tabular-nums ${n.semaforo ? SEMAFORO_TEXT[n.semaforo] : "text-gray-900"}`}>
                          {formatValor(n.value, n.targetUnit)}
                        </span>
                        <span className="block text-[11px] text-gray-400 tabular-nums">
                          {n.targetValue !== null ? `meta ${formatValor(n.targetValue, n.targetUnit)}` : "sin meta"}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => setEditing({ block: "numero", item: n })} className="text-gray-300 hover:text-primary p-1"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(n)} className="text-gray-300 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                      </span>
                    </div>
                    {n.cumplimientoPct !== null && n.semaforo && (
                      <div className="mt-2">
                        <ProgressBar pct={n.cumplimientoPct} tone={SEMAFORO_BAR[n.semaforo]} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <AddButton label="Añadir número" onClick={() => setEditing({ block: "numero", item: null })} />
            </Card>
          </div>

          {/* Salud + Decisiones */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            <Card icon={HeartPulse} title="Salud del sistema" hint="¿Qué camina solo y qué no?">
              <ul>
                {by("salud").map((i) => {
                  const ui = SALUD_UI[i.status ?? "atencion"] ?? SALUD_UI.atencion;
                  return (
                    <li key={i.id} className="group py-2.5 border-t border-gray-100 first:border-t-0">
                      <div className="flex items-start gap-2.5">
                        <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${ui.dot}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-gray-900 leading-snug">{i.title}</span>
                          {i.detail && <span className="block text-[11px] text-gray-400 mt-0.5">{i.detail}</span>}
                        </span>
                        <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button onClick={() => setEditing({ block: "salud", item: i })} className="text-gray-300 hover:text-primary p-1"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete(i)} className="text-gray-300 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                        </span>
                      </div>
                      <div className="mt-1.5 ml-4.5 flex gap-1">
                        {SALUD_STATUS.map((st) => (
                          <button
                            key={st}
                            onClick={() => handleStatus(i, st)}
                            disabled={busy}
                            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                              i.status === st ? `${SALUD_UI[st].text} font-semibold` : "text-gray-300 hover:text-gray-500"
                            }`}
                          >
                            {SALUD_UI[st].label}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <AddButton label="Añadir pieza" onClick={() => setEditing({ block: "salud", item: null })} />
            </Card>

            <Card icon={ClipboardCheck} title="Decisiones de la semana" hint="Qué decidí, qué falta, qué delegué" className="lg:col-span-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {DECISION_STATUS.map((st) => (
                  <div key={st}>
                    <div className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border inline-block ${DECISION_UI[st].cls}`}>
                      {DECISION_UI[st].label}
                    </div>
                    <ul className="mt-2.5 space-y-2">
                      {by("decision").filter((i) => i.status === st).map((i) => (
                        <li key={i.id} className="group bg-gray-50/70 rounded-lg p-2.5">
                          <div className="text-xs text-gray-900 leading-snug">{i.title}</div>
                          {i.detail && <div className="text-[11px] text-gray-400 mt-0.5">{i.detail}</div>}
                          <div className="mt-1.5 flex items-center gap-1">
                            {DECISION_STATUS.filter((s2) => s2 !== st).map((s2) => (
                              <button
                                key={s2}
                                onClick={() => handleStatus(i, s2)}
                                disabled={busy}
                                className="text-[10px] text-gray-400 hover:text-primary transition-colors"
                              >
                                → {DECISION_UI[s2].label.slice(0, -1)}
                              </button>
                            ))}
                            <span className="flex-1" />
                            <button onClick={() => setEditing({ block: "decision", item: i })} className="text-gray-300 hover:text-primary opacity-0 group-hover:opacity-100"><Pencil className="w-3 h-3" /></button>
                            <button onClick={() => handleDelete(i)} className="text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <AddButton label="Añadir decisión" onClick={() => setEditing({ block: "decision", item: null })} />
            </Card>
          </div>

          {/* Personas + Alertas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <Card icon={Users} title="Personas clave" hint="Quién responde por qué">
              <ul>
                {by("persona").map((i) => (
                  <TextRow key={i.id} item={i} onEdit={() => setEditing({ block: "persona", item: i })} onDelete={() => handleDelete(i)} />
                ))}
              </ul>
              <AddButton label="Añadir persona" onClick={() => setEditing({ block: "persona", item: null })} />
            </Card>

            <Card icon={AlertTriangle} title="Alertas de realidad" hint="Los principios que evitan autoengaños">
              <ul>
                {by("alerta").map((i) => (
                  <TextRow key={i.id} item={i} onEdit={() => setEditing({ block: "alerta", item: i })} onDelete={() => handleDelete(i)} />
                ))}
              </ul>
              <AddButton label="Añadir principio" onClick={() => setEditing({ block: "alerta", item: null })} />
            </Card>
          </div>
        </>
      )}

      {editing && (
        <ItemModal
          block={editing.block}
          item={editing.item}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

const BLOCK_TITLES: Record<Block, string> = {
  objetivo: "objetivo", numero: "número que manda", salud: "pieza del sistema",
  persona: "persona clave", decision: "decisión", alerta: "principio",
};

function ItemModal({
  block, item, onClose, onSaved,
}: { block: Block; item: DireccionItem | null; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const [title, setTitle] = useState(item?.title ?? "");
  const [detail, setDetail] = useState(item?.detail ?? "");
  const [status, setStatus] = useState(item?.status ?? (block === "salud" ? "atencion" : block === "decision" ? "pendiente" : ""));
  const [metricKey, setMetricKey] = useState<string>(item?.metricKey ?? "");
  const [manualValue, setManualValue] = useState(item?.manualValue?.toString() ?? "");
  const [targetValue, setTargetValue] = useState(item?.targetValue?.toString() ?? "");
  const [targetUnit, setTargetUnit] = useState(item?.targetUnit ?? "S/");
  const [higherIsBetter, setHigherIsBetter] = useState(item?.higherIsBetter ?? true);
  const [saving, setSaving] = useState(false);

  // Objetivos y números comparten la mecánica de meta + avance.
  const esNumero = block === "numero" || block === "objetivo";

  async function handleSave() {
    setSaving(true);
    const r = await saveDireccionItem({
      id: item?.id,
      block,
      title,
      detail: detail || null,
      status: status || null,
      metricKey: esNumero ? (metricKey || null) : null,
      manualValue: esNumero && !metricKey && manualValue.trim() !== "" ? Number(manualValue) : null,
      targetValue: esNumero && targetValue.trim() !== "" ? Number(targetValue) : null,
      targetUnit: esNumero ? targetUnit : null,
      higherIsBetter,
    });
    setSaving(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            {item ? "Editar" : "Nuevo"} {BLOCK_TITLES[block]}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>

        <div
          className="p-6 space-y-4"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !saving && (e.target as HTMLElement).tagName === "INPUT") {
              e.preventDefault();
              void handleSave();
            }
          }}
        >
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Texto</label>
            <input
              value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder={block === "alerta" ? "Ej. Más ventas ≠ más utilidad" : "Escríbelo corto y claro"}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Detalle (opcional)</label>
            <input
              value={detail} onChange={(e) => setDetail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Una línea de contexto"
            />
          </div>

          {block === "salud" && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Estado</label>
              <div className="flex gap-2">
                {SALUD_STATUS.map((st) => (
                  <button key={st} type="button" onClick={() => setStatus(st)}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${status === st ? "bg-primary-light text-white border-primary-light" : "bg-white text-gray-700 border-gray-300"}`}>
                    {SALUD_UI[st].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {block === "decision" && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Columna</label>
              <div className="flex gap-2">
                {DECISION_STATUS.map((st) => (
                  <button key={st} type="button" onClick={() => setStatus(st)}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${status === st ? "bg-primary-light text-white border-primary-light" : "bg-white text-gray-700 border-gray-300"}`}>
                    {DECISION_UI[st].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {esNumero && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">¿De dónde sale el valor?</label>
                <select
                  value={metricKey} onChange={(e) => {
                    setMetricKey(e.target.value);
                    if (e.target.value) setTargetUnit(METRIC_LABELS[e.target.value as MetricKey].unit);
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">Lo escribo yo (manual)</option>
                  {METRIC_KEYS.map((k) => (
                    <option key={k} value={k}>Automático · {METRIC_LABELS[k].label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                  {metricKey
                    ? METRIC_LABELS[metricKey as MetricKey].hint
                    : "El sistema no lo calcula: actualízalo tú cuando lo revises."}
                </p>
              </div>

              {!metricKey && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Valor actual</label>
                  <input type="number" step="0.01" value={manualValue} onChange={(e) => setManualValue(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Ej. 9.3" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Meta</label>
                  <input type="number" step="0.01" value={targetValue} onChange={(e) => setTargetValue(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Sin meta = sin semáforo" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Unidad</label>
                  <select value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                    {["S/", "%", "pts", "min", "días", "und"].map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">¿Qué es mejor?</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setHigherIsBetter(true)}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border ${higherIsBetter ? "bg-primary-light text-white border-primary-light" : "bg-white text-gray-700 border-gray-300"}`}>
                    Más alto
                  </button>
                  <button type="button" onClick={() => setHigherIsBetter(false)}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border ${!higherIsBetter ? "bg-primary-light text-white border-primary-light" : "bg-white text-gray-700 border-gray-300"}`}>
                    Más bajo
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Ventas o NPS: más alto es mejor. Tiempo de entrega o mermas: más bajo.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={handleSave} disabled={saving || title.trim().length < 2}
            className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50 inline-flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
