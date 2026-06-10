"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, Paperclip, Trash2, FileText, Upload } from "lucide-react";
import {
  listAttachments,
  deleteAttachment,
  type AttachmentItem,
  type AttachmentRecordType,
} from "@/app/actions/attachments";
import { isImageType, validateAttachment } from "@/lib/attachment-validation";
import { useToast } from "@/components/toast-provider";

/**
 * Modal de constancias (adjuntos) de un movimiento: subir imagen/PDF al
 * Blob privado, ver (URL firmada temporal) y eliminar.
 */
export function AttachmentsModal({
  recordType,
  recordId,
  title,
  onClose,
  onCountChange,
}: {
  recordType: AttachmentRecordType;
  recordId: string;
  title: string;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}) {
  const { showToast } = useToast();
  const [items, setItems] = useState<AttachmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AttachmentItem | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function reload() {
    const list = await listAttachments(recordType, recordId);
    setItems(list);
    onCountChange?.(list.length);
    setLoading(false);
  }
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordType, recordId]);

  async function handleUpload(file: File) {
    // Validación rápida en el cliente (el servidor re-valida)
    const err = validateAttachment(file.type, file.size);
    if (err) { showToast(err, "error"); return; }

    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("recordType", recordType);
      form.set("recordId", recordId);
      const res = await fetch("/api/attachments", { method: "POST", body: form });
      const body = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !body.success) {
        showToast(body.error || "No se pudo subir el archivo", "error");
        return;
      }
      showToast("Constancia adjuntada");
      await reload();
    } catch {
      showToast("No se pudo subir el archivo. Revisa tu conexión.", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(item: AttachmentItem) {
    const r = await deleteAttachment(item.id);
    setConfirmDelete(null);
    if (!r.success) { showToast(r.error, "error"); return; }
    showToast("Adjunto eliminado");
    await reload();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 min-w-0">
            <Paperclip className="w-4 h-4 text-gray-500 shrink-0" />
            <span className="truncate">Constancias · {title}</span>
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-6 border border-dashed border-gray-200 rounded-lg">
              Sin constancias todavía. Adjunta la captura del pago del banco o un PDF.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((a) => (
                <div key={a.id} className="border border-gray-200 rounded-lg p-2.5 flex items-center gap-3">
                  {isImageType(a.contentType) ? (
                    <a href={a.signedUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      {/* La URL firmada expira en ~10 min: imagen directa, sin caché de Next */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.signedUrl} alt={a.filename} className="w-14 h-14 object-cover rounded-md border border-gray-100" />
                    </a>
                  ) : (
                    <a href={a.signedUrl} target="_blank" rel="noopener noreferrer"
                      className="w-14 h-14 shrink-0 rounded-md border border-gray-100 bg-red-50 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-red-500" />
                    </a>
                  )}
                  <div className="flex-1 min-w-0">
                    <a href={a.signedUrl} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-gray-900 hover:underline truncate block">
                      {a.filename}
                    </a>
                    <div className="text-[11px] text-gray-400">
                      {(a.sizeBytes / 1024).toFixed(0)} KB · {new Date(a.createdAt).toLocaleDateString("es-PE")}
                    </div>
                  </div>
                  <button onClick={() => setConfirmDelete(a)}
                    className="text-red-400 hover:text-red-600 p-1.5 shrink-0" aria-label="Eliminar adjunto">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full border border-dashed border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-600 hover:border-primary-light hover:text-primary-light flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Subiendo…" : "Adjuntar constancia (imagen o PDF, máx. 5 MB)"}
          </button>
          <p className="text-[11px] text-gray-400 text-center">
            Los archivos se guardan en almacenamiento privado; solo se ven desde la app.
          </p>
        </div>

        {confirmDelete && (
          <div className="px-5 pb-5">
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm">
              <div className="text-red-800 mb-2">¿Eliminar &quot;{confirmDelete.filename}&quot;? Esta acción no se puede deshacer.</div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
                <button onClick={() => handleDelete(confirmDelete)} className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700">Sí, eliminar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

