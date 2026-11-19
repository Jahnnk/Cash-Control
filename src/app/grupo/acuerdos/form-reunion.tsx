"use client";

/** Registrar una reunión con todos sus acuerdos de una vez (Acuerdos y tareas). */

import { useState } from "react";
import { Plus } from "lucide-react";
import { crearReunion } from "@/app/actions/acuerdos";
import { AREA_LABEL, AREAS, type Persona } from "@/lib/acuerdos";
import { SelectorPersona } from "@/components/acuerdos/alta-rapida";

const INPUT = "w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white";
type Datos = { hoy: string; personas: Persona[] };

type FilaReunion = { que: string; responsable: string; fechaLimite: string };
const filaVacia = (): FilaReunion => ({ que: "", responsable: "", fechaLimite: "" });

/** Una reunión con todos sus acuerdos, de una vez. */
export function FormReunion({ d, onListo, onCancelar }: { d: Datos; onListo: () => void; onCancelar: () => void }) {
  const [f, setF] = useState({ fecha: d.hoy, area: "", titulo: "", asistentes: "", notas: "" });
  const [filas, setFilas] = useState<FilaReunion[]>([filaVacia(), filaVacia()]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cambiar = (i: number, cambio: Partial<FilaReunion>) => setFilas(filas.map((x, j) => (j === i ? { ...x, ...cambio } : x)));

  async function guardar() {
    setOcupado(true);
    setError(null);
    const r = await crearReunion({ ...f, acuerdos: filas });
    setOcupado(false);
    if (!r.ok) { setError(r.error); return; }
    onListo();
  }

  return (
    <div className="bg-white border border-gray-200/80 rounded-2xl p-4 space-y-3">
      <h2 className="text-[15px] font-semibold text-gray-900">Registrar reunión</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="sm:col-span-2 text-xs text-gray-600">Nombre de la reunión
          <input autoFocus value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} className={INPUT} placeholder="Ej. Reunión de marketing de noviembre" />
        </label>
        <label className="text-xs text-gray-600">Fecha
          <input type="date" value={f.fecha} max={d.hoy} onChange={(e) => setF({ ...f, fecha: e.target.value })} className={INPUT} />
        </label>
        <label className="text-xs text-gray-600">Área
          <select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} className={INPUT}>
            <option value="">Elige…</option>
            {AREAS.map((x) => <option key={x} value={x}>{AREA_LABEL[x]}</option>)}
          </select>
        </label>
        <label className="sm:col-span-2 text-xs text-gray-600">Asistentes (opcional)
          <input value={f.asistentes} onChange={(e) => setF({ ...f, asistentes: e.target.value })} className={INPUT} placeholder="Ej. Jahnn, Juani, coordinadora de marketing" />
        </label>
        <label className="sm:col-span-3 text-xs text-gray-600">Notas (opcional)
          <textarea value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} rows={2} className={INPUT} />
        </label>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-800">Acuerdos</h3>
        <p className="text-xs text-gray-500">Qué se hará, quién y para cuándo. Las filas vacías no se guardan.</p>
        <div className="mt-2 space-y-2">
          {filas.map((x, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_200px_150px] items-end bg-gray-50 rounded-xl p-2">
              <label className="text-xs text-gray-600">{i + 1}. Qué se hará
                <input value={x.que} onChange={(e) => cambiar(i, { que: e.target.value })} className={INPUT} />
              </label>
              <label className="text-xs text-gray-600">Responsable
                <SelectorPersona personas={d.personas} valor={x.responsable} onChange={(v) => cambiar(i, { responsable: v })} className={INPUT} />
              </label>
              <label className="text-xs text-gray-600">Fecha límite
                <input type="date" value={x.fechaLimite} min={d.hoy} onChange={(e) => cambiar(i, { fechaLimite: e.target.value })} className={INPUT} />
              </label>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setFilas([...filas, filaVacia()])} className="mt-2 text-xs font-medium text-primary inline-flex items-center gap-1"><Plus className="w-3 h-3" />Otro acuerdo</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={ocupado} onClick={() => void guardar()} className="px-3 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50">
          {ocupado ? "Guardando…" : "Guardar reunión"}
        </button>
        <button type="button" onClick={onCancelar} className="px-2 py-1 text-sm text-gray-500">Cancelar</button>
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>
    </div>
  );
}
