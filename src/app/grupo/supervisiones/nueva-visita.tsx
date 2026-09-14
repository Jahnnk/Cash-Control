"use client";

/**
 * Registrar una visita: la lista de puntos, uno por uno.
 *
 * Juani está parada en el local con el celular. Por eso cada punto se
 * marca con un toque (Cumple / No cumple / No aplica) y el detalle solo se
 * pide cuando algo no cumple. Nada se guarda a medias: la visita entra
 * completa o no entra, y no deja guardar con puntos sin marcar — un punto
 * olvidado no puede leerse como "cumple".
 *
 * Las fotos del problema van DESPUÉS de guardar: necesitan la observación
 * ya creada para colgarse de ella.
 */

import { useState } from "react";
import { Check, X, Minus, Plus, Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { SupervisionPhotos } from "@/components/supervision-photos";
import { registrarVisita, type PuntoSupervision } from "@/app/actions/supervisiones";
import { ETIQUETA_GRAVEDAD, PLAZO_HORAS, SEDES_SUPERVISADAS, type Gravedad } from "@/lib/supervisiones";

type Resultado = "cumple" | "no_cumple" | "no_aplica";
type Marca = { resultado: Resultado | null; detalle: string; gravedad: Gravedad };

const plazoTexto = (g: Gravedad) => (PLAZO_HORAS[g] < 48 ? `${PLAZO_HORAS[g]} h` : `${PLAZO_HORAS[g] / 24} días`);

function GravedadToggle({ valor, onChange }: { valor: Gravedad; onChange: (g: Gravedad) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-[11px]">
      {(["critica", "normal"] as Gravedad[]).map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => onChange(g)}
          className={`px-2.5 py-1 ${valor === g ? (g === "critica" ? "bg-red-600 text-white" : "bg-gray-700 text-white") : "bg-white text-gray-600"}`}
        >
          {ETIQUETA_GRAVEDAD[g]} · {plazoTexto(g)}
        </button>
      ))}
    </div>
  );
}

export function NuevaVisita({
  puntos,
  hoy,
  onCerrar,
  onGuardada,
}: {
  puntos: PuntoSupervision[];
  hoy: string;
  onCerrar: () => void;
  onGuardada: () => void;
}) {
  const { showToast } = useToast();
  const activos = puntos.filter((p) => p.activo);
  const [sede, setSede] = useState<number | null>(null);
  const [fecha, setFecha] = useState(hoy);
  const [notas, setNotas] = useState("");
  const [marcas, setMarcas] = useState<Record<number, Marca>>(() =>
    Object.fromEntries(activos.map((p) => [p.id, { resultado: null, detalle: "", gravedad: p.gravedad }])),
  );
  const [extras, setExtras] = useState<{ titulo: string; detalle: string; gravedad: Gravedad }[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [creadas, setCreadas] = useState<{ id: string; titulo: string }[] | null>(null);

  const faltan = activos.filter((p) => marcas[p.id]?.resultado === null).length;
  const set = (id: number, cambio: Partial<Marca>) => setMarcas((m) => ({ ...m, [id]: { ...m[id], ...cambio } }));

  async function guardar() {
    if (sede === null) { showToast("Elige la sede que visitaste.", "error"); return; }
    if (faltan > 0) { showToast(`Faltan ${faltan} punto(s) por marcar.`, "error"); return; }
    setGuardando(true);
    const r = await registrarVisita({
      businessId: sede, fecha, notas,
      resultados: activos.map((p) => ({ itemId: p.id, resultado: marcas[p.id].resultado!, detalle: marcas[p.id].detalle, gravedad: marcas[p.id].gravedad })),
      extras,
    });
    setGuardando(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    onGuardada();
    if (r.observaciones.length === 0) {
      showToast("Visita registrada: todo en orden.", "success");
      onCerrar();
    } else {
      showToast(`Visita registrada con ${r.observaciones.length} observación(es).`, "success");
      setCreadas(r.observaciones);
    }
  }

  // Paso 2: fotos del problema (opcional, pero ayuda al administrador a saber qué corregir).
  if (creadas) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div>
          <div className="text-sm font-semibold text-gray-900">Fotos de lo que encontraste</div>
          <p className="text-xs text-gray-500">Opcional. Al administrador le sirve para saber exactamente qué corregir.</p>
        </div>
        {creadas.map((o) => (
          <div key={o.id} className="border-t border-gray-100 pt-3">
            <div className="text-sm text-gray-800 mb-2">{o.titulo}</div>
            <SupervisionPhotos observacionId={o.id} tipo="supervision_problema" titulo="Así lo encontré" puedeSubir puedeBorrar />
          </div>
        ))}
        <button onClick={onCerrar} className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-medium">
          Listo
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">Nueva visita</div>
        <button onClick={onCerrar} className="text-xs text-gray-500 hover:text-gray-800">Cancelar</button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {SEDES_SUPERVISADAS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSede(s.id)}
            className={`px-4 py-2 rounded-lg text-sm border ${sede === s.id ? "bg-primary text-white border-primary" : "bg-white text-gray-700 border-gray-300"}`}
          >
            {s.nombre}
          </button>
        ))}
        <input
          type="date"
          value={fecha}
          max={hoy}
          onChange={(e) => setFecha(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div className="divide-y divide-gray-100">
        {activos.map((p) => {
          const m = marcas[p.id];
          return (
            <div key={p.id} className="py-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm text-gray-900">
                    {p.nombre}
                    {p.gravedad === "critica" && <span className="ml-1.5 text-[10px] font-semibold text-red-600 uppercase">crítico</span>}
                  </div>
                  {p.descripcion && <div className="text-[11px] text-gray-500">{p.descripcion}</div>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  ["cumple", "Cumple", Check, "bg-emerald-600"],
                  ["no_cumple", "No cumple", X, "bg-red-600"],
                  ["no_aplica", "No aplica", Minus, "bg-gray-500"],
                ] as const).map(([valor, label, Icon, color]) => (
                  <button
                    key={valor}
                    onClick={() => set(p.id, { resultado: valor })}
                    className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs border ${m.resultado === valor ? `${color} text-white border-transparent` : "bg-white text-gray-600 border-gray-200"}`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                ))}
              </div>
              {m.resultado === "no_cumple" && (
                <div className="space-y-2 bg-red-50/50 rounded-lg p-2">
                  <textarea
                    value={m.detalle}
                    onChange={(e) => set(p.id, { detalle: e.target.value })}
                    placeholder="¿Qué encontraste? (lo verá el administrador)"
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
                  />
                  <GravedadToggle valor={m.gravedad} onChange={(g) => set(p.id, { gravedad: g })} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-gray-700">Otras observaciones (fuera de la lista)</div>
        {extras.map((x, i) => (
          <div key={i} className="space-y-2 bg-gray-50 rounded-lg p-2">
            <div className="flex gap-2">
              <input
                value={x.titulo}
                onChange={(e) => setExtras((xs) => xs.map((y, j) => (j === i ? { ...y, titulo: e.target.value } : y)))}
                placeholder="Qué hay que corregir"
                className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
              />
              <button onClick={() => setExtras((xs) => xs.filter((_, j) => j !== i))} aria-label="Quitar" className="text-gray-400 hover:text-red-600">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <textarea
              value={x.detalle}
              onChange={(e) => setExtras((xs) => xs.map((y, j) => (j === i ? { ...y, detalle: e.target.value } : y)))}
              placeholder="Detalle (opcional)"
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
            />
            <GravedadToggle valor={x.gravedad} onChange={(g) => setExtras((xs) => xs.map((y, j) => (j === i ? { ...y, gravedad: g } : y)))} />
          </div>
        ))}
        <button
          onClick={() => setExtras((xs) => [...xs, { titulo: "", detalle: "", gravedad: "normal" }])}
          className="text-xs text-primary flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar observación
        </button>
      </div>

      <textarea
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        placeholder="Notas generales de la visita (opcional)"
        rows={2}
        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
      />

      <button
        onClick={() => void guardar()}
        disabled={guardando}
        className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
        {faltan > 0 ? `Faltan ${faltan} punto(s) por marcar` : "Guardar visita"}
      </button>
    </div>
  );
}
