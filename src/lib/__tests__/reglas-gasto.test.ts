/**
 * Las reglas que clasifican un gasto por su concepto y proveedor (las mismas
 * de la pestaña REGLAS del Excel de Kelly). Casos reales de los Excels de
 * marzo a setiembre 2026: con estas reglas, 93% coincide con lo que Kelly
 * clasificó a mano, y casi todo lo que difiere es la regla corrigiendo.
 */
import { describe, it, expect } from "vitest";
import { clasificarGasto, CATEGORIAS_GASTO, REGLAS_GASTO, POR_ACLARAR, textoParaReglas } from "../reglas-gasto";
import { resolverGrupoDelGasto } from "../excel-importer";

describe("lo que dice el concepto", () => {
  it.each([
    ["FRUTAS Y VERDURAS", "ELENA CUEVA", "INSUMOS"],
    ["SUELDO AGOSTO 2026", "KELLY TERRONES", "PLANILLA"],
    ["ITF", "BCP", "SS BANCARIOS"],
    ["CUOTA SET 2026", "KELLY TERRONES", "PRÉSTAMOS Y TARJETAS"],
    ["1 BALÓN DE GAS", "CAXAGAS", "SERVICIOS"],
    ["SERVICIO CONTABLE AGOSTO 2026", "EDUARDO ROBLES", "CONTABILIDAD Y ASESORÍAS"],
    ["FACTURAS DEL 01-03 JUNIO", "PRODUCTOS SALUDABLES YAYIS", "PRODUCTOS ATELIER"],
    ["VARIOS", "AKEMY", "PACKAGING"],
    ["AHORRO FONDOS MUTUOS", "BCP", "AHORRO"],
    ["PAGO UTILIDADES JAHNN", "UTILIDADES 2025", "UTILIDADES A SOCIOS"],
  ])("%s ‹%s› → %s", (concepto, proveedor, esperado) => {
    expect(clasificarGasto(concepto, proveedor)).toBe(esperado);
  });
});

describe("las excepciones ganan a las palabras sueltas", () => {
  it("una bolsa de hielo es insumo, no packaging", () => {
    expect(clasificarGasto("1 BOLSA DE HIELO – CAJA CHICA #03", "PROVEEDOR")).toBe("INSUMOS");
  });
  it("el delivery de un producto es delivery, no el producto", () => {
    expect(clasificarGasto("DELIVERY PECHUGAS DE POLLO", "ELENA CUEVA")).toBe("DELIVERY Y FLETES");
  });
  it("el mantenimiento de cuenta es del banco, no de los equipos", () => {
    expect(clasificarGasto("COM MNTO CTA", "BCP")).toBe("SS BANCARIOS");
  });
  it("un pago mal ejecutado no es el gasto que parece", () => {
    expect(clasificarGasto("PAGO MAL EJECUTADO", "VICTOR ALIAGA")).toBe("DEVOLUCIONES");
  });
  it("el débito 'préstamo vehicular' son los sueldos de Jahnn y Juani", () => {
    expect(clasificarGasto("PRESTAMO VEHICULAR", "BCP")).toBe("PLANILLA");
  });
  it("las palabras no se encuentran dentro de otras", () => {
    // DUCTO dentro de PRODUCTOS, OLLA dentro de DOLLARCITY y CEBOLLA, TAZA dentro de MOSTAZA.
    expect(clasificarGasto("REEMBOLSO POR LUZ 2DO PISO", "PRODUCTOS SALUDABLES YAYIS")).toBe("SERVICIOS");
    expect(clasificarGasto("VARIOS", "DOLLARCITY")).toBe("LIMPIEZA");
    expect(clasificarGasto("POLLO, NARANJA Y MOSTAZA", "ELENA CUEVA")).toBe("INSUMOS");
  });
});

describe("lo que no se reconoce no se adivina", () => {
  it("queda POR ACLARAR", () => {
    expect(clasificarGasto("GABY", "")).toBe(POR_ACLARAR);
    expect(clasificarGasto("", "")).toBe(POR_ACLARAR);
  });
  it("el texto se compara sin tildes y en mayúsculas", () => {
    expect(textoParaReglas("Préstamo  Diners", "Kelly")).toBe(" PRESTAMO DINERS KELLY ");
  });
});

describe("la lista", () => {
  it("cada regla apunta a una categoría del catálogo", () => {
    const nombres = new Set(CATEGORIAS_GASTO.map((c) => c.nombre));
    for (const r of REGLAS_GASTO) expect(nombres.has(r.categoria), `${r.clave} → ${r.categoria}`).toBe(true);
  });
  it("las claves van en MAYÚSCULAS y sin tildes (así las compara el Excel)", () => {
    for (const r of REGLAS_GASTO) expect(r.clave).toBe(r.clave.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase());
  });
});

describe("al importar el Excel", () => {
  it("un grupo bolsón se clasifica por el concepto", () => {
    expect(resolverGrupoDelGasto("FONDOS MUTUOS", "AZUCAR", "", "expense").canonica).toBe("INSUMOS");
    expect(resolverGrupoDelGasto("SS GENERALES", "EXTINTOR", "ROSSANA LUYCHO", "expense").canonica).toBe("MANTENIMIENTO");
    expect(resolverGrupoDelGasto("OTROS", "GABY", "", "expense").canonica).toBe(POR_ACLARAR);
  });
  it("un grupo claro manda sobre el concepto", () => {
    expect(resolverGrupoDelGasto("PLANILLA", "PAGO LUIS", "", "expense").canonica).toBe("PLANILLA");
    expect(resolverGrupoDelGasto("CONTABILIDAD Y ASESORÍAS", "X", "", "expense").canonica).toBe("CONTABILIDAD Y ASESORÍAS");
  });
  it("un grupo desconocido se clasifica por el concepto si puede", () => {
    expect(resolverGrupoDelGasto("DONACIONES", "PECHUGAS DE POLLO", "", "expense").canonica).toBe("INSUMOS");
    expect(resolverGrupoDelGasto("DONACIONES", "XYZ", "", "expense").confianza).toBe("desconocida");
  });
});
