/**
 * La carta en Excel, armada desde el sistema (fase 3 de «la carta vive en el sistema», 18-nov-2026).
 *
 * El sistema ya es el lugar donde se cambian los precios de insumos, la carta y los productos nuevos; este
 * archivo es una FOTO para revisar o compartir, con la forma del Excel de pricing: PRICING, insumos de las
 * cafeterías y de Atelier, recetas de los productos nuevos y la lista de costos de Atelier.
 * Renderer tonto (exceljs): recibe los datos ya leídos, no toca la base.
 */

import ExcelJS from "exceljs";
import type { ProductoCarta } from "@/app/actions/carta";
import type { PrecioVigente } from "@/lib/productos/precios-vigentes";
import type { CostoPreparacion } from "@/lib/costos-preparaciones";
import { costoTienda } from "@/lib/productos/receta-carta";

export type DatosExcelCarta = {
  carta: ProductoCarta[];
  insumos: PrecioVigente[];
  atelier: CostoPreparacion[];
  /** yyyy-mm-dd. */
  generado: string;
};

const VERDE = "FF004C40";
const SOLES = '"S/ "#,##0.00';
const SOLES4 = '"S/ "#,##0.0000';
const PCT = "0%";

function cabecera(r: ExcelJS.Row) {
  r.font = { bold: true, color: { argb: "FFFFFFFF" } };
  r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  r.alignment = { vertical: "middle", wrapText: true };
  r.height = 30;
}

function hoja(wb: ExcelJS.Workbook, nombre: string, columnas: { titulo: string; ancho: number; formato?: string }[]) {
  const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columnas.map((c) => ({ width: c.ancho, style: c.formato ? { numFmt: c.formato } : {} }));
  cabecera(ws.addRow(columnas.map((c) => c.titulo)));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  return ws;
}

const ORIGEN: Record<string, string> = { Cafetería: "Se prepara en tienda", Atelier: "Lo hace Atelier", Externo: "Reventa" };

/** El estado de un producto en la carta, en palabras. Exportada para probarla. */
export function estadoEnCarta(p: Pick<ProductoCarta, "seccion" | "byte">): string {
  if (p.byte.length > 0 && p.byte.every((b) => b.archivado)) return "Retirado";
  return p.seccion ? "En carta" : "Exhibidor / fuera de carta";
}

export async function renderCartaXlsx(d: DatosExcelCarta): Promise<{ blob: Blob; filename: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Yayi's Cash Control";

  // ── Para empezar ────────────────────────────────────────────────
  const ini = wb.addWorksheet("Para empezar", { views: [{ showGridLines: false }] });
  ini.columns = [{ width: 24 }, { width: 90 }];
  const t = ini.addRow(["Carta y costos de Yayi's"]);
  t.font = { bold: true, size: 16, color: { argb: VERDE } };
  ini.addRow([`Generado por el sistema el ${d.generado}.`]).font = { color: { argb: "FF6B7280" } };
  ini.addRow([]);
  const nota = ini.addRow(["Este archivo es una foto. Los cambios se hacen en el sistema: Grupo → Recetas y costos (precios de insumos, carta de las cafeterías y recetas de Atelier). No hace falta volver a subirlo."]);
  ini.mergeCells(nota.number, 1, nota.number, 2);
  nota.height = 36;
  nota.alignment = { wrapText: true, vertical: "top" };
  ini.addRow([]);
  cabecera(ini.addRow(["Hoja", "Qué tiene"]));
  for (const [h, q] of [
    ["PRICING", "Cada producto de la carta: precio, costo para la cafetería, % de costo, lo que deja y el costo en insumos."],
    ["CAF · Insumos", "Lo que compran las cafeterías, con el precio vigente y desde cuándo."],
    ["ATE · Insumos", "Lo que compra Atelier, con el precio vigente y desde cuándo."],
    ["Recetas nuevas", "Las recetas de los productos creados en el sistema que se preparan en tienda."],
    ["ATE · Costos", "Productos y preparaciones de Atelier con su costo en insumos (Excel y recetas del sistema)."],
  ]) ini.addRow([h, q]).getCell(2).alignment = { wrapText: true };

  // ── PRICING ─────────────────────────────────────────────────────
  const pr = hoja(wb, "PRICING", [
    { titulo: "ID", ancho: 10 }, { titulo: "Producto", ancho: 36 }, { titulo: "Sección", ancho: 22 }, { titulo: "Origen", ancho: 20 },
    { titulo: "Estado", ancho: 22 }, { titulo: "Precio carta", ancho: 13, formato: SOLES }, { titulo: "Costo para cafetería", ancho: 14, formato: SOLES },
    { titulo: "% costo", ancho: 9, formato: PCT }, { titulo: "Deja por unidad", ancho: 13, formato: SOLES },
    { titulo: "Costo insumos (Grupo)", ancho: 14, formato: SOLES }, { titulo: "Cambiado en el sistema", ancho: 26 },
  ]);
  for (const p of d.carta) {
    const cambios = [p.marca.nuevo && "producto nuevo", p.marca.precio && "precio", p.marca.costo && "precio interno", p.marca.seccion && "sección"].filter(Boolean).join(", ");
    const r = pr.addRow([
      p.ref, p.nombre, p.seccion ?? "", ORIGEN[p.origen ?? ""] ?? p.origen ?? "Por definir", estadoEnCarta(p),
      p.precio, p.costo || null, p.precio && p.costo ? p.costo / p.precio : null, p.precio && p.costo ? p.precio - p.costo : null,
      p.costoInsumos, cambios ? `${cambios}${p.actualizadoEl ? ` (${p.actualizadoEl})` : ""}` : "",
    ]);
    if (p.precio && p.costo / p.precio > 0.35) r.getCell(8).font = { bold: true, color: { argb: "FFB91C1C" } };
  }

  // ── Insumos ─────────────────────────────────────────────────────
  for (const origen of ["Cafetería", "Atelier"] as const) {
    const ws = hoja(wb, origen === "Cafetería" ? "CAF · Insumos" : "ATE · Insumos", [
      { titulo: "SKU", ancho: 10 }, { titulo: "Insumo", ancho: 36 }, { titulo: "Unidad", ancho: 8 },
      { titulo: "Precio vigente", ancho: 13, formato: SOLES4 }, { titulo: "Desde", ancho: 12 }, { titulo: "Lo puso", ancho: 10 },
      { titulo: "Precio del último Excel", ancho: 14, formato: SOLES4 }, { titulo: "Cambio", ancho: 9, formato: "0.0%" },
    ]);
    for (const i of d.insumos.filter((x) => x.origen === origen)) {
      ws.addRow([i.sku, i.nombre, i.unidad, i.precio, i.fecha, i.delSistema ? "Sistema" : "Excel", i.base, i.base ? i.precio / i.base - 1 : null]);
    }
  }

  // ── Recetas nuevas ──────────────────────────────────────────────
  const caf = new Map(d.insumos.filter((i) => i.origen === "Cafetería").map((i) => [i.sku, i]));
  const internos = new Map(d.carta.filter((c) => c.ref.startsWith("AT-")).map((c) => [c.ref, c.costo]));
  const rn = hoja(wb, "Recetas nuevas", [
    { titulo: "ID", ancho: 10 }, { titulo: "Producto", ancho: 30 }, { titulo: "Porciones", ancho: 10 }, { titulo: "Ingrediente", ancho: 32 },
    { titulo: "De", ancho: 12 }, { titulo: "Cantidad", ancho: 10 }, { titulo: "Unidad", ancho: 8 }, { titulo: "Costo de la línea", ancho: 14, formato: SOLES4 },
  ]);
  let recetas = 0;
  for (const p of d.carta) {
    if (p.receta?.tipo !== "tienda") continue;
    const c = costoTienda(p.receta, (s) => caf.get(s) ?? null, (r) => internos.get(r) ?? null);
    for (const l of c.lineas) {
      rn.addRow([p.ref, p.nombre, p.receta.porciones, l.linea.nombre, l.linea.tipo === "atelier" ? "Atelier" : "Cafetería", l.linea.cantidad, l.linea.unidad, l.costo]);
      recetas++;
    }
  }
  if (recetas === 0) rn.addRow(["", "Todavía no hay productos nuevos que se preparen en tienda."]);

  // ── Costos de Atelier ───────────────────────────────────────────
  const at = hoja(wb, "ATE · Costos", [
    { titulo: "Ref", ancho: 12 }, { titulo: "Nombre", ancho: 40 }, { titulo: "Tipo", ancho: 13 }, { titulo: "Unidad", ancho: 8 },
    { titulo: "Costo en insumos", ancho: 14, formato: SOLES4 }, { titulo: "Viene de", ancho: 18 },
  ]);
  const TIPO = { producto: "Producto", preparacion: "Preparación", insumo: "Insumo" } as const;
  for (const i of d.atelier.filter((x) => x.tipo !== "insumo")) {
    at.addRow([i.ref, i.nombre, TIPO[i.tipo], i.unidad, i.costo, i.origen === "sistema" ? "Receta del sistema" : "Excel"]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return {
    blob: new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename: `Carta-y-costos-Yayis-${d.generado}.xlsx`,
  };
}
