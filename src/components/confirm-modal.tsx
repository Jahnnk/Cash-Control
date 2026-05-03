"use client";

import { AlertTriangle } from "lucide-react";
import { BUSINESS_THEMES, type ScopeCode } from "@/lib/business-theme";

export type ConfirmModalProps = {
  open: boolean;
  scope: ScopeCode;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Modal Apple-style de confirmación. El botón "confirmar" usa el color
 * oficial del scope para reforzar contexto visualmente.
 *
 * Solo se renderiza cuando `open` es true. El padre controla apertura.
 */
export function ConfirmModal({
  open,
  scope,
  title,
  description,
  confirmLabel = "Sí, confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;
  const theme = BUSINESS_THEMES[scope];

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center px-4 animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: theme.colorSoft, color: theme.color }}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {description && <div className="text-sm text-gray-600 mt-1">{description}</div>}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-opacity"
            style={{ backgroundColor: theme.color }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
