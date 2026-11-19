"use client";

/**
 * Alta rápida de una tarea (estilo Asana, 19-nov-2026): una línea con qué, quién, para cuándo y área, y Enter.
 * Recuerda el último responsable y área (solo en este navegador) para cargar varias seguidas, como en una
 * reunión. La descripción se agrega después en el detalle.
 */

import { useState } from "react";
import { Plus } from "lucide-react";
import { crearAcuerdo } from "@/app/actions/acuerdos";
import { AREA_LABEL, AREAS, PRIORIDAD_LABEL, PRIORIDADES, type Area, type Persona, type Prioridad } from "@/lib/acuerdos";
import { useToast } from "@/components/toast-provider";

const SEL = "border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white";
const GUARDA = "yayis_alta_rapida";

const mover = (f: string, n: number) => {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Fechas de un toque: hoy, mañana, el viernes que viene y en una semana. */
function atajos(hoy: string): { k: string; label: string; fecha: string }[] {
  const dow = new Date(`${hoy}T12:00:00Z`).getUTCDay();
  const viernes = mover(hoy, ((5 - dow + 7) % 7) || 7);
  return [
    { k: "hoy", label: "Hoy", fecha: hoy },
    { k: "manana", label: "Mañana", fecha: mover(hoy, 1) },
    { k: "viernes", label: "Este viernes", fecha: viernes },
    { k: "semana", label: "En una semana", fecha: mover(hoy, 7) },
  ];
}

function leer(): { responsable: string; area: string } {
  try { return JSON.parse(localStorage.getItem(GUARDA) ?? "") as { responsable: string; area: string }; } catch { return { responsable: "", area: "" }; }
}

export function SelectorPersona({ personas, valor, onChange, className = SEL }: { personas: Persona[]; valor: string; onChange: (v: string) => void; className?: string }) {
  const grupos: [string, Persona[]][] = [
    ["Dirección", personas.filter((p) => p.tipo === "direccion")],
    ["Administradores", personas.filter((p) => p.tipo === "admin")],
    ["Equipo", personas.filter((p) => p.tipo === "equipo")],
  ];
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value)} className={className} aria-label="Responsable">
      <option value="">¿Quién?</option>
      {grupos.filter(([, l]) => l.length).map(([t, l]) => (
        <optgroup key={t} label={t}>{l.map((p) => <option key={p.clave} value={p.clave}>{p.nombre}{p.tipo === "admin" ? ` · ${p.detalle.replace("Administración · ", "")}` : ""}</option>)}</optgroup>
      ))}
    </select>
  );
}

export function AltaRapida({ personas, hoy, reunion, onCreado }: {
  personas: Persona[];
  hoy: string;
  /** Si viene, la tarea es un acuerdo de esa reunión (y toma su área). */
  reunion?: { id: number; area: Area };
  onCreado: () => void;
}) {
  const { showToast } = useToast();
  const [que, setQue] = useState("");
  const [responsable, setResponsable] = useState(() => (typeof window === "undefined" ? "" : leer().responsable));
  const [area, setArea] = useState<string>(() => reunion?.area ?? (typeof window === "undefined" ? "" : leer().area));
  const [cuando, setCuando] = useState("viernes");
  const [fecha, setFecha] = useState("");
  const [prioridad, setPrioridad] = useState<Prioridad>("media");
  const [ocupado, setOcupado] = useState(false);
  const opciones = atajos(hoy);
  const fechaLimite = cuando === "otra" ? fecha : opciones.find((o) => o.k === cuando)?.fecha ?? "";

  async function crear() {
    if (!que.trim()) return;
    setOcupado(true);
    const r = await crearAcuerdo({ que, area, responsable, fechaLimite, prioridad, reunionId: reunion?.id ?? null });
    setOcupado(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    try { localStorage.setItem(GUARDA, JSON.stringify({ responsable, area: reunion ? leer().area : area })); } catch { /* solo comodidad */ }
    setQue("");
    setPrioridad("media");
    showToast("Tarea creada", "success");
    onCreado();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200/80 bg-white p-2 focus-within:border-primary/40">
      <Plus className="w-4 h-4 text-gray-400 ml-1 shrink-0" aria-hidden />
      <input value={que} onChange={(e) => setQue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void crear(); }}
        placeholder={reunion ? "Agregar acuerdo de esta reunión y Enter" : "Escribe una tarea y presiona Enter"} aria-label="Qué se hará"
        className="flex-1 min-w-[200px] px-1 py-2 text-sm outline-none bg-transparent" />
      <SelectorPersona personas={personas} valor={responsable} onChange={setResponsable} />
      <select value={cuando} onChange={(e) => setCuando(e.target.value)} className={SEL} aria-label="Para cuándo">
        {opciones.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
        <option value="otra">Otra fecha…</option>
      </select>
      {cuando === "otra" && <input type="date" value={fecha} min={hoy} onChange={(e) => setFecha(e.target.value)} className={SEL} aria-label="Fecha límite" />}
      {!reunion && (
        <select value={area} onChange={(e) => setArea(e.target.value)} className={SEL} aria-label="Área">
          <option value="">Área</option>
          {AREAS.map((x) => <option key={x} value={x}>{AREA_LABEL[x]}</option>)}
        </select>
      )}
      <select value={prioridad} onChange={(e) => setPrioridad(e.target.value as Prioridad)} className={SEL} aria-label="Prioridad">
        {PRIORIDADES.map((p) => <option key={p} value={p}>Prioridad {PRIORIDAD_LABEL[p].toLowerCase()}</option>)}
      </select>
      <button type="button" onClick={() => void crear()} disabled={ocupado || !que.trim()}
        className="px-3 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-40">
        {ocupado ? "Creando…" : "Crear"}
      </button>
    </div>
  );
}
