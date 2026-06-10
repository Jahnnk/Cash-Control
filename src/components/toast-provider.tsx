"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

/**
 * Sistema de feedback centralizado (Estructural E de la auditoría).
 * Un solo toast para toda la app: éxito verde / error rojo, auto-cierre.
 * Mismo estilo visual que el toast original de Movimientos diarios.
 *
 * Uso: const { showToast } = useToast();
 *      showToast("Guardado correctamente");            // éxito
 *      showToast("No se pudo guardar", "error");       // error
 */

type Tone = "success" | "error";
type ToastState = { msg: string; tone: Tone } | null;

const ToastContext = createContext<{ showToast: (msg: string, tone?: Tone) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);

  // Auto-cierre: errores duran más (hay que poder leerlos)
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.tone === "error" ? 5000 : 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((msg: string, tone: Tone = "success") => {
    setToast({ msg, tone });
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[100] max-w-[calc(100vw-3rem)] px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium animate-in fade-in slide-in-from-bottom-2 ${
            toast.tone === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
          }`}
          role={toast.tone === "error" ? "alert" : "status"}
          onClick={() => setToast(null)}
        >
          {toast.tone === "error" ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          {toast.msg}
        </div>
      )}
    </ToastContext.Provider>
  );
}
