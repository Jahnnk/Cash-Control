/**
 * Tests de los parsers de cuentas por cobrar.
 *
 * Las filas replican los exports reales del 01–09 ago-2026, incluidas
 * sus rarezas: montos como texto, "FACTURA Canjear" en la columna Tipo,
 * el estado de cobranza escondido dentro de "Medios", y la misma factura
 * escrita distinto en cada archivo ("FB02-001242" vs "FB02" + "00001242").
 */
import { describe, it, expect } from "vitest";
import {
  parseVentasReport,
  parseFacturasReport,
  parseReceivablesFile,
  detectarTipoReporte,
  leerMedios,
  docKeyDe,
} from "./receivables-parser";

// ── Reporte de Ventas ────────────────────────────────────────────
const H_VENTAS = [
  "", "#", "Tipo", "Serie", "Cajero", "Cliente", "Salon", "Mesa", "Caja", "Fecha",
  "Inicio", "Fin", "Tiempo", "Medios", "Moneda", "SUB-T", "DELIVERY", "DESC", "TOTAL",
  "PROPINA", "CREDITO", "PRE PAGOS", "EFECTIVO S/", "TARJETA S/", "YAPE S/", "PLIN S/",
  "TRANSFERENCIA S/", "DETRACCIÓN",
];
const T_VENTAS = ["Reporte de Ventas de 2026-08-01 al 2026-08-08"];

/** Construye una fila de ventas con la forma real del export. */
const v = (
  n: string, tipo: string, serie: string, cliente: string, fecha: string,
  medios: string, total: string, credito: string, efectivo = "0.0",
) => [
  "", n, tipo, serie, "ADMIN YAYIS", cliente, "VENTAS", "VENTAS 01", "01", fecha,
  "01:45 PM", "01:48 PM", "00:02:10", medios, "S/", total, "0.0", "0.0", total,
  "0.0", credito, "0.0", efectivo, "0.0", "0.0", "0.0", "0.0", "0.0",
];

const VENTAS = [
  T_VENTAS, H_VENTAS,
  v("1435", "FACTURA Canjear", "FB02-001242", "SERVICIOS GASTRONOMICOS YAYIS S.A.C.", "2026-08-08",
    "CREDITOCuota 1: 358.32 - 2026-08-09 [PENDIENTE]", "358.32", "358.32"),
  v("1432", "TICKET Canjear", "1432", "EXPERIENCIAS GASTRONOMICAS YAYIS S.R.L.", "2026-08-08",
    "CREDITO", "130.82", "0.0"),
  v("1429", "FACTURA Canjear", "FB02-001237", "G & V AGROANDINA S.A.C.", "2026-08-07",
    "CREDITOCuota 1: 728.55 - 2026-08-08 [PENDIENTE]", "728.55", "728.55"),
  v("1430", "BOLETA Canjear", "BB02-000054", "URBINA YAP SAM XIMENA OLGA", "2026-08-07",
    "CREDITOCuota 1: 104.35 - 2026-08-08 [PAGADA]", "104.35", "104.35"),
  v("1398", "FACTURA Canjear", "FB02-001206", "SERVICIOS GASTRONOMICOS YAYIS S.A.C.", "2026-08-04",
    "EFECTIVO", "117.52", "0.0", "117.52"),
];

// ── Consolidado de Facturas ──────────────────────────────────────
const H_FACT = [
  "EMISOR", "SERIE", "NUMERO", "TIPO", "FECHA", "T DOC. CLTE.", "DOC. CLTE.", "CLIENTE",
  "DESC", "GRAV", "INAF", "EXON", "GRAT", "ICBPER", "EXPOR", "OT.CRG.", "IGV", "TASA IGV",
  "TOTAL", "MONEDA", "MEDIO", "ESTADO", "RESPUESTA",
];
const f = (
  numero: string, fecha: string, doc: string, cliente: string,
  grav: string, igv: string, total: string, estado: string,
) => [
  "20608007220", "FB02", numero, "01", fecha, "6", doc, cliente,
  "0.0", grav, "0.0", "0.0", "0.0", "0.0", "0.0", "0.0", igv, "0.105",
  total, "PEN", "CREDITO", estado, "El Comprobante ha sido aceptado",
];

const FACTURAS = [
  ["Consolidado de Facturas del 2026-08-01 al 2026-08-09"], H_FACT,
  f("00001242", "2026-08-08", "20614333643", "SERVICIOS GASTRONOMICOS YAYIS S.A.C.", "324.27", "34.05", "358.32", "EMITIDO"),
  f("00001239", "2026-08-08", "20615473775", "EXPERIENCIAS GASTRONOMICAS YAYIS S.R.L.", "118.39", "12.43", "130.82", "ANULADO"),
  f("00001237", "2026-08-07", "20605241701", "G & V AGROANDINA S.A.C.", "659.32", "69.23", "728.55", "EMITIDO"),
  f("00001206", "2026-08-04", "20614333643", "SERVICIOS GASTRONOMICOS YAYIS S.A.C.", "106.35", "11.17", "117.52", "EMITIDO"),
];

describe("leerMedios — el estado de cobro escondido en el texto", () => {
  it("saca estado y vencimiento de una cuota pendiente", () => {
    expect(leerMedios("CREDITOCuota 1: 358.32 - 2026-08-09 [PENDIENTE]")).toEqual({
      estado: "PENDIENTE",
      vencimiento: "2026-08-09",
    });
  });

  it("reconoce una cuota ya pagada", () => {
    expect(leerMedios("CREDITOCuota 1: 104.35 - 2026-08-08 [PAGADA]").estado).toBe("PAGADA");
  });

  it("con varias cuotas basta una pendiente, y toma la más antigua", () => {
    const r = leerMedios(
      "CREDITOCuota 1: 50 - 2026-08-05 [PAGADA]Cuota 2: 50 - 2026-08-20 [PENDIENTE]",
    );
    expect(r.estado).toBe("PENDIENTE");
    expect(r.vencimiento).toBe("2026-08-20");
  });

  it("marca SIN_CUOTA cuando no hay cuotas (pago al contado o venta huérfana)", () => {
    expect(leerMedios("EFECTIVO").estado).toBe("SIN_CUOTA");
    expect(leerMedios("CREDITO").estado).toBe("SIN_CUOTA");
    expect(leerMedios("").estado).toBe("SIN_CUOTA");
  });
});

describe("docKeyDe — la misma factura escrita distinto en cada archivo", () => {
  it("une 'FB02-001242' del reporte de ventas con SERIE+NUMERO del consolidado", () => {
    expect(docKeyDe("FB02-001242", null, "FACTURA")).toBe("FB02-1242");
    expect(docKeyDe("FB02", "00001242", "FACTURA")).toBe("FB02-1242");
  });

  it("los tickets, que no tienen serie fiscal, van con su correlativo", () => {
    expect(docKeyDe("1432", null, "TICKET")).toBe("TICKET-1432");
  });
});

describe("detectarTipoReporte — Luis suelta los dos archivos juntos", () => {
  it("reconoce cada archivo por sus columnas propias", () => {
    expect(detectarTipoReporte(VENTAS)).toBe("ventas");
    expect(detectarTipoReporte(FACTURAS)).toBe("facturas");
  });

  it("no reconoce un archivo ajeno", () => {
    expect(detectarTipoReporte([["Otra cosa"], ["a", "b"], ["1", "2"]])).toBe(null);
  });

  it("parseReceivablesFile rechaza con mensaje claro lo que no reconoce", () => {
    const r = parseReceivablesFile([["Otra cosa"], ["a", "b"]]);
    expect(r.errores.length).toBeGreaterThan(0);
    expect(r.docs).toEqual([]);
  });
});

describe("parseVentasReport", () => {
  it("lee los tres tipos de documento y no confunde 'FACTURA Canjear'", () => {
    const r = parseVentasReport(VENTAS);
    expect(r.errores).toEqual([]);
    expect(r.docs.map((d) => d.tipo).sort()).toEqual(
      ["BOLETA", "FACTURA", "FACTURA", "FACTURA", "TICKET"].sort(),
    );
  });

  it("separa el total por tipo — la base del cuadre a tres bandas", () => {
    const r = parseVentasReport(VENTAS);
    expect(r.totales.porTipo.FACTURA).toBe(1204.39); // 358.32 + 728.55 + 117.52
    expect(r.totales.porTipo.BOLETA).toBe(104.35);
    expect(r.totales.porTipo.TICKET).toBe(130.82);
    expect(r.totales.total).toBe(1439.56);
  });

  it("separa lo pendiente de lo ya cobrado", () => {
    const r = parseVentasReport(VENTAS);
    expect(r.totales.pendiente).toBe(1086.87); // 358.32 + 728.55
    expect(r.totales.pagado).toBe(104.35);
  });

  it("detecta las sedes por nombre (el reporte de ventas no trae el RUC)", () => {
    const r = parseVentasReport(VENTAS);
    const centro = r.docs.find((d) => d.docKey === "FB02-1242")!;
    expect(centro.esSede).toBe(true);
    expect(centro.sedeId).toBe(3);
    expect(r.docs.find((d) => d.docKey === "FB02-1237")!.esSede).toBe(false);
  });

  it("suma lo cobrado en el momento desde las columnas de medios de pago", () => {
    const r = parseVentasReport(VENTAS);
    expect(r.docs.find((d) => d.docKey === "FB02-1206")!.cobradoPos).toBe(117.52);
  });

  it("avisa de las ventas a crédito SIN cuota: plata que nadie está cobrando", () => {
    const r = parseVentasReport(VENTAS);
    const huerfano = r.docs.find((d) => d.docKey === "TICKET-1432")!;
    expect(huerfano.estadoCuota).toBe("SIN_CUOTA");
    expect(huerfano.cobradoPos).toBe(0);
    expect(r.warnings.some((w) => w.includes("SIN cuota"))).toBe(true);
  });

  it("no cuenta como huérfana la venta cobrada al contado", () => {
    const r = parseVentasReport(VENTAS);
    const contado = r.docs.find((d) => d.docKey === "FB02-1206")!;
    expect(contado.estadoCuota).toBe("SIN_CUOTA");
    expect(contado.cobradoPos).toBeGreaterThan(0);
  });

  it("deriva el período del propio archivo", () => {
    const r = parseVentasReport(VENTAS);
    expect(r.periodo).toEqual({ inicio: "2026-08-04", fin: "2026-08-08" });
  });

  it("encuentra los encabezados aunque Byte agregue filas arriba", () => {
    const r = parseVentasReport([T_VENTAS, ["Generado el 09/08/2026"], [], H_VENTAS, VENTAS[2]]);
    expect(r.errores).toEqual([]);
    expect(r.docs).toHaveLength(1);
  });

  it("rechaza un archivo que no es el reporte de ventas", () => {
    const r = parseVentasReport([["x"], ["a", "b"], ["1", "2"]]);
    expect(r.errores.length).toBeGreaterThan(0);
  });
});

describe("parseFacturasReport", () => {
  it("marca las anuladas y las deja fuera del total", () => {
    const r = parseFacturasReport(FACTURAS);
    expect(r.errores).toEqual([]);
    const anulada = r.docs.find((d) => d.docKey === "FB02-1239")!;
    expect(anulada.estadoFactura).toBe("ANULADO");
    expect(r.totales.anulado).toBe(130.82);
    expect(r.totales.total).toBe(1204.39); // solo las emitidas
    expect(r.warnings.some((w) => w.includes("anulada"))).toBe(true);
  });

  it("trae el RUC del cliente, que el reporte de ventas no tiene", () => {
    const r = parseFacturasReport(FACTURAS);
    expect(r.docs.find((d) => d.docKey === "FB02-1237")!.documento).toBe("20605241701");
  });

  it("detecta las sedes por RUC", () => {
    const r = parseFacturasReport(FACTURAS);
    const c = r.docs.find((d) => d.docKey === "FB02-1242")!;
    expect(c.esSede).toBe(true);
    expect(c.sedeId).toBe(3);
  });

  it("lee el IGV y el gravado", () => {
    const r = parseFacturasReport(FACTURAS);
    const d = r.docs.find((d) => d.docKey === "FB02-1237")!;
    expect(d.igv).toBe(69.23);
    expect(d.gravado).toBe(659.32);
  });

  it("NO inventa estado de cobro: eso solo lo sabe el reporte de ventas", () => {
    const r = parseFacturasReport(FACTURAS);
    expect(r.docs.every((d) => d.estadoCuota === "SIN_CUOTA")).toBe(true);
  });

  it("rechaza un archivo que no es el consolidado", () => {
    const r = parseFacturasReport([["x"], ["a", "b"], ["1", "2"]]);
    expect(r.errores.length).toBeGreaterThan(0);
  });
});

describe("los dos archivos juntos — el cuadre que le importa a Jahnn", () => {
  it("las facturas del reporte de ventas coinciden con el consolidado emitido", () => {
    const ventas = parseVentasReport(VENTAS);
    const facturas = parseFacturasReport(FACTURAS);
    expect(ventas.totales.porTipo.FACTURA).toBe(facturas.totales.total);
  });

  it("facturas + boletas + tickets = el total del reporte de ventas", () => {
    const { porTipo, total } = parseVentasReport(VENTAS).totales;
    expect(porTipo.FACTURA + porTipo.BOLETA + porTipo.TICKET).toBeCloseTo(total, 2);
  });

  it("la misma factura cae en la misma llave desde los dos archivos", () => {
    const kv = new Set(parseVentasReport(VENTAS).docs.map((d) => d.docKey));
    const kf = parseFacturasReport(FACTURAS).docs.map((d) => d.docKey);
    // Todas las facturas del consolidado salvo la anulada (que en ventas
    // vive como ticket) deben encontrar su par.
    expect(kf.filter((k) => kv.has(k)).sort()).toEqual(["FB02-1206", "FB02-1237", "FB02-1242"]);
  });
});
