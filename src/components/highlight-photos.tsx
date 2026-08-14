"use client";

/**
 * Fotos de un Highlight: indicación de dirección y evidencia del admin.
 *
 * Pensado para el celular: el administrador está parado frente a la
 * vitrina, no sentado en una computadora. Por eso `capture` en el input
 * (abre la cámara directo), miniaturas grandes y un solo botón.
 *
 * Las dos tiras se ven distinto a propósito: la indicación es lo que
 * dirección PIDE y el admin no la puede borrar; la evidencia es lo que
 * el admin ENTREGA.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2, X, FileText, ImageOff } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { validateAttachment, isImageType } from "@/lib/attachment-validation";
import { conReintento } from "@/lib/con-reintento";
import {
  listHighlightPhotos,
  borrarFotoHighlight,
  type HighlightPhoto,
} from "@/app/actions/highlight-photos";
// El tipo se importa de la lib, NO del archivo "use server": re-exportar
// un tipo desde una action rompe en runtime (ver comentario en
// src/app/actions/highlight-photos.ts).
import type { HighlightPhotoKind } from "@/lib/highlight-access";

export function HighlightPhotos({
  highlightId,
  kind,
  titulo,
  ayuda,
  puedeSubir,
  puedeBorrar,
  compacto = false,
  onCambio,
}: {
  highlightId: string;
  kind: HighlightPhotoKind;
  titulo: string;
  ayuda?: string;
  puedeSubir: boolean;
  puedeBorrar: boolean;
  /** En Grupo las tarjetas son angostas: miniaturas más chicas. */
  compacto?: boolean;
  onCambio?: () => void;
}) {
  const { showToast } = useToast();
  const [fotos, setFotos] = useState<HighlightPhoto[] | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [ampliada, setAmpliada] = useState<HighlightPhoto | null>(null);
  const [porBorrar, setPorBorrar] = useState<HighlightPhoto | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    // Nunca dejar que esto rechace sin atrapar: es una promesa que corre
    // dentro de un useEffect, y una rechazada ahí tumba la página entera
    // (dispara el error boundary global) en vez de solo esta sección.
    try {
      const todas = await conReintento(() => listHighlightPhotos(highlightId));
      setFotos(todas.filter((f) => f.kind === kind));
    } catch (e) {
      console.error("[HighlightPhotos] cargar:", e);
      setFotos([]);
    }
  }, [highlightId, kind]);

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
      if (err) {
        showToast(`${file.name}: ${err}`, "error");
        continue;
      }
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("highlightId", highlightId);
        form.set("kind", kind);
        const res = await fetch("/api/highlight-photos", { method: "POST", body: form });
        // La respuesta puede NO ser JSON (un 413 de la plataforma, una
        // redirección a HTML...). Antes eso reventaba en .json() y caía
        // en el catch, que culpaba a la conexión y escondía la causa.
        let body: { success?: boolean; error?: string } | null = null;
        try {
          body = (await res.json()) as { success?: boolean; error?: string };
        } catch {
          body = null;
        }
        if (!res.ok || !body?.success) {
          showToast(
            body?.error ??
              (res.status === 413
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

  async function borrar(f: HighlightPhoto) {
    const r = await borrarFotoHighlight(f.id);
    setPorBorrar(null);
    if (!r.ok) {
      showToast(r.error, "error");
      return;
    }
    showToast("Foto eliminada");
    await cargar();
    onCambio?.();
  }

  const hay = (fotos?.length ?? 0) > 0;
  // Sin fotos y sin poder subir, no tiene nada que decir: no ocupa espacio.
  if (!puedeSubir && !hay) return null;

  const lado = compacto ? "w-14 h-14" : "w-20 h-20";

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          {titulo}
          {hay && <span className="ml-1 text-gray-400 normal-case">({fotos!.length})</span>}
        </span>
      </div>
      {ayuda && !hay && <p className="text-[11px] text-gray-400 mb-1.5">{ayuda}</p>}

      <div className="flex flex-wrap gap-2">
        {fotos === null ? (
          <div className={`${lado} rounded-lg bg-gray-100 animate-pulse`} />
        ) : (
          fotos.map((f) => (
            <div key={f.id} className="relative group">
              <button
                onClick={() => setAmpliada(f)}
                className={`${lado} rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center`}
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
                  onClick={() => setPorBorrar(f)}
                  aria-label={`Eliminar ${f.filename}`}
                  className="absolute -top-1.5 -right-1.5 bg-white border border-gray-300 rounded-full p-1 text-gray-400 hover:text-red-600 hover:border-red-300 shadow-sm"
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
              onChange={(e) => {
                if (e.target.files?.length) void subir(e.target.files);
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={subiendo}
              className={`${lado} rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-0.5 text-gray-400 hover:border-primary hover:text-primary disabled:opacity-50`}
            >
              {subiendo ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Camera className={compacto ? "w-4 h-4" : "w-5 h-5"} />
                  <span className="text-[9px] font-medium leading-none">Foto</span>
                </>
              )}
            </button>
          </>
        )}
      </div>

      {/* Ver la foto en grande */}
      {ampliada && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setAmpliada(null)}
        >
          <button
            onClick={() => setAmpliada(null)}
            aria-label="Cerrar"
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="max-w-3xl max-h-[85vh] w-full" onClick={(e) => e.stopPropagation()}>
            {isImageType(ampliada.contentType) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ampliada.url}
                alt={ampliada.filename}
                className="w-full max-h-[80vh] object-contain rounded-lg"
              />
            ) : (
              <a
                href={ampliada.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-white rounded-lg p-8 text-center text-sm text-gray-700"
              >
                <ImageOff className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                Abrir «{ampliada.filename}» en otra pestaña
              </a>
            )}
            <div className="text-center text-white/70 text-xs mt-2">
              {ampliada.filename} ·{" "}
              {new Date(ampliada.createdAt).toLocaleString("es-PE", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </div>
          </div>
        </div>
      )}

      {/* Confirmar borrado */}
      {porBorrar && (
        <div
          className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
          onClick={() => setPorBorrar(null)}
        >
          <div
            className="bg-white rounded-xl p-5 max-w-xs w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm text-gray-800 mb-3">
              ¿Eliminar esta foto? No se puede deshacer.
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPorBorrar(null)}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancelar
              </button>
              <button
                onClick={() => borrar(porBorrar)}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
