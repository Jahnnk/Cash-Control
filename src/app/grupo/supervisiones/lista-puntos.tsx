"use client";

/**
 * Editar la lista de puntos. Desactivar en vez de borrar: las visitas
 * viejas guardaron el punto con su nombre, y un punto que ya no se revisa
 * no debe desaparecer del historial.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { guardarPuntoSupervision, type PuntoSupervision } from "@/app/actions/supervisiones";
import { ETIQUETA_GRAVEDAD, type Gravedad } from "@/lib/supervisiones";

type Borrador = { id: number | null; nombre: string; descripcion: string; gravedad: Gravedad; activo: boolean };

export function ListaPuntos({ puntos, onCambio }: { puntos: PuntoSupervision[]; onCambio: () => void }) {
  const { showToast } = useToast();
  const [editando, setEditando] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(b: Borrador) {
    setGuardando(true);
    const r = await guardarPuntoSupervision(b);
    setGuardando(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast("Lista actualizada", "success");
    setEditando(null);
    onCambio();
  }

  const formulario = (b: Borrador) => (
    <div className="space-y-2 bg-gray-50 rounded-lg p-3">
      <input
        value={b.nombre}
        onChange={(e) => setEditando({ ...b, nombre: e.target.value })}
        placeholder="Nombre del punto"
        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
      />
      <input
        value={b.descripcion}
        onChange={(e) => setEditando({ ...b, descripcion: e.target.value })}
        placeholder="Qué se revisa (opcional)"
        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
      />
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {(["critica", "normal"] as Gravedad[]).map((g) => (
          <label key={g} className="flex items-center gap-1">
            <input type="radio" checked={b.gravedad === g} onChange={() => setEditando({ ...b, gravedad: g })} />
            {ETIQUETA_GRAVEDAD[g]}
          </label>
        ))}
        {b.id !== null && (
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={b.activo} onChange={(e) => setEditando({ ...b, activo: e.target.checked })} />
            Se revisa en las visitas
          </label>
        )}
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={() => setEditando(null)} className="px-3 py-1.5 text-xs text-gray-600">Cancelar</button>
        <button
          onClick={() => void guardar(b)}
          disabled={guardando}
          className="px-3 py-1.5 text-xs bg-primary text-white rounded-lg flex items-center gap-1 disabled:opacity-60"
        >
          {guardando && <Loader2 className="w-3 h-3 animate-spin" />} Guardar
        </button>
      </div>
    </div>
  );

  return (
    <div className="px-4 pb-4 space-y-2">
      <p className="text-[11px] text-gray-500">
        La gravedad es la que tendrá la observación si el punto no se cumple (en la visita se puede cambiar).
        Cambiar un punto no altera las visitas ya registradas.
      </p>
      <ul className="divide-y divide-gray-100">
        {puntos.map((p) => (
          <li key={p.id} className="py-2">
            {editando?.id === p.id ? formulario(editando) : (
              <button
                onClick={() => setEditando({ id: p.id, nombre: p.nombre, descripcion: p.descripcion ?? "", gravedad: p.gravedad, activo: p.activo })}
                className={`w-full text-left ${p.activo ? "" : "opacity-50"}`}
              >
                <div className="text-sm text-gray-900">
                  {p.nombre}
                  <span className={`ml-1.5 text-[10px] font-semibold uppercase ${p.gravedad === "critica" ? "text-red-600" : "text-gray-400"}`}>
                    {ETIQUETA_GRAVEDAD[p.gravedad]}
                  </span>
                  {!p.activo && <span className="ml-1.5 text-[10px] text-gray-400">(no se revisa)</span>}
                </div>
                {p.descripcion && <div className="text-[11px] text-gray-500">{p.descripcion}</div>}
              </button>
            )}
          </li>
        ))}
      </ul>
      {editando?.id === null ? formulario(editando) : (
        <button
          onClick={() => setEditando({ id: null, nombre: "", descripcion: "", gravedad: "normal", activo: true })}
          className="text-xs text-primary"
        >
          + Agregar punto
        </button>
      )}
    </div>
  );
}
