/**
 * Revisión del Excel para pasársela a Kelly (pedido de Jahnn, 5-nov-2026).
 *
 * Es lo mismo que Jahnn ve al importar el Excel (verificación contra el sistema + cosas «por definir»),
 * pero escrito para quien lleva el Excel: qué mirar, dónde, y una columna para que ella conteste.
 * Renderer tonto (exceljs): recibe los datos ya leídos, no toca la base.
 *
 * Hojas: Para empezar · Clasificaciones (una fila por cosa por definir) · Diferencias (puentes y alertas
 * de la verificación) · Correcciones ya decididas (lo que Jahnn ya resolvió y Kelly debe pasar a su Excel).
 */

import ExcelJS from "exceljs";
import type { ItemPorDefinir } from "@/app/actions/por-definir";
import type { VerificacionSedeMes } from "@/app/actions/verificacion-kelly";
import { monthLabel } from "@/lib/utils";

export type DatosRevisionKelly = {
  pendientes: ItemPorDefinir[];
  paraKelly: { sede: string; lineas: string[]; reglas: string[] }[];
  verificaciones: VerificacionSedeMes[];
  /** yyyy-mm-dd, para el nombre del archivo y el subtítulo. */
  generado: string;
};

const VERDE = "FF004C40";
const SOLES = '"S/ "#,##0.00';

const MOTIVO: Record<string, string> = {
  difiere: "El Excel y el sistema lo clasifican distinto",
  no_calza: "La categoría del sistema junta grupos que el Excel clasifica distinto",
  sin_kelly: "Este grupo no está en la lista «Categorías PE» del Excel",
  sin_sistema: "La categoría no tiene grupo en el sistema",
  bolson: "Quedó en el bolsón OTROS / PENDIENTE (no dice qué fue)",
  atipico: "Monto fuera de lo normal para su categoría",
  separado: "Separado de su grupo",
  conflicto: "No se entiende bien qué fue este gasto",
};

type D = {
  grupo?: string; categoria?: string; concepto?: string | null; texto?: string; fecha?: string; monto?: number; filas?: number;
  tipoKelly?: string | null; tipoSistema?: string | null; grupoSistema?: string | null; mediana?: number;
  sugerencias?: string[]; ejemplos?: { fecha: string; monto: number; concepto: string | null }[];
};

const GRUPO_SISTEMA: Record<string, string> = { fijo: "Fijo", variable: "Variable", financiamiento: "Financiamiento", fuera: "Fuera de la operación" };

/** Una fila lista para leer: qué es, qué dice cada lado y qué se le pide a Kelly. Exportada para probarla. */
export function filaClasificacion(i: ItemPorDefinir): {
  sede: string; que: string; fecha: string; monto: number | null; excel: string; sistema: string; porque: string; pedido: string;
} {
  const d = i.datos as D;
  const porque = MOTIVO[i.motivo] ?? i.motivo;
  const excel = d.tipoKelly ? `${d.grupo ?? ""} · ${d.tipoKelly}`.replace(/^ · /, "") : d.grupo ? `${d.grupo} · sin tipo` : "—";
  const sistema = d.grupoSistema ? `${d.categoria ?? ""} · ${GRUPO_SISTEMA[d.grupoSistema] ?? d.grupoSistema}` : d.tipoSistema ? `${d.categoria ?? ""} · ${d.tipoSistema}` : d.categoria ?? "—";

  if (i.alcance === "categoria") {
    const ej = (d.ejemplos ?? []).slice(0, 3).map((e) => `${e.fecha} S/${e.monto.toFixed(2)} ${e.concepto ?? ""}`.trim()).join(" | ");
    return {
      sede: i.sede, que: `Grupo «${d.grupo}»${d.filas ? ` (${d.filas} gastos)` : ""}`, fecha: "", monto: d.monto ?? null, excel, sistema, porque,
      pedido: `Confirma si el grupo «${d.grupo}» es Fijo, Variable o Excluido${d.tipoKelly ? ` (hoy en tu lista: ${d.tipoKelly})` : " y agrégalo a «Categorías PE»"}.${ej ? ` Ejemplos: ${ej}` : ""}`,
    };
  }
  if (i.alcance === "concepto") {
    return {
      sede: i.sede, que: `Pagos que dicen «${d.texto}»`, fecha: "", monto: d.monto ?? null, excel, sistema, porque,
      pedido: `Revisa en qué grupo pones los pagos que dicen «${d.texto}»: hoy están en «${d.grupo}».`,
    };
  }
  const gasto = d.concepto ?? "Sin concepto";
  const sug = d.sugerencias && d.sugerencias.length > 0 ? ` El sistema cree que es: ${d.sugerencias.join(" o ")}.` : "";
  const normal = i.motivo === "atipico" && d.mediana ? ` Lo normal en su categoría es S/${d.mediana.toFixed(2)}.` : "";
  return {
    sede: i.sede, que: gasto, fecha: d.fecha ?? "", monto: d.monto ?? null, excel, sistema, porque,
    pedido: i.motivo === "atipico"
      ? `Confirma que el monto es correcto y de qué fue.${normal}`
      : `Dinos qué fue este gasto y en qué grupo va (hoy está en «${d.grupo ?? "—"}»).${sug}`,
  };
}

function cabecera(row: ExcelJS.Row) {
  row.height = 24;
  row.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
}

function titulo(ws: ExcelJS.Worksheet, texto: string, sub: string, columnas: number) {
  ws.mergeCells(1, 1, 1, columnas);
  const t = ws.getCell(1, 1);
  t.value = texto;
  t.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  t.alignment = { vertical: "middle" };
  ws.getRow(1).height = 30;
  ws.mergeCells(2, 1, 2, columnas);
  ws.getCell(2, 1).value = sub;
  ws.getCell(2, 1).font = { size: 10, color: { argb: "FF6B7280" } };
}

export async function renderRevisionKellyXlsx(d: DatosRevisionKelly): Promise<{ blob: Blob; filename: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Yayi's Cash Control";
  const meses = [...new Set(d.verificaciones.map((v) => v.month))].sort();
  const mesTxt = meses.length ? meses.map((m) => monthLabel(m)).join(" y ") : "";
  const sub = `${mesTxt ? `${mesTxt} · ` : ""}generado el ${d.generado}`;

  // ── Para empezar ────────────────────────────────────────────────
  const ini = wb.addWorksheet("Para empezar", { views: [{ showGridLines: false }] });
  ini.columns = [{ width: 26 }, { width: 18 }, { width: 18 }, { width: 60 }];
  titulo(ini, "Revisión del Excel", sub, 4);
  ini.addRow([]);
  const nota = ini.addRow(["Kelly: esto es lo que el sistema encontró al comparar tu Excel con lo registrado. Revisa las hojas «Clasificaciones» y «Diferencias», escribe tu respuesta en la columna «Tu respuesta» y corrige lo que haga falta en tu Excel."]);
  ini.mergeCells(nota.number, 1, nota.number, 4);
  nota.height = 48;
  nota.alignment = { wrapText: true, vertical: "top" };
  ini.addRow([]);
  cabecera(ini.addRow(["Sede", "Mes", "Estado", "Qué pasó"]));
  for (const v of d.verificaciones) {
    ini.addRow([
      v.sede, monthLabel(v.month),
      v.estado === "ok" ? "Cuadra" : v.estado === "alerta" ? `${v.alertas.length} diferencia(s)` : "Sin foto del Excel",
      v.estado === "ok" ? "Ingresos y gastos coinciden con el Excel." : v.alertas.map((a) => a.titulo).join(" · ") || "—",
    ]).getCell(4).alignment = { wrapText: true, vertical: "top" };
  }
  ini.addRow([]);
  const porSede = new Map<string, number>();
  for (const i of d.pendientes) porSede.set(i.sede, (porSede.get(i.sede) ?? 0) + 1);
  ini.addRow([`Clasificaciones por revisar: ${d.pendientes.length}${porSede.size ? ` (${[...porSede].map(([s, n]) => `${s} ${n}`).join(" · ")})` : ""}`]).font = { bold: true };

  // ── Clasificaciones ─────────────────────────────────────────────
  const cl = wb.addWorksheet("Clasificaciones", { views: [{ state: "frozen", ySplit: 3, showGridLines: false }] });
  cl.columns = [{ width: 10 }, { width: 38 }, { width: 12 }, { width: 14 }, { width: 28 }, { width: 28 }, { width: 34 }, { width: 52 }, { width: 36 }];
  titulo(cl, "Clasificaciones por revisar", "Lo que el Excel y el sistema clasifican distinto, o gastos que no se entienden.", 9);
  cabecera(cl.addRow(["Sede", "Qué es", "Fecha", "Monto", "Así está en el Excel", "Así lo ve el sistema", "Por qué se pregunta", "Qué te pedimos", "Tu respuesta"]));
  const filas = d.pendientes.map(filaClasificacion);
  for (const f of filas) {
    const r = cl.addRow([f.sede, f.que, f.fecha, f.monto, f.excel, f.sistema, f.porque, f.pedido, ""]);
    r.getCell(4).numFmt = SOLES;
    r.eachCell((c) => { c.alignment = { vertical: "top", wrapText: true }; c.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } }; });
    r.getCell(9).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
  }
  if (filas.length === 0) cl.addRow(["", "Nada por revisar."]);
  cl.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 9 } };

  // ── Diferencias ─────────────────────────────────────────────────
  const di = wb.addWorksheet("Diferencias", { views: [{ showGridLines: false }] });
  di.columns = [{ width: 10 }, { width: 14 }, { width: 46 }, { width: 16 }, { width: 70 }];
  titulo(di, "Diferencias con el Excel", "De cuánto a cuánto va cada total y qué explica cada diferencia.", 5);
  for (const v of d.verificaciones) {
    di.addRow([]);
    const t = di.addRow([`${v.sede} · ${monthLabel(v.month)}`, "", v.estado === "ok" ? "Cuadra con el Excel" : v.estado === "alerta" ? `${v.alertas.length} diferencia(s)` : "Sin foto del Excel"]);
    t.font = { bold: true, size: 12 };
    for (const [nombre, lineas] of [["Ingresos", v.puenteIngresos], ["Gastos", v.puenteGastos]] as const) {
      cabecera(di.addRow(["", nombre, "Concepto", "Monto", "Nota"]));
      lineas.forEach((l, k) => {
        const r = di.addRow(["", "", l.etiqueta, k === 0 ? l.monto : l.monto, l.nota ?? ""]);
        r.getCell(4).numFmt = SOLES;
        r.getCell(5).alignment = { wrapText: true, vertical: "top" };
        if (l.etiqueta === "Sin explicar" || l.etiqueta.startsWith("Diferencia")) r.font = { bold: true, color: { argb: "FFB91C1C" } };
      });
    }
    if (v.alertas.length > 0) {
      cabecera(di.addRow(["", "Alerta", "Qué pasó", "", "Detalle"]));
      for (const a of v.alertas) {
        const r = di.addRow(["", "", a.titulo, "", a.detalle]);
        r.getCell(3).alignment = { wrapText: true, vertical: "top" };
        r.getCell(5).alignment = { wrapText: true, vertical: "top" };
      }
    }
  }
  if (d.verificaciones.length === 0) di.addRow(["", "", "No hay verificaciones de Excel cargadas."]);

  // ── Correcciones ya decididas ───────────────────────────────────
  const co = wb.addWorksheet("Correcciones decididas", { views: [{ showGridLines: false }] });
  co.columns = [{ width: 10 }, { width: 110 }, { width: 14 }];
  titulo(co, "Correcciones que ya decidió Jahnn", "Pásalas a tu Excel (grupos, tipos y la pestaña REGLAS).", 3);
  cabecera(co.addRow(["Sede", "Qué corregir", "Hecho (sí/no)"]));
  let hay = false;
  for (const p of d.paraKelly) {
    for (const l of [...p.lineas, ...p.reglas]) {
      hay = true;
      const r = co.addRow([p.sede, l.replace(/^•\s*/, ""), ""]);
      r.getCell(2).alignment = { wrapText: true, vertical: "top" };
    }
  }
  if (!hay) co.addRow(["", "No hay correcciones pendientes."]);

  const buf = await wb.xlsx.writeBuffer();
  return {
    blob: new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename: `Revision-Excel-para-Kelly-${d.generado}.xlsx`,
  };
}
