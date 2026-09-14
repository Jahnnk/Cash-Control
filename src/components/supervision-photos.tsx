"use client";

/**
 * Fotos de una observación de supervisión: "así lo encontré" (Juani) y
 * "así quedó" (administrador). Mismo diseño que las fotos del Highlight
 * —pensado para el celular: `capture` abre la cámara directo— pero con
 * sus propias acciones y permisos (ver src/lib/supervision-access.ts).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2, X, FileText } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { validateAttachment, isImageType } from "@/lib/attachment-validation";
import { conReintento } from "@/lib/con-reintento";
import {
  listarFotosObservacion,
  borrarFotoSupervision,
  type FotoSupervision,
} from "@/app/actions/supervisiones";
import type { TipoFotoSupervision } from "@/lib/supervision-access";

export function SupervisionPhotos({
  observacionId,
  tipo,
  titulo,
  puedeSubir,
  puedeBorrar,
  onCambio,
}: {
  observacionId: string;
  tipo: TipoFotoSupervision;
  titulo: string;
  puedeSubir: boolean;
  puedeBorrar: boolean;
  onCambio?: () => void;
}) {
  const { showToast } = useToast();
  const [fotos, setFotos] = useState<FotoSupervision[] | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [ampliada, setAmpliada] = useState<FotoSupervision | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    // Nunca rechazar sin atrapar: dentro de un useEffect tumbaría la página entera.
    try {
      const todas = await conReintento(() => listarFotosObservacion(observacionId));
      setFotos(todas.filter((f) => f.tipo === tipo));
    } catch (e) {
      console.error("[SupervisionPhotos] cargar:", e);
      setFotos([]);
    }
  }, [observacionId, tipo]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  async function subir(files: FileList) {
    setSubiendo(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      const err = validateAttachment(file.type, file.size);
      if (err) { showToast(`${file.name}: ${err}`, "error"); continue; }
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("observacionId", observacionId);
        form.set("tipo", tipo);
        const res = await fetch("/api/supervision-photos", { method: "POST", body: form });
        type Respuesta = { success?: boolean; error?: string };
        let body: Respuesta | null = null;
        try { body = (await res.json()) as Respuesta; } catch { body = null; }
        if (!res.ok || !body?.success) {
          showToast(
            body?.error ?? (res.status === 413
              ? "La foto pesa demasiado. Toma una con menos resolución."
              : `No se pudo subir la foto (error ${res.status}). Vuelve a intentar.`),
            "error",
          );
          continue;
        }
        ok++;
      } catch {
        showToast("No se pudo subir la foto: no hubo respuesta del servidor.", "error");
      }
    }
    setSubiendo(false);
    if (fileRef.current) fileRef.current.value = "";
    if (ok > 0) {
      showToast(ok === 1 ? "Foto adjuntada" : `${ok} fotos adjuntadas`, "success");
      await cargar();
      onCambio?.();
    }
  }

  async function borrar(f: FotoSupervision) {
    const r = await borrarFotoSupervision(f.id);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast("Foto eliminada");
    await cargar();
    onCambio?.();
  }

  const hay = (fotos?.length ?? 0) > 0;
  if (!puedeSubir && !hay) return null;

  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
        {titulo}{hay && <span className="ml-1 text-gray-400 normal-case">({fotos!.length})</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {fotos === null ? (
          <div className="w-16 h-16 rounded-lg bg-gray-100 animate-pulse" />
        ) : (
          fotos.map((f) => (
            <div key={f.id} className="relative">
              <button
                onClick={() => setAmpliada(f)}
                className="w-16 h-16 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center"
                title={f.filename}
              >
                {isImageType(f.contentType) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.url} alt={f.filename} className="w-full h-full object-cover" />
                ) : (
                  <FileText className="w-6 h-6 text-red-500" />
                )}
              </button>
              {puedeBorrar && (
                <button
                  onClick={() => void borrar(f)}
                  aria-label={`Eliminar ${f.filename}`}
                  className="absolute -top-1.5 -right-1.5 bg-white border border-gray-300 rounded-full p-1 text-gray-400 hover:text-red-600 shadow-sm"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))
        )}
        {puedeSubir && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files?.length) void subir(e.target.files); }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={subiendo}
              className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-0.5 text-gray-400 hover:border-primary hover:text-primary disabled:opacity-50"
            >
              {subiendo ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <>
                  <Camera className="w-5 h-5" />
                  <span className="text-[9px] font-medium leading-none">Foto</span>
                </>
              )}
            </button>
          </>
        )}
      </div>

      {ampliada && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setAmpliada(null)}>
          <button onClick={() => setAmpliada(null)} aria-label="Cerrar" className="absolute top-4 right-4 text-white/80 hover:text-white p-2">
            <X className="w-6 h-6" />
          </button>
          <div className="max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            {isImageType(ampliada.contentType) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ampliada.url} alt={ampliada.filename} className="w-full max-h-[80vh] object-contain rounded-lg" />
            ) : (
              <a href={ampliada.url} target="_blank" rel="noopener noreferrer" className="block bg-white rounded-lg p-8 text-center text-sm text-gray-700">
                Abrir «{ampliada.filename}» en otra pestaña
              </a>
            )}
            <div className="text-center text-white/70 text-xs mt-2">
              {new Date(ampliada.createdAt).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Lima" })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
