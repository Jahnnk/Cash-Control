/**
 * Lo que una REGLA FIRME corrigió del Excel, para la lista de correcciones de Kelly (Por definir) · lógica pura.
 *
 * Una regla firme (lib/reglas-gasto.ts → REGLAS_FIRMES) manda sobre el Grupo del Excel al importar. Para que el
 * Excel también quede bien, cada corrección se le anota a Kelly. Cuando ella cambia el Grupo y vuelve a subir el
 * Excel, el Grupo coincide y la línea desaparece sola.
 */

import { reglaFirme } from "./reglas-gasto";
import { resolverCategoria } from "./categoria-resolver";

export type GastoConGrupo = { fecha: string; monto: number; concepto: string | null; categoria: string; grupoExcel: string | null };

const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

export function correccionesFirmesParaKelly(gastos: GastoConGrupo[]): string[] {
  const out: string[] = [];
  for (const g of gastos) {
    if (!g.grupoExcel?.trim()) continue;
    const firme = reglaFirme((g.concepto ?? "").replace(/[()[\]]/g, " "));
    // Solo si lo guardado ES lo que dice la regla (una decisión de Jahnn puede haberlo dejado en otra categoría).
    if (!firme || firme.categoria !== g.categoria) continue;
    if (resolverCategoria(g.grupoExcel).canonica === firme.categoria) continue;
    out.push(`• "${g.concepto ?? "sin concepto"}" del ${ddmm(g.fecha)} (S/${g.monto.toFixed(2)}): en el Grupo va ${firme.categoria}, no «${g.grupoExcel.trim()}» (regla firme).`);
  }
  return out;
}
