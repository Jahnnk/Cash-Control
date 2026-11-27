/**
 * El recetario de cocina en Word (27-nov-2026), con el formato del recetario de sánguches de las cafeterías:
 * portada, hoja de consulta rápida, las 5 reglas de la cocina, una ficha por producto (preparaciones base con su
 * tabla, pasos, recomendaciones y vida útil; luego el armado) y el control del documento. Colores de marca.
 */

import {
  AlignmentType, BorderStyle, Document, Footer, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow,
  TextRun, WidthType,
} from "docx";
import type { BaseFicha, FichaProducto, Recetario } from "@/lib/recetario";

const VERDE = "098B5F";
const VERDE_OSCURO = "004C40";
const GRIS = "6B7280";
const FUENTE = "Lato";

const SIN_BORDE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const BORDE_SUAVE = { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" } as const;
const sinBordes = { top: SIN_BORDE, bottom: SIN_BORDE, left: SIN_BORDE, right: SIN_BORDE };
const bordesSuaves = { top: BORDE_SUAVE, bottom: BORDE_SUAVE, left: BORDE_SUAVE, right: BORDE_SUAVE, insideHorizontal: BORDE_SUAVE, insideVertical: BORDE_SUAVE };

const t = (text: string, o: { b?: boolean; i?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text, bold: o.b, italics: o.i, size: o.size, color: o.color, font: FUENTE });
const p = (runs: TextRun[] | string, o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; before?: number; salto?: boolean } = {}) =>
  new Paragraph({
    children: typeof runs === "string" ? [t(runs)] : runs,
    alignment: o.align, spacing: { after: o.after ?? 80, before: o.before ?? 0 }, pageBreakBefore: o.salto,
  });

function celda(children: Paragraph[], o: { ancho?: number; fondo?: string; bordes?: boolean } = {}) {
  return new TableCell({
    children,
    width: o.ancho ? { size: o.ancho, type: WidthType.PERCENTAGE } : undefined,
    shading: o.fondo ? { type: ShadingType.CLEAR, color: "auto", fill: o.fondo } : undefined,
    borders: o.bordes === false ? sinBordes : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
  });
}

/** Barra verde con el número y el nombre del producto. */
function cabeceraFicha(f: FichaProducto, seccionSingular: string) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...sinBordes, insideHorizontal: SIN_BORDE, insideVertical: SIN_BORDE },
    rows: [new TableRow({ children: [
      celda([p([t(f.numero, { b: true, size: 40, color: "FFFFFF" })], { align: AlignmentType.CENTER, after: 0 })], { ancho: 12, fondo: VERDE, bordes: false }),
      celda([
        p([t(`${seccionSingular.toUpperCase()} ${f.numero}`, { b: true, size: 16, color: "D1FAE5" })], { after: 0 }),
        p([t(f.nombre, { b: true, size: 32, color: "FFFFFF" })], { after: 0 }),
      ], { ancho: 88, fondo: VERDE_OSCURO, bordes: false }),
    ] })],
  });
}

/** Tabla INGREDIENTE · CANT. · UND. */
function tablaIngredientes(b: BaseFicha) {
  const cab = (x: string, align?: (typeof AlignmentType)[keyof typeof AlignmentType]) =>
    celda([p([t(x, { b: true, size: 16, color: "FFFFFF" })], { after: 0, align })], { fondo: VERDE });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: bordesSuaves,
    rows: [
      new TableRow({ tableHeader: true, children: [cab("INGREDIENTE"), cab("CANT.", AlignmentType.RIGHT), cab("UND")] }),
      ...b.lineas.map((l) => new TableRow({ children: [
        celda([p([t(l.nombre, { size: 19 })], { after: 0 })], { ancho: 64 }),
        celda([p([t(l.cantidad, { size: 19 })], { after: 0, align: AlignmentType.RIGHT })], { ancho: 20 }),
        celda([p([t(l.unidad, { size: 19 })], { after: 0 })], { ancho: 16 }),
      ] })),
    ],
  });
}

/** Pasos, recomendaciones y vida útil de una base o del armado. */
function textos(b: BaseFicha): Paragraph[] {
  const out: Paragraph[] = [];
  if (b.pasos.length > 0) {
    out.push(p([t("PREPARACIÓN", { b: true, size: 16, color: VERDE })], { before: 120, after: 40 }));
    b.pasos.forEach((paso, k) => out.push(p([t(` ${k + 1}  `, { b: true, size: 18, color: VERDE }), t(paso, { size: 19 })], { after: 40 })));
  } else {
    // Sin pasos en el sistema: el apartado queda vacío para llenarlo (pedido de Jahnn, 27-nov-2026).
    out.push(p([t("PREPARACIÓN", { b: true, size: 16, color: VERDE })], { before: 120, after: 40 }));
    for (let k = 0; k < 3; k++) out.push(p("", { after: 120 }));
  }
  if (b.recomendaciones) {
    out.push(p([t("RECOMENDACIONES", { b: true, size: 16, color: VERDE })], { before: 120, after: 40 }));
    for (const linea of b.recomendaciones.split("\n").filter((x) => x.trim())) out.push(p([t(linea.trim(), { size: 19 })], { after: 40 }));
  }
  if (b.vidaUtil) out.push(p([t("VIDA ÚTIL  ", { b: true, size: 16, color: VERDE }), t(b.vidaUtil, { size: 19 })], { before: 120 }));
  return out;
}

function ficha(f: FichaProducto, seccionSingular: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [new Paragraph({ children: [], pageBreakBefore: true }), cabeceraFicha(f, seccionSingular)];
  if (f.bases.length > 0) {
    out.push(p([t("ESTE PRODUCTO LLEVA", { b: true, size: 16, color: VERDE })], { before: 200, after: 40 }));
    for (const b of f.bases) out.push(p([t(`•  ${b.nombre}`, { size: 19 })], { after: 20 }));
    for (const b of f.bases) {
      out.push(p([t("PREPARACIÓN BASE   ", { b: true, size: 18, color: VERDE }), t(b.nombre, { b: true, size: 22 })], { before: 280, after: 80 }));
      out.push(tablaIngredientes(b), ...textos(b));
    }
  }
  out.push(p([t("■  ", { color: VERDE_OSCURO }), t(`Armado: ${f.nombre}`, { b: true, size: 24, color: VERDE_OSCURO })], { before: 320, after: 80 }));
  out.push(tablaIngredientes(f), ...textos(f));
  return out;
}

const REGLAS = [
  "Sigue la ficha, no la memoria. Los gramajes y pasos de este recetario son el estándar de Yayi’s. Cada producto debe salir igual, lo prepare quien lo prepare.",
  "Pesa siempre. Usa la balanza para cada ingrediente. La porción correcta cuida el sabor del cliente y el costo del negocio.",
  "Rotula y respeta la vida útil. Toda preparación base se guarda con nombre y fecha. Si pasó su vida útil o tienes dudas, no se usa: sepárala y avisa.",
  "Prueba antes de servir. Rectifica sal, dulzor y acidez antes del servicio.",
  "Si algo no cuadra, avisa. No cambies una receta por tu cuenta. Las mejoras se proponen al Administrador(a).",
];

/** «Bebidas» → «BEB»: para el código del documento. */
const codigoDe = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "GEN";
const singular = (s: string) => s.replace(/es$/i, "").replace(/s$/i, "");

export async function recetarioWord(r: Recetario, fecha: string): Promise<Buffer> {
  const codigo = `FT-CAF-${codigoDe(r.seccion)}-01`;
  const sing = singular(r.seccion);
  const portada = [
    p("", { after: 1600 }),
    p([t("RECETARIO DE", { size: 28, color: GRIS })], { align: AlignmentType.CENTER, after: 40 }),
    p([t(r.seccion, { b: true, size: 64, color: VERDE_OSCURO })], { align: AlignmentType.CENTER, after: 120 }),
    p([t("Fichas técnicas de cocina", { size: 26 })], { align: AlignmentType.CENTER, after: 40 }),
    p([t("Fonavi · Centro", { size: 24, color: VERDE })], { align: AlignmentType.CENTER, after: 600 }),
    p([t("Todo lo valioso se hace con tiempo", { i: true, size: 22, color: GRIS })], { align: AlignmentType.CENTER, after: 1200 }),
    p([t(`${codigo}  ·  Generado del sistema  ·  ${fecha}`, { size: 18, color: GRIS })], { align: AlignmentType.CENTER }),
  ];

  const resumen: (Paragraph | Table)[] = [
    p([t("HOJA DE CONSULTA RÁPIDA", { b: true, size: 28, color: VERDE_OSCURO })], { salto: true, after: 60 }),
    p([t("Armado y bases de cada ficha. Para pasos, vida útil y recomendaciones, consulta la ficha completa.", { size: 18, color: GRIS })], { after: 160 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: bordesSuaves,
      rows: [
        new TableRow({ tableHeader: true, children: ["N.º", sing, "Armado: ingredientes y cantidades por unidad", "Preparaciones base"].map((x) =>
          celda([p([t(x, { b: true, size: 16, color: "FFFFFF" })], { after: 0 })], { fondo: VERDE })) }),
        ...r.productos.map((f) => new TableRow({ children: [
          celda([p([t(f.numero, { b: true, size: 18 })], { after: 0 })], { ancho: 7 }),
          celda([p([t(f.nombre, { b: true, size: 18 })], { after: 0 })], { ancho: 20 }),
          celda([p([t(f.lineas.map((l) => `${l.nombre} ${l.cantidad}${l.unidad ? ` ${l.unidad}` : ""}`).join(" · "), { size: 17 })], { after: 0 })], { ancho: 48 }),
          celda([p([t(f.bases.length ? f.bases.map((b) => b.nombre).join(" · ") : "Solo armado", { size: 17 })], { after: 0 })], { ancho: 25 }),
        ] })),
      ],
    }),
  ];

  const reglas = [
    p([t("Las 5 reglas de la cocina Yayi’s", { b: true, size: 28, color: VERDE_OSCURO })], { salto: true, after: 160 }),
    ...REGLAS.map((x, k) => p([t(`${k + 1}  `, { b: true, size: 24, color: VERDE }), t(x, { size: 20 })], { after: 120 })),
    p([t("Para llevar", { b: true, size: 22, color: VERDE_OSCURO })], { before: 240, after: 60 }),
    p([t("Todo lo que sale para llevar va en su envase de llevar (vaso con tapa, papel manteca con logo). En mesa se sirve en vajilla de vidrio.", { size: 20 })]),
  ];

  const control = [
    p([t("Unidades", { b: true, size: 24, color: VERDE_OSCURO })], { salto: true, after: 80 }),
    p([t("gr gramos · kg kilogramos · ml mililitros · lt litros · und unidad · cda cucharada · c/n cantidad necesaria", { size: 19 })], { after: 240 }),
    p([t("Control del documento", { b: true, size: 24, color: VERDE_OSCURO })], { after: 80 }),
    ...[
      ["Código", codigo],
      ["Versión", `Generado del sistema el ${fecha} · Cocinas de Fonavi y Centro`],
      ["Responsable de uso", "Cocinero(a) · verifica el Administrador(a) de sede"],
      ["Aprueba cambios", "CEO (receta, gramaje o insumo)"],
      ["Fuente", "Recetas y costos de Yayi’s Cash Control: este recetario sale de las mismas recetas con que se costea."],
    ].map(([k, v]) => p([t(`${k}: `, { b: true, size: 19 }), t(v, { size: 19 })], { after: 60 })),
  ];

  const doc = new Document({
    creator: "Yayi's",
    title: `Recetario de ${r.seccion}`,
    styles: { default: { document: { run: { font: FUENTE, size: 20 } } } },
    sections: [{
      properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [
        new TextRun({ text: `${codigo} · Recetario de ${r.seccion} · `, size: 16, color: GRIS, font: FUENTE }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GRIS, font: FUENTE }),
      ] })] }) },
      children: [...portada, ...resumen, ...reglas, ...r.productos.flatMap((f) => ficha(f, sing)), ...control],
    }],
  });
  return Packer.toBuffer(doc);
}
