/**
 * Punto de equilibrio según el Excel de Kelly · lectura y clasificación (puro).
 *
 * ─── De dónde sale ───
 *
 * 16-sep-2026: el cálculo del punto de equilibrio pasó a vivir en los Excel
 * de Kelly (primero Fonavi; después Atelier y Centro), con dos piezas:
 *
 *   · "Categorías PE": una lista de textos de Grupo con su Tipo — Fijo,
 *     Variable o Excluido — y una nota. Kelly no escribe el grupo igual
 *     todos los meses ("PRESTAMOS", "PRESTAMO", "PRÉSTAMOS SOCIO"), por eso
 *     la lista trae cada variante.
 *   · "PE <MES>": para cada mes, ventas de Byte (Control de VTAS, E194),
 *     gastos "G" sumados por grupo, y el cálculo:
 *         margen de contribución = (ventas − variables) / ventas
 *         punto de equilibrio    = fijos / margen
 *     más una conciliación ("Debe ser 0") que avisa si apareció un grupo
 *     que no está en la lista.
 *
 * Decisiones de esa clasificación que NO coinciden con la que tenía el
 * sistema, y por qué el sistema ahora sigue la de Kelly:
 *   · PRÉSTAMOS SOCIO (Diners + Kelly) cuenta como FIJO: "dinero que sale
 *     todos los meses", confirmado por Jahnn.
 *   · SS GENERALES, VAJILLA, DECORACIÓN, CONSULTORÍA, AUSPICIOS, OTROS e
 *     IMPUESTOS quedan EXCLUIDOS: compras esporádicas o no operativas.
 *   · LIMPIEZA, CAJA CHICA y SS BANCARIOS son FIJOS.
 *
 * La comparación de textos ignora tildes, mayúsculas y espacios de más
 * ("DECORACIÒN" = "DECORACIÓN"): un acento distinto no debe dejar un gasto
 * afuera del cálculo.
 */

import * as XLSX from "xlsx";
import { parseSheetMonthYear } from "./sheet-month";

export type TipoPE = "Fijo" | "Variable" | "Excluido";

export type CategoriaPE = { grupo: string; grupoNorm: string; tipo: TipoPE; nota: string | null };

export type PEMensualExcel = {
  month: string;
  hoja: string;
  ventas: number | null;
  costosVariables: number | null;
  costosFijos: number | null;
  excluido: number | null;
  puntoEquilibrio: number | null;
  conciliacion: number | null;
};

export function normGrupoPE(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

const TIPOS: Record<string, TipoPE> = { FIJO: "Fijo", VARIABLE: "Variable", EXCLUIDO: "Excluido" };

/** Lee la pestaña "Categorías PE". null = el archivo no la trae. */
export function parseCategoriasPE(buffer: Buffer | ArrayBuffer): { categorias: CategoriaPE[]; errores: string[] } | null {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const nombre = wb.SheetNames.find((n) => normGrupoPE(n) === "CATEGORIAS PE");
  if (!nombre) return null;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombre], { header: 1, defval: null });
  // Encabezado: la fila que tiene "Tipo" (la primera columna con texto es el grupo).
  const hIdx = rows.findIndex((r) => r.some((c) => normGrupoPE(String(c ?? "")) === "TIPO"));
  if (hIdx === -1) return { categorias: [], errores: [`'${nombre}': no encontré la columna "Tipo".`] };
  const h = rows[hIdx].map((c) => normGrupoPE(String(c ?? "")));
  const cTipo = h.indexOf("TIPO");
  const cGrupo = h.findIndex((t, i) => i < cTipo && t !== "");
  const cNota = h.indexOf("NOTA");

  const errores: string[] = [];
  const porNorm = new Map<string, CategoriaPE>();
  for (const r of rows.slice(hIdx + 1)) {
    const grupo = String(r[cGrupo] ?? "").trim();
    if (!grupo) continue;
    const tipo = TIPOS[normGrupoPE(String(r[cTipo] ?? ""))];
    if (!tipo) {
      errores.push(`'${nombre}': el grupo "${grupo}" tiene un tipo que no es Fijo, Variable ni Excluido ("${r[cTipo] ?? ""}").`);
      continue;
    }
    const grupoNorm = normGrupoPE(grupo);
    const previo = porNorm.get(grupoNorm);
    if (previo && previo.tipo !== tipo) {
      errores.push(`'${nombre}': "${previo.grupo}" y "${grupo}" son el mismo grupo pero tienen tipos distintos (${previo.tipo} / ${tipo}).`);
      continue;
    }
    porNorm.set(grupoNorm, { grupo, grupoNorm, tipo, nota: cNota >= 0 && r[cNota] ? String(r[cNota]).trim() : null });
  }
  return { categorias: [...porNorm.values()], errores };
}

/** Lee las pestañas "PE <MES>" (los resultados que calculó el Excel). */
export function parsePEMensualExcel(buffer: Buffer | ArrayBuffer, fallbackYear: number): PEMensualExcel[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const out: PEMensualExcel[] = [];
  for (const hoja of wb.SheetNames) {
    if (!/^PE\s+[A-Za-z]{3}\d{0,2}$/i.test(hoja.trim())) continue;
    const p = parseSheetMonthYear(hoja, fallbackYear);
    if (!p) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], { header: 1, defval: null });
    // Cada valor está en la fila cuya primera celda con texto empieza con la etiqueta.
    // Si el mes tiene "Ajustes específicos" (Atelier, ago-2026), hay además
    // una fila "Total Costos Fijos (bruto, antes de ajustes…)" más arriba:
    // manda la fila final, la que ya descontó los ajustes.
    const valor = (inicio: string): number | null => {
      const etiqueta = (r: unknown[]) => normGrupoPE(String(r.find((c) => typeof c === "string") ?? ""));
      const fila = rows.find((r) => etiqueta(r).startsWith(inicio) && !etiqueta(r).includes("BRUTO"))
        ?? rows.find((r) => etiqueta(r).startsWith(inicio));
      const n = fila?.find((c) => typeof c === "number");
      return typeof n === "number" ? Math.round(n * 100) / 100 : null;
    };
    out.push({
      month: `${p.year}-${String(p.month).padStart(2, "0")}`,
      hoja,
      ventas: valor("VENTAS TOTALES"),
      costosVariables: valor("TOTAL COSTOS VARIABLES"),
      costosFijos: valor("TOTAL COSTOS FIJOS"),
      excluido: valor("TOTAL EXCLUIDO"),
      puntoEquilibrio: valor("PUNTO DE EQUILIBRIO MENSUAL"),
      conciliacion: valor("DEBE SER"),
    });
  }
  return out.sort((a, b) => a.month.localeCompare(b.month));
}

export type GastoPorGrupo = { grupo: string; monto: number };

/**
 * Clasifica los gastos del mes con la lista de Kelly. Lo que no está en la
 * lista queda "sin tipo" y se reporta por nombre: es el equivalente a la
 * fila "Debe ser 0" del Excel.
 */
export function clasificarGastosPE(gastos: GastoPorGrupo[], categorias: CategoriaPE[]) {
  const tipoDe = new Map(categorias.map((c) => [c.grupoNorm, c.tipo]));
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const totales = { Fijo: 0, Variable: 0, Excluido: 0 };
  const sinTipo = new Map<string, number>();
  for (const g of gastos) {
    const t = tipoDe.get(normGrupoPE(g.grupo));
    if (t) totales[t] += g.monto;
    else sinTipo.set(g.grupo, (sinTipo.get(g.grupo) ?? 0) + g.monto);
  }
  return {
    fijos: r2(totales.Fijo),
    variables: r2(totales.Variable),
    excluido: r2(totales.Excluido),
    sinTipo: [...sinTipo.entries()].map(([grupo, monto]) => ({ grupo, monto: r2(monto) })),
  };
}
