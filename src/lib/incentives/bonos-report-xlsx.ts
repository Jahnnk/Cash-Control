/**
 * Reporte de Bonos e Incentivos · Excel (renderer tonto, exceljs).
 *
 * El mismo reporte que el PDF, pero para TRABAJAR con él: Kelly puede marcar
 * las transferencias hechas, anotar el número de operación y ver cómo se
 * suman los totales. Los totales son fórmulas de Excel (si ella corrige un
 * monto, el total se actualiza solo).
 *
 * Hojas: Resumen · Transferencias · Pagos (el cálculo por persona) · Metas ·
 * una hoja de día por día por cada sede · Mejor vendedor. Cada sede con su
 * color, igual que en el PDF.
 */

import ExcelJS from "exceljs";
import type { ReporteBonos, SedeReporte } from "./reporte-bonos";
import type { ImagenGrafico, GraficosPdf } from "./bonos-report-pdf";

export type GraficosXlsx = GraficosPdf;

const SOLES = '"S/ "#,##0.00';
const SOLES0 = '"S/ "#,##0';
const PCT = "0.0%";
const JORNADA: Record<string, string> = { tiempo_completo: "Tiempo completo", medio_turno: "Medio turno", administrador: "Administrador" };
const ORIGEN: Record<string, string> = { reloj: "Reloj de Byte", registrada: "Horas registradas", horario: "Horario de Planilla", contrato: "Horas del contrato" };

const argb = (hex: string) => "FF" + hex.replace("#", "");
const relleno = (hex: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: argb(hex) } });
const BORDE: Partial<ExcelJS.Borders> = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };

function encabezado(row: ExcelJS.Row, color: string) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.fill = relleno(color);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
}

function titulo(ws: ExcelJS.Worksheet, texto: string, sub: string, color: string, columnas: number) {
  ws.mergeCells(1, 1, 1, columnas);
  const t = ws.getCell(1, 1);
  t.value = texto;
  t.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
  t.fill = relleno(color);
  t.alignment = { vertical: "middle" };
  ws.getRow(1).height = 30;
  ws.mergeCells(2, 1, 2, columnas);
  const s = ws.getCell(2, 1);
  s.value = sub;
  s.font = { size: 10, color: { argb: "FF6B7280" } };
}

function pegarImagen(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, img: ImagenGrafico | null, col: number, fila: number, anchoPx: number): number {
  if (!img) return fila;
  const id = wb.addImage({ base64: img.dataUrl, extension: "png" });
  const alto = Math.round((anchoPx * img.height) / img.width);
  ws.addImage(id, { tl: { col: col - 1, row: fila - 1 }, ext: { width: anchoPx, height: alto } });
  return fila + Math.ceil(alto / 20) + 1; // filas de 20 px
}

function hojaResumen(wb: ExcelJS.Workbook, r: ReporteBonos, g: GraficosXlsx) {
  const ws = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 34 }, { width: 26 }, { width: 26 }, { width: 3 }, { width: 40 }];
  titulo(ws, `Bonos e Incentivos · ${r.periodoLabel}`, `Fonavi y Centro · generado el ${r.generadoEn}`, "#004C40", 5);

  const cab = ws.addRow(["", ...r.sedes.map((s) => s.sede)]);
  cab.eachCell((cell, i) => { if (i > 1) { cell.fill = relleno(r.sedes[i - 2].color); cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.alignment = { horizontal: "center" }; } });
  const fila = (etq: string, valor: (s: SedeReporte) => ExcelJS.CellValue, fmt?: string) => {
    const row = ws.addRow([etq, ...r.sedes.map(valor)]);
    row.getCell(1).font = { bold: true };
    row.eachCell((cell, i) => { cell.border = BORDE; if (i > 1) { cell.alignment = { horizontal: "center" }; if (fmt) cell.numFmt = fmt; } });
  };
  ws.addRow([]);
  cab.height = 20;
  fila("Ticket del programa", (s) => s.ticket.actual ?? "-", SOLES);
  fila("Base de la sede", (s) => s.ticket.base, SOLES);
  fila("Aumento sobre la base", (s) => s.ticket.delta ?? "-", SOLES);
  fila("Nivel de ticket alcanzado", (s) => s.ticket.nivel ?? "Sin nivel");
  fila("Para el siguiente nivel faltan", (s) => s.ticket.proximo ? `${s.ticket.proximo.nombre}: ${s.ticket.proximo.falta.toFixed(2)}` : "-");
  fila("Meta de ventas del mes", (s) => s.ventas?.meta ?? "-", SOLES0);
  fila("Vendido", (s) => s.ventas?.vendido ?? s.ventaTotal, SOLES);
  fila("Avance de la meta de ventas", (s) => (s.ventas?.avancePct != null ? s.ventas.avancePct / 100 : "-"), PCT);
  fila("La meta de ventas este mes", (s) => (s.ventas ? (s.ventas.vinculante ? "Es requisito" : "Solo práctica") : "-"));
  fila("Personas por día", (s) => s.trafico.personasPorDia ?? "-");
  if (!r.esRango) fila("A repartir (S/)", (s) => s.pagos?.totalBonos ?? 0, SOLES0);
  if (!r.esRango && r.totalARepartir !== null) {
    const row = ws.addRow(["TOTAL A TRANSFERIR", r.totalARepartir]);
    row.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.getCell(1).fill = relleno("#004C40");
    row.getCell(2).numFmt = SOLES0;
    row.getCell(2).font = { bold: true };
    row.getCell(2).alignment = { horizontal: "center" };
  }

  ws.addRow([]);
  let rr = ws.rowCount + 1;
  for (const s of r.sedes) {
    const t = ws.getRow(rr++);
    t.getCell(1).value = s.sede;
    t.getCell(1).font = { bold: true, color: { argb: argb(s.color) } };
    for (const f of s.frases) {
      ws.mergeCells(rr, 1, rr, 3);
      const c = ws.getCell(rr, 1);
      c.value = f;
      c.alignment = { wrapText: true, vertical: "top" };
      ws.getRow(rr).height = Math.max(18, 15 * Math.ceil(f.length / 95));
      rr++;
    }
  }
  pegarImagen(wb, ws, g.comparativo, 1, rr + 1, 760);
}

function hojaTransferencias(wb: ExcelJS.Workbook, r: ReporteBonos) {
  const ws = wb.addWorksheet("Transferencias", { views: [{ showGridLines: false, state: "frozen", ySplit: 3 }] });
  ws.columns = [{ width: 12 }, { width: 28 }, { width: 14 }, { width: 18 }, { width: 12 }, { width: 24 }];
  titulo(ws, "Transferencias · para Gerencia de Finanzas", `${r.periodoLabel} · una fila por persona. Marca "Sí" cuando transfieras y anota el número de operación.`, "#004C40", 6);
  encabezado(ws.addRow(["Sede", "Colaborador", "DNI", "Monto a transferir", "¿Hecha?", "N.º de operación"]), "#374151");
  const totalesFila: number[] = [];
  const filasTransferencia: number[] = [];
  for (const s of r.sedes) {
    const lineas = (s.pagos?.lines ?? []).filter((l) => l.total > 0);
    const ini = ws.rowCount + 1;
    if (lineas.length === 0) {
      const row = ws.addRow([s.sede, s.pagos?.nivel ? "Sin transferencias" : "Sin bono este mes: no hay transferencias", "", 0, "", ""]);
      row.getCell(1).font = { bold: true, color: { argb: argb(s.color) } };
      row.getCell(4).numFmt = SOLES0;
      row.getCell(2).font = { italic: true, color: { argb: "FF6B7280" } };
    }
    for (const l of lineas) {
      const row = ws.addRow([s.sede, l.name, l.dni ?? "sin DNI", l.total, "", ""]);
      row.getCell(1).font = { bold: true, color: { argb: argb(s.color) } };
      row.getCell(4).numFmt = SOLES0;
      row.getCell(5).alignment = { horizontal: "center" };
      row.eachCell((c) => { c.border = BORDE; });
      filasTransferencia.push(row.number);
    }
    const fin = ws.rowCount;
    const tot = ws.addRow([`Total ${s.sede}`, "", "", lineas.length > 0 ? { formula: `SUM(D${ini}:D${fin})`, result: s.pagos?.totalBonos ?? 0 } : 0, "", ""]);
    tot.eachCell((c) => { c.fill = relleno(s.colorSuave); c.font = { bold: true }; });
    tot.getCell(4).numFmt = SOLES0;
    totalesFila.push(tot.number);
    ws.addRow([]);
  }
  if (!r.esRango && r.totalARepartir !== null && totalesFila.length > 0) {
    const g = ws.addRow(["TOTAL GENERAL", "", "", { formula: totalesFila.map((n) => `D${n}`).join("+"), result: r.totalARepartir }, "", ""]);
    g.eachCell((c) => { c.fill = relleno("#004C40"); c.font = { bold: true, color: { argb: "FFFFFFFF" } }; });
    g.getCell(4).numFmt = SOLES0;
  }
  for (const n of filasTransferencia) ws.getCell(n, 5).dataValidation = { type: "list", allowBlank: true, formulae: ['"Sí,No"'] };
}

function hojaPagos(wb: ExcelJS.Workbook, r: ReporteBonos) {
  const ws = wb.addWorksheet("Pagos", { views: [{ showGridLines: false, state: "frozen", ySplit: 3 }] });
  ws.columns = [
    { width: 10 }, { width: 24 }, { width: 12 }, { width: 16 }, { width: 11 }, { width: 11 }, { width: 10 },
    { width: 12 }, { width: 22 }, { width: 11 }, { width: 12 }, { width: 14 },
  ];
  titulo(ws, "Pagos · cálculo por persona", `${r.periodoLabel} · bono = horas del mes (Planilla) × tarifa por hora del nivel; administradores: monto fijo del nivel.`, "#004C40", 12);
  encabezado(ws.addRow(["Sede", "Colaborador", "DNI", "Jornada", "Horas del mes", "Faltas (h)", "Extra (h)", "Horas del bono", "Origen de las horas", "Bono", "Premio MV", "Total"]), "#374151");
  for (const s of r.sedes) {
    const pg = s.pagos;
    if (!pg) continue;
    const ini = ws.rowCount + 1;
    for (const l of pg.lines) {
      const n = ws.rowCount + 1;
      const row = ws.addRow([
        s.sede, l.name, l.dni ?? "sin DNI", JORNADA[l.jornada] ?? l.jornada,
        l.horasBase ?? "", l.horasMenos || "", l.horasMas || "", l.jornada === "administrador" ? "fijo" : (l.horasMes ?? ""),
        l.jornada === "administrador" ? "Monto fijo del nivel" : l.origenHoras ? ORIGEN[l.origenHoras] : l.horasReales ? "Planilla" : "Contrato",
        l.bono, l.premioMv || 0, { formula: `J${n}+K${n}`, result: l.total },
      ]);
      row.getCell(1).font = { bold: true, color: { argb: argb(s.color) } };
      for (const c of [10, 11, 12]) row.getCell(c).numFmt = SOLES0;
      for (const c of [5, 6, 7, 8]) row.getCell(c).numFmt = "0.00";
      row.eachCell((c) => { c.border = BORDE; });
    }
    const fin = ws.rowCount;
    const tot = ws.addRow([`Total ${s.sede}`, "", "", "", "", "", "", "", "",
      { formula: `SUM(J${ini}:J${fin})`, result: pg.lines.reduce((t, l) => t + l.bono, 0) },
      { formula: `SUM(K${ini}:K${fin})`, result: pg.mejorVendedor.premio },
      { formula: `SUM(L${ini}:L${fin})`, result: pg.totalBonos },
    ]);
    tot.eachCell((c) => { c.fill = relleno(s.colorSuave); c.font = { bold: true }; });
    for (const c of [10, 11, 12]) tot.getCell(c).numFmt = SOLES0;
    ws.addRow([]);
    const info = ws.addRow([`${s.sede}: ${pg.nivel ? `Nivel alcanzado ${pg.nivel}` : "sin nivel de ticket (no hay bono)"} · tarifa por hora ${pg.tarifaHora ? "S/ " + pg.tarifaHora.toFixed(4) : "-"} · pozo ${pg.pozo !== null ? "S/ " + pg.pozo.toFixed(2) : "-"}${pg.mejorVendedor.usado ? ` · premio MV: ${pg.mejorVendedor.usado}` : ""}`]);
    info.getCell(1).font = { italic: true, color: { argb: "FF6B7280" } };
    ws.addRow([]);
  }
  ws.addRow(["Origen de las horas: «Horas registradas» = las que el administrador cargó en Planilla; «Horario de Planilla» = lo pactado en su horario (turnos de una semana × 4); «Reloj de Byte»; «Horas del contrato» = no tiene horario cargado. Las faltas restan; el tiempo extra suma."])
    .getCell(1).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
}

function hojaMetas(wb: ExcelJS.Workbook, r: ReporteBonos) {
  const ws = wb.addWorksheet("Metas", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 24 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 22 }, { width: 18 }, { width: 14 }];
  titulo(ws, "Metas del programa", `${r.periodoLabel}`, "#004C40", 9);

  for (const s of r.sedes) {
    ws.addRow([]);
    const t = ws.addRow([`${s.sede} · meta de ticket (tres niveles)`]);
    t.getCell(1).font = { bold: true, size: 12, color: { argb: argb(s.color) } };
    encabezado(ws.addRow(["Nivel", "Ticket meta", "Valor por hora", "Horas del equipo", "Bonos por horas", "Administración", "Premio mejor vendedor", "TOTAL a repartir", "¿Alcanzado?"]), s.color);
    const base = ws.addRow(["Base (punto de partida)", s.ticket.base, "", "", "", "", "", "", ""]);
    base.getCell(2).numFmt = SOLES;
    for (const n of s.ticket.niveles) {
      const d = n.desglose;
      const row = ws.addRow([n.nombre, n.metaTicket, d?.valorHora ?? "", d?.horasEquipo ?? "", d?.bonosPorHoras ?? "", d?.administracion ?? "", n.premioMv, n.seReparte, n.alcanzado ? "Sí" : ""]);
      row.getCell(2).numFmt = SOLES;
      row.getCell(3).numFmt = '"S/ "0.0000';
      row.getCell(4).numFmt = "0.00";
      for (const c of [5, 6, 7, 8]) row.getCell(c).numFmt = SOLES0;
      if (n.alcanzado) row.eachCell((c) => { c.fill = relleno(s.colorSuave); c.font = { bold: true }; });
    }
    const n1 = s.ticket.niveles[0];
    if (n1?.desglose) {
      const ej = s.ticket.niveles.map((n) => `${n.nombre}: medio turno de 94 h ${n.ejemplos.medioTurno}, tiempo completo de 192 h ${n.ejemplos.tiempoCompleto}`).join(" · ");
      ws.addRow([`Cómo se calcula: TOTAL = bonos por horas (horas del mes de cada persona × valor por hora, ${n1.desglose.personasPorHoras} personas) + administración (monto fijo por puesto) + premio (monto fijo, una persona). Ejemplos en soles: ${ej}.`])
        .getCell(1).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
    }
  }

  ws.addRow([]);
  const tv = ws.addRow(["Meta de ventas (una sola por sede)"]);
  tv.getCell(1).font = { bold: true, size: 12, color: { argb: "FF004C40" } };
  encabezado(ws.addRow(["Sede", "Meta del mes", "Vendido", "Avance", "Estado", "Este mes", "Sale del promedio de"]), "#004C40");
  for (const s of r.sedes) {
    const v = s.ventas;
    const row = ws.addRow([s.sede, v?.meta ?? "sin meta", v?.vendido ?? "", v?.avancePct != null ? v.avancePct / 100 : "", v ? (v.cumple ? "Cumplida" : "No se llegó") : "", v ? (v.vinculante ? "Es requisito" : "Solo práctica") : "", v?.mesesReferencia.join(", ") ?? ""]);
    row.getCell(1).font = { bold: true, color: { argb: argb(s.color) } };
    row.getCell(2).numFmt = SOLES0; row.getCell(3).numFmt = SOLES; row.getCell(4).numFmt = PCT;
  }
  const n1 = ws.addRow(["La meta de ventas NO cambia al subir de nivel: es una cifra por mes y por sede (promedio de los últimos tres meses cerrados, redondeado hacia arriba a S/ 100, congelada el primer lunes del mes). Los niveles solo cambian cuánto se paga por el ticket."]);
  n1.getCell(1).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };

  if (r.llaves.length > 0) {
    ws.addRow([]);
    const tl = ws.addRow([`Las llaves del bono en ${r.periodoLabel}`]);
    tl.getCell(1).font = { bold: true, size: 12, color: { argb: "FF004C40" } };
    encabezado(ws.addRow(["Llave", "Cómo funciona", "", "", "", "", "En este mes"]), "#004C40");
    for (const l of r.llaves) {
      const n = ws.rowCount + 1;
      ws.addRow([l.nombre, l.texto, "", "", "", "", { monto: "Define el monto", requisito: "Requisito", practica: "Solo práctica", "no-aplica": "Aún no aplica" }[l.rol]]);
      ws.mergeCells(n, 2, n, 6);
      ws.getCell(n, 2).alignment = { wrapText: true, vertical: "top" };
      ws.getRow(n).height = 32;
      ws.getCell(n, 1).font = { bold: true };
    }
  }
}

function hojaDia(wb: ExcelJS.Workbook, r: ReporteBonos, s: SedeReporte, g: GraficosXlsx["porSede"][number] | undefined) {
  if (s.dias.length === 0) return;
  const ws = wb.addWorksheet(`${s.sede} día a día`, { views: [{ showGridLines: false, state: "frozen", ySplit: 3 }] });
  const conMeta = !!s.ventas?.meta;
  const cols = ["Día", "Personas", "Venta del día", "Delivery (pedidos)", "Delivery (S/)", "Personal (pedidos)", "Personal (S/)", "Ticket del día", "Ticket acumulado", "Dif. vs Nivel 1", "Venta acumulada", ...(conMeta ? ["% meta de ventas"] : [])];
  ws.columns = cols.map((_, i) => ({ width: i === 0 ? 11 : 15 }));
  titulo(ws, `Yayi's ${s.sede} · detalle día por día`, `${r.periodoLabel} · ticket presencial (sin delivery ni consumo del personal).`, s.color, cols.length);
  encabezado(ws.addRow(cols), s.color);
  const ini = ws.rowCount + 1;
  for (const d of s.dias) {
    const row = ws.addRow([d.etiqueta, d.personas, d.venta, d.deliveryPedidos || "", d.deliveryVenta || "", d.personalPedidos || "", d.personalVenta || "", d.ticketDia ?? "", d.ticketAcum ?? "", d.difNivel1 ?? "", d.ventaAcum, ...(conMeta ? [d.pctMeta ?? ""] : [])]);
    for (const c of [3, 5, 7, 8, 9, 10, 11]) row.getCell(c).numFmt = SOLES;
    if (conMeta) row.getCell(12).numFmt = PCT;
    const dif = row.getCell(10);
    if (typeof d.difNivel1 === "number") dif.font = { color: { argb: d.difNivel1 >= 0 ? "FF0E7A55" : "FFB91C1C" } };
    row.eachCell((c) => { c.border = BORDE; });
  }
  const fin = ws.rowCount;
  const ult = s.dias[s.dias.length - 1];
  const tot = ws.addRow(["TOTAL",
    { formula: `SUM(B${ini}:B${fin})`, result: s.personas },
    { formula: `SUM(C${ini}:C${fin})`, result: s.ventaTotal },
    { formula: `SUM(D${ini}:D${fin})`, result: s.dias.reduce((t, d) => t + d.deliveryPedidos, 0) },
    { formula: `SUM(E${ini}:E${fin})`, result: s.dias.reduce((t, d) => t + d.deliveryVenta, 0) },
    { formula: `SUM(F${ini}:F${fin})`, result: s.dias.reduce((t, d) => t + d.personalPedidos, 0) },
    { formula: `SUM(G${ini}:G${fin})`, result: s.dias.reduce((t, d) => t + d.personalVenta, 0) },
    "", s.ticket.actual ?? "", ult?.difNivel1 ?? "", s.ventaTotal, ...(conMeta ? [ult?.pctMeta ?? ""] : []),
  ]);
  tot.eachCell((c) => { c.fill = relleno("#F3F4F6"); c.font = { bold: true }; });
  for (const c of [3, 5, 7, 9, 10, 11]) tot.getCell(c).numFmt = SOLES;
  if (conMeta) tot.getCell(12).numFmt = PCT;

  let fila = ws.rowCount + 3;
  fila = pegarImagen(wb, ws, g?.ticket ?? null, 1, fila, 820);
  pegarImagen(wb, ws, g?.ventas ?? null, 1, fila, 820);
}

function hojaMejorVendedor(wb: ExcelJS.Workbook, r: ReporteBonos) {
  const ws = wb.addWorksheet("Mejor vendedor", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 10 }, { width: 6 }, { width: 38 }, { width: 18 }, { width: 10 }, { width: 14 }, { width: 16 }, { width: 10 }];
  titulo(ws, "Mejor vendedor por turno", `${r.periodoLabel} · gana quien más levanta su ticket sobre lo normal de su turno.`, "#004C40", 8);
  for (const s of r.sedes) {
    ws.addRow([]);
    ws.addRow([s.sede]).getCell(1).font = { bold: true, size: 12, color: { argb: argb(s.color) } };
    const mv = s.mejorVendedor;
    if (!mv || mv.ranking.length === 0) {
      ws.addRow(["", "", "Sin reporte de trabajadores en este periodo."]).getCell(3).font = { italic: true, color: { argb: "FF6B7280" } };
      continue;
    }
    encabezado(ws.addRow(["Sede", "#", "Colaborador", "Turno", "Mesas", "Ticket propio", "Levantamiento", "Elegible"]), s.color);
    mv.ranking.forEach((x, i) => {
      const row = ws.addRow([s.sede, x.elegible ? i + 1 : "-", x.seller, x.porFranja.map((f) => ({ mañana: "Mañana", tarde: "Tarde", completo: "Turno completo" } as Record<string, string>)[f.franja] ?? f.franja).join(", "), x.totalClientes, x.ticketGlobal ?? "", x.liftPromedio ?? "", x.elegible ? "Sí" : "No"]);
      row.getCell(6).numFmt = SOLES; row.getCell(7).numFmt = SOLES;
      row.eachCell((c) => { c.border = BORDE; });
    });
  }
}

export async function renderBonosReportXlsx(r: ReporteBonos, g: GraficosXlsx): Promise<{ blob: Blob; filename: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Yayi's Cash Control";
  wb.created = new Date();

  hojaResumen(wb, r, g);
  if (!r.esRango && r.sedes.some((s) => s.pagos)) {
    hojaTransferencias(wb, r);
    hojaPagos(wb, r);
  }
  hojaMetas(wb, r);
  for (const s of r.sedes) hojaDia(wb, r, s, g.porSede[s.businessId]);
  hojaMejorVendedor(wb, r);

  for (const ws of wb.worksheets) {
    ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const etiqueta = r.periodoLabel.replace(/[^\w-]+/g, "-");
  return { blob, filename: `Bonos-Incentivos-${etiqueta}.xlsx` };
}
