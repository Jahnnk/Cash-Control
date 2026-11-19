"use client";

/**
 * Dashboard de Grupo → aviso de acuerdos incumplidos (fase 2 de Acuerdos y tareas, 19-nov-2026).
 * Jahnn supervisa el cumplimiento general: si hay acuerdos vencidos, una sola
 * línea con quién debe qué y un botón. Sin nada pendiente no aparece (un aviso que siempre está se ignora).
 * Solo lo ve la dirección; la llave de solo lectura no lo recibe.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getAlertaAcuerdos, type AlertaAcuerdos } from "@/app/actions/acuerdos";

export function AvisoAcuerdos() {
  const [a, setA] = useState<AlertaAcuerdos | null>(null);
  useEffect(() => {
    void getAlertaAcuerdos().then(setA).catch(() => setA(null));
  }, []);
  if (!a) return null;

  const partes = [`${a.vencidos} ${a.vencidos === 1 ? "acuerdo vencido" : "acuerdos vencidos"}`];
  const quienes = a.porPersona.slice(0, 4).map((p) => `${p.nombre} ${p.n}`).join(" · ");

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border px-4 py-3 sm:px-5 border-red-200 bg-red-50/60`}>
      <AlertTriangle className={`w-4 h-4 shrink-0 text-red-700`} aria-hidden />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-semibold text-gray-900">Acuerdos: {partes.join(" · ")}</span>
        {quienes && <span className="text-xs text-gray-600 ml-2">Vencidos de {quienes}{a.porPersona.length > 4 ? "…" : ""}</span>}
      </div>
      <Link href="/grupo/acuerdos?vista=vencidos" className="text-xs font-medium text-primary whitespace-nowrap">Ver vencidos</Link>
    </div>
  );
}
