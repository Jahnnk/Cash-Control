"use client";

/**
 * Archivar o reactivar el Highlight (Jahnn, 20-nov-2026: «no lo eliminemos, que yo lo pueda activar»).
 * Archivado: no sale en el Panel de Sede, ni en «Tu semana», ni como aviso en Grupo. Su historial queda guardado
 * y esta consola sigue abierta para consultarlo. Solo la dirección lo cambia.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Power } from "lucide-react";
import { setHighlightActivo } from "@/app/actions/ajustes";
import { useToast } from "@/components/toast-provider";

export function InterruptorHighlight({ activo, puedeCambiar }: { activo: boolean; puedeCambiar: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pendiente, startTransition] = useTransition();
  const [confirmar, setConfirmar] = useState(false);

  function cambiar(v: boolean) {
    startTransition(async () => {
      const r = await setHighlightActivo(v);
      if (!r.ok) { showToast(r.error, "error"); return; }
      showToast(v ? "Highlight activado: ya se ve en el Panel de Sede." : "Highlight archivado. Su historial queda guardado.", "success");
      setConfirmar(false);
      router.refresh();
    });
  }

  if (activo) {
    if (!puedeCambiar) return null;
    return (
      <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
        {confirmar ? (
          <>
            <span className="text-gray-600">Dejará de verse en el Panel de Sede. ¿Archivar?</span>
            <button type="button" disabled={pendiente} onClick={() => cambiar(false)}
              className="rounded-lg bg-gray-900 px-3 py-1.5 font-medium text-white hover:bg-gray-800 disabled:opacity-60">Sí, archivar</button>
            <button type="button" onClick={() => setConfirmar(false)} className="rounded-lg px-2 py-1.5 text-gray-600 hover:bg-gray-100">Cancelar</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmar(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50">
            <Archive className="w-3.5 h-3.5" aria-hidden />Archivar el Highlight
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
          <Archive className="w-5 h-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-gray-900">El Highlight está archivado</h2>
          <p className="mt-1 text-sm text-gray-600 leading-relaxed">
            No se muestra en el Panel de Sede, ni en «Tu semana», ni como aviso en Grupo. En su lugar, cada
            administrador ve sus <strong>Acuerdos y tareas</strong>. Todo el historial queda guardado abajo.
          </p>
        </div>
        {puedeCambiar && (
          <button type="button" disabled={pendiente} onClick={() => cambiar(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-60 whitespace-nowrap">
            {pendiente ? <Power className="w-4 h-4 animate-pulse" aria-hidden /> : <ArchiveRestore className="w-4 h-4" aria-hidden />}
            Volver a activarlo
          </button>
        )}
      </div>
    </section>
  );
}
