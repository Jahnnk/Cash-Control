import { describe, it, expect } from "vitest";
import { clasificarEgreso, calidadClasificacion, porcentajeSeguro, reglaAprendidaDe, type GastoAClasificar } from "../clasificador-gasto";
import { clasificarGasto } from "../reglas-gasto";

const gasto = (g: Partial<GastoAClasificar>): GastoAClasificar => ({
  concepto: null, categoria: "POR ACLARAR", grupoExcel: null, deExcel: true, decidido: false, ...g,
});

describe("clasificador experto de egresos (casos reales mar–set 2026)", () => {
  it("lo que decidió Jahnn manda, con confianza alta", () => {
    const c = clasificarEgreso(gasto({ concepto: "Nómina Editha", categoria: "PLANILLA", deExcel: false, decidido: true }));
    expect(c).toMatchObject({ categoria: "PLANILLA", confianza: "alta" });
  });

  it("Excel y reglas coinciden → alta", () => {
    const c = clasificarEgreso(gasto({ concepto: "DETERGENTE (SODIMAC)", categoria: "LIMPIEZA", grupoExcel: "LIMPIEZA" }));
    expect(c.confianza).toBe("alta");
  });

  it("una sola opinión, sin contradicción → media (Centro, planilla por nombre)", () => {
    const c = clasificarEgreso(gasto({ concepto: "JUNIOR", categoria: "PLANILLA", grupoExcel: "PLANILLA" }));
    expect(c).toMatchObject({ categoria: "PLANILLA", confianza: "media" });
  });

  it("cargas viejas sin grupo guardado: la categoría guardada es la del Excel", () => {
    const c = clasificarEgreso(gasto({ concepto: "ROSARIO", categoria: "PLANILLA", grupoExcel: null, deExcel: true }));
    expect(c.confianza).toBe("media");
    expect(c.opiniones).toEqual([{ fuente: "excel", categoria: "PLANILLA", tipo: "Fijo" }]);
  });

  it("categorías distintas del mismo tipo → media: el punto de equilibrio no cambia", () => {
    const c = clasificarEgreso(gasto({ concepto: "15 HUMINTAS (NELIDA ROJAS)", categoria: "PRODUCTOS ATELIER", grupoExcel: null }));
    expect(c.confianza).toBe("media");
  });

  it("se contradicen en el tipo → baja, con las opciones para elegir (el trifásico)", () => {
    const c = clasificarEgreso(gasto({ concepto: "INSTALACIÒN TRIFASICO", categoria: "SERVICIOS", grupoExcel: "SERVICIOS" }));
    expect(c.confianza).toBe("baja");
    expect(c.categoria).toBe("SERVICIOS"); // mientras tanto cuenta con lo guardado
    expect(c.sugerencias.sort()).toEqual(["REMODELACIÓN", "SERVICIOS"]);
  });

  it("registro a mano contra las reglas (Nómina guardada como insumo) → baja", () => {
    const c = clasificarEgreso(gasto({ concepto: "Nómina Editha", categoria: "INSUMOS", deExcel: false }));
    expect(c.confianza).toBe("baja");
    expect(c.sugerencias).toContain("PLANILLA");
  });

  it("una categoría que ya no está en la lista única → baja", () => {
    const c = clasificarEgreso(gasto({ concepto: "PRESTAMOS DINERS (KELLY TERRONES)", categoria: "PRESTAMOS SOCIO", grupoExcel: "PRESTAMOS SOCIO" }));
    expect(c.confianza).toBe("baja");
  });

  it("nadie sabe qué es → baja", () => {
    const c = clasificarEgreso(gasto({ concepto: "Por confirmar", categoria: "POR ACLARAR", deExcel: false }));
    expect(c).toMatchObject({ confianza: "baja", sugerencias: [] });
  });

  it("una regla que enseñó Jahnn manda sobre las demás, con confianza alta", () => {
    const aprendidas = [{ texto: "TAPA DE LOMO", categoria: "INSUMOS" }, { texto: "LOMO", categoria: "MARKETING" }];
    const c = clasificarEgreso(gasto({ concepto: "8.27 kg de tapa de lomo", categoria: "POR ACLARAR", deExcel: false }), aprendidas);
    expect(c).toMatchObject({ categoria: "INSUMOS", confianza: "alta" });
    expect(reglaAprendidaDe("8.27 kg de tapa de lomo", aprendidas)?.texto).toBe("TAPA DE LOMO");
  });
});

describe("reglas afinadas con los datos reales", () => {
  it("el proveedor entre paréntesis se reconoce", () => {
    const c = clasificarEgreso(gasto({ concepto: "VARIOS (METRO) [FA 753-0183345]", categoria: "INSUMOS", grupoExcel: "INSUMOS" }));
    expect(c.confianza).toBe("alta");
  });

  it("«LUIS PISCO» es una persona, no pisco: su caja chica no es insumo", () => {
    expect(clasificarGasto("CAJA CHICA #01 LUIS PISCO")).toBe("CAJA CHICA");
    expect(clasificarGasto("1 PISCO COMPRADO POR JORMAR")).toBe("INSUMOS");
  });

  it("el IR en cuotas es impuesto, no préstamo", () => {
    expect(clasificarGasto("IR JULIO 2026 – 2DA CUOTA SUNAT")).toBe("IMPUESTOS");
  });
});

describe("sello de confiabilidad", () => {
  it("cuenta la plata por nivel y el % seguro (alta + media), redondeado hacia abajo", () => {
    const q = calidadClasificacion([
      { monto: 900, confianza: "alta" }, { monto: 60, confianza: "media" }, { monto: 40, confianza: "baja" },
    ]);
    expect(q).toEqual({ total: 1000, alta: 900, media: 60, baja: 40, filasBaja: 1 });
    expect(porcentajeSeguro(q)).toBe(96);
    expect(porcentajeSeguro({ total: 0, alta: 0, media: 0, baja: 0, filasBaja: 0 })).toBeNull();
  });
});
