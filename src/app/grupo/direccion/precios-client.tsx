"use client";

/**
 * Grupo → Sistema de Dirección → Precios (pedido de Jahnn, 18-nov-2026). Las tres secciones de la subida
 * de precios vivían en Productos; se juntan aquí, en un solo bloque y en el orden en que se usan:
 *   1 · ¿Cuándo subir y cómo comunicarlo?  — ¿ya toca?, fecha y guía
 *   2 · ¿Qué precios subir?                — qué productos y cuánto
 *   3 · Prueba de precios                  — plan de la prueba y resultado
 * La sede elegida arriba manda en el paso 2; los pasos 1 y 3 miran siempre las dos cafeterías (la prueba
 * compara una sede con la otra). El mes es el actual (lo último que subieron las sedes).
 */

import { useState } from "react";
import { CAFETERIAS, NOMBRE_CAFETERIAS } from "@/lib/productos/cafeterias";
import { CuandoSubir } from "./cuando-subir";
import { SubidaPrecios } from "./subida-precios";
import { PruebaPrecios } from "./prueba-precios";

const SEDES = [
  { id: 3, nombre: "Centro" },
  { id: 2, nombre: "Fonavi" },
  { id: CAFETERIAS, nombre: NOMBRE_CAFETERIAS },
];

const mesActual = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);

export function PreciosClient() {
  const [sede, setSede] = useState(3);
  const month = mesActual();

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-3 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">Subida de precios</h2>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl leading-relaxed">
            Tres pasos para subir precios sin perder clientes: saber si ya toca, elegir qué productos y cuánto, y probarlo en una sede antes de subir en las dos.
          </p>
        </div>
        <div className="inline-flex rounded-xl bg-white border border-gray-200 p-1 gap-1" role="group" aria-label="Sede">
          {SEDES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={sede === s.id}
              onClick={() => setSede(s.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${sede === s.id ? "bg-primary text-white" : "text-gray-600 hover:text-gray-900"}`}
            >
              {s.nombre}
            </button>
          ))}
        </div>
      </div>
      <CuandoSubir key={`cuando-${month}`} month={month} sede={sede} paso={1} />
      <SubidaPrecios key={`subida-${sede}-${month}`} month={month} sede={sede} paso={2} />
      <PruebaPrecios key={`prueba-${month}`} month={month} sede={sede} paso={3} />
      <p className="text-[11px] text-gray-500 px-1">
        La sede elegida cambia el paso 2. Los pasos 1 y 3 miran siempre Fonavi y Centro, porque la prueba compara una sede con la otra.
      </p>
    </div>
  );
}
