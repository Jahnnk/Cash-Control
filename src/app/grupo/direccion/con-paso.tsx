import type { ReactNode } from "react";

/** El título de una sección con su número de paso (Sistema de Dirección → Precios). */
export function ConPaso({ paso, children }: { paso?: number; children: ReactNode }) {
  if (!paso) return <>{children}</>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white text-xs font-semibold tabular-nums">{paso}</span>
      {children}
    </span>
  );
}
