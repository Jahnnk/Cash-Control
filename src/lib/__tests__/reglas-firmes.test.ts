/**
 * Reglas firmes (25-oct-2026, aprobadas por Jahnn): cuando el concepto es claro, la categoría del sistema gana sobre
 * el Grupo del Excel. Y las reglas que se equivocaban (grupo B de la revisión) ya no se equivocan.
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { clasificarGasto, reglaFirme } from "../reglas-gasto";
import { parseExcelFile } from "../excel-importer";
import { correccionesFirmesParaKelly } from "../reglas-firmes-kelly";

const firme = (t: string) => reglaFirme(t)?.categoria ?? null;

describe("reglas firmes", () => {
  it("los casos aprobados por Jahnn", () => {
    expect(firme("PAPEL PARA IMPRESORA (GRUPO PAPELERO COSTA) [FA]")).toBe("OFICINA Y SISTEMAS");
    expect(firme("SERVICIO CONTABLE AGOSTO 2026 (EDUARDO ROBLES)")).toBe("CONTABILIDAD Y ASESORÍAS");
    expect(firme("REEMBOLSO POR PAGO ANUAL DE CANVA")).toBe("OFICINA Y SISTEMAS");
    expect(firme("AGUA MINERAL (KUSY)")).toBe("INSUMOS");
    expect(firme("INFUSIONES (INFUSIONARTE)")).toBe("INSUMOS");
    expect(firme("15 HUMINTAS (NELIDA ROJAS)")).toBe("INSUMOS");
    expect(firme("Packaging Semanal")).toBe("PACKAGING");
    expect(firme("1 CUCHILA LICUADORA (VIRGEN DE LA PUERTA)")).toBe("MANTENIMIENTO");
    expect(firme("1 MANDIL (MERCADO)")).toBe("PERSONAL");
    expect(firme("DEVOLUCIÓN A CLIENTASS (CLIENTA)")).toBe("DEVOLUCIONES A CLIENTES");
    expect(firme("REPARACIÓN BALANZA (LUIS LINAN)")).toBe("MANTENIMIENTO");
    expect(firme("MNTO REFRIGERADORA (LUIS LINAN)")).toBe("MANTENIMIENTO");
  });
  it("«delivery» solo cuando el concepto EMPIEZA así", () => {
    expect(firme("Delivery leche")).toBe("DELIVERY Y FLETES");
    expect(firme("DELIVERY (ONDA ORGANICA)")).toBe("DELIVERY Y FLETES");
    expect(firme("5 PECHUGAS DE POLLO Y DELIVERY (ELENA CUEVA)")).toBeNull();
  });
  it("un flete depende de qué se trajo: ninguna regla firme decide", () => {
    expect(firme("50% FELTE MANDILES (JUANI TERRONES)")).toBeNull();
    expect(firme("GUÍA CONGELADORA – FLETE (JUANI TERRONES)")).toBeNull();
  });
  it("nunca aplican a plata que no era de Yayi's, ni a un cliente que pagó de más", () => {
    expect(firme("PAGO MAL EJECUTADO AGUA MINERAL")).toBeNull();
    expect(firme("DEVOLUCION A CLIENTE POR PAGO DOBLE")).toBeNull();
  });
  it("lo que no está en la lista no tiene regla firme (sigue la opinión normal)", () => {
    expect(firme("LECHE GLORIA EN BOLSA")).toBeNull();
    expect(firme("COMPRAS METRO (JORMAR)")).toBeNull();
  });
});

describe("al importar, la regla firme gana sobre el Grupo del Excel", () => {
  const CAB = ["Fecha", "Ing. / Gsto.", "Grupo ", "PROVEEDOR", "RUC", "Concepto", "Comprobante de Pago", "Nro. CP", "ING. EFECTIVO", "ING. CTA. CTE.", "GTOS. EFECTIVO", "GTOS. CTA. CTE.", "SALDO EFECTIVO", "SALDO CTA. CTE."];
  const serial = (iso: string) => Math.round(new Date(iso + "T00:00:00Z").getTime() / 86400000) + 25569;
  const libro = (filas: unknown[][]) => {
    const ws = XLSX.utils.aoa_to_sheet([[null], [null], CAB, ...filas]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ing&Gtos-SEP26");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  };
  it("«PAPEL PARA IMPRESORA» con Grupo EQUIPOS entra como OFICINA Y SISTEMAS, y lo dice", () => {
    const r = parseExcelFile(libro([[serial("2026-09-22"), "G", "EQUIPOS", "GRUPO PAPELERO COSTA", null, "PAPEL PARA IMPRESORA", "FA", null, null, null, null, 81]]), "Ing&Gtos-SEP26");
    expect(r.movimientos[0]).toMatchObject({ category: "OFICINA Y SISTEMAS", grupoExcel: "EQUIPOS", amount: 81 });
    expect(r.resolucionCategorias.find((x) => x.canonica === "OFICINA Y SISTEMAS")!.motivo).toContain("Regla firme");
  });
  it("sin regla firme, el Grupo de Kelly se respeta como siempre", () => {
    const r = parseExcelFile(libro([[serial("2026-09-29"), "G", "INSUMOS", "ELENA CUEVA", null, "5 PECHUGAS DE POLLO Y DELIVERY", "SC", null, null, null, null, 99.7]]), "Ing&Gtos-SEP26");
    expect(r.movimientos[0].category).toBe("INSUMOS");
  });
});

describe("reglas que se equivocaban (grupo B de la revisión del 25-oct-2026)", () => {
  it("cada concepto cae donde corresponde", () => {
    expect(clasificarGasto("Lavavajillas x3, detergente en polvo")).toBe("LIMPIEZA");
    expect(clasificarGasto("Afilado de cuchillo")).toBe("MANTENIMIENTO");
    expect(clasificarGasto("Cajas para envío")).toBe("PACKAGING");
    expect(clasificarGasto("Leche Gloria en Bolsa")).toBe("INSUMOS");
    expect(clasificarGasto("AGUA  MANANTIAL SANTA ROSA  [FE]")).toBe("INSUMOS");
    expect(clasificarGasto("VENTA INTERNA DE PANES (EXPERIENCIAS SALUDABLES)")).toBe("PRODUCTOS ATELIER");
    expect(clasificarGasto("Carreta pechugas de pollo")).toBe("DELIVERY Y FLETES");
  });
});

describe("lista de correcciones para Kelly", () => {
  it("anota lo que una regla firme corrigió; si el Grupo ya coincide, no", () => {
    const lineas = correccionesFirmesParaKelly([
      { fecha: "2026-09-22", monto: 81, concepto: "PAPEL PARA IMPRESORA (GRUPO PAPELERO COSTA)", categoria: "OFICINA Y SISTEMAS", grupoExcel: "EQUIPOS" },
      { fecha: "2026-09-22", monto: 13.3, concepto: "SUSCRIPCIÓN CANVA", categoria: "OFICINA Y SISTEMAS", grupoExcel: "OFICINA Y SISTEMAS" },
      // Una decisión de Jahnn lo dejó en otra categoría: la regla firme no lo reclama.
      { fecha: "2026-09-10", monto: 50, concepto: "MANDIL ESPECIAL", categoria: "MARKETING", grupoExcel: "MARKETING" },
    ]);
    expect(lineas).toEqual(['• "PAPEL PARA IMPRESORA (GRUPO PAPELERO COSTA)" del 22/09 (S/81.00): en el Grupo va OFICINA Y SISTEMAS, no «EQUIPOS» (regla firme).']);
  });
});
