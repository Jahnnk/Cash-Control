import { describe, expect, it } from "vitest";
import { avanceChecklist, CHECKLIST, lunesDe, mayoresCambios, ritmoVentas, semaforoCobros, semanaEnRevision, variacion, type EstadoMes } from "./control-mensual";

describe("revisión semanal", () => {
  it("el lunes se revisa la semana completa anterior", () => {
    expect(lunesDe("2026-10-06")).toBe("2026-10-05"); // martes → lunes 5
    expect(semanaEnRevision("2026-10-05")).toEqual({ desde: "2026-09-28", hasta: "2026-10-04" });
    expect(semanaEnRevision("2026-10-11")).toEqual({ desde: "2026-09-28", hasta: "2026-10-04" }); // domingo
  });

  it("ritmo de ventas contra la meta del presupuesto (o el punto de equilibrio)", () => {
    const r = ritmoVentas({ ventasMes: 12000, ventasSemana: 8400, diasConDatos: 10, diasDelMes: 31, ventaEsperada: 37500, pe: 30000 });
    expect(r.proyeccion).toBe(37200);
    expect(r.metaEs).toBe("presupuesto");
    expect(r.semaforo).toBe("ambar"); // bajo la meta, sobre el equilibrio
    expect(r.falta).toBe(25500);
    expect(r.porDia).toBeCloseTo(1214.29, 1);
    expect(ritmoVentas({ ventasMes: 8000, ventasSemana: 0, diasConDatos: 10, diasDelMes: 31, ventaEsperada: null, pe: 30000 }).semaforo).toBe("rojo");
    expect(ritmoVentas({ ventasMes: 0, ventasSemana: 0, diasConDatos: 0, diasDelMes: 31, ventaEsperada: null, pe: null }).semaforo).toBe("gris");
    // Con 3 días del mes manda el ritmo de la última semana completa.
    const inicio = ritmoVentas({ ventasMes: 2401, ventasSemana: 8400, diasConDatos: 3, diasDelMes: 31, ventaEsperada: 38500, pe: 36000 });
    expect(inicio.proyeccionEs).toBe("semana");
    expect(inicio.proyeccion).toBe(37200);
    expect(inicio.semaforo).toBe("ambar");
  });

  it("cobros: sin carga reciente no hay semáforo", () => {
    expect(semaforoCobros({ porCobrar: 6203, atrasado: 5000, diasDesdeCarga: 57 })).toBe("gris");
    expect(semaforoCobros({ porCobrar: 3000, atrasado: 0, diasDesdeCarga: 2 })).toBe("verde");
    expect(semaforoCobros({ porCobrar: 3000, atrasado: 2000, diasDesdeCarga: 2 })).toBe("rojo");
  });
});

describe("cierre de mes y checklist", () => {
  const base: EstadoMes = { sedesConVentas: 3, sedesConExcelCompleto: 3, sedesConResultado: 3, porAclarar: 0, sedesPresupuestoSiguienteAprobado: 1, sedesMetaSiguiente: 3, totalSedes: 3 };
  it("12 puntos; el sistema solo dice si los datos están listos", () => {
    expect(CHECKLIST).toHaveLength(12);
    const gastos = CHECKLIST.find((i) => i.id === "gastos")!.datos!;
    expect(gastos(base).listo).toBe(true);
    expect(gastos({ ...base, porAclarar: 182 }).detalle).toContain("POR ACLARAR");
    expect(CHECKLIST.find((i) => i.id === "proyeccion")!.datos!(base)).toEqual({ listo: false, detalle: "Falta en 2 de 3 sedes" });
    expect(avanceChecklist(new Set(["ventas", "flujo", "otro"]))).toEqual({ hechos: 2, total: 12 });
  });
  it("variación y mayores cambios", () => {
    expect(variacion(110, 100)).toEqual({ actual: 110, anterior: 100, diferencia: 10, pct: 10 });
    expect(mayoresCambios({ INSUMOS: 5000, PLANILLA: 10000 }, { INSUMOS: 3000, PLANILLA: 10100, ALQUILER: 900 }).map((x) => x.categoria)).toEqual(["INSUMOS", "ALQUILER", "PLANILLA"]);
  });
});
