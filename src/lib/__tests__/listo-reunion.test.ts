/** La semana real del 11 al 17 de octubre de 2026, vista el lunes 19 (pedido de Jahnn). */
import { describe, it, expect } from "vitest";
import { semanaDeLaReunion } from "../kpis/semana-reunion";
import { listoParaLaReunion, type SedeEntrada, type DiaEntrada } from "../kpis/listo-reunion";
import { TODA_LA_SEMANA, LUNES_A_SABADO } from "../kpis/llenado";

describe("la semana de la reunión", () => {
  it("el lunes 19 la reunión mira del 11 al 17 (la última semana cerrada, no la que empieza)", () => {
    expect(semanaDeLaReunion("2026-10-19")).toEqual({ start: "2026-10-11", end: "2026-10-17" });
  });
  it("cualquier día de la semana en curso apunta a la última cerrada; el sábado todavía no cierra la suya", () => {
    expect(semanaDeLaReunion("2026-10-18")).toEqual({ start: "2026-10-11", end: "2026-10-17" }); // domingo: ya cerró
    expect(semanaDeLaReunion("2026-10-24")).toEqual({ start: "2026-10-11", end: "2026-10-17" }); // sábado: aún no cierra
    expect(semanaDeLaReunion("2026-10-25")).toEqual({ start: "2026-10-18", end: "2026-10-24" });
  });
});

const d = (fecha: string, venta: number | null, p: Partial<DiaEntrada> = {}): DiaEntrada => ({ fecha, venta, personas: venta ? 40 : null, nps: 9.5, mermas: 10, conTiempos: true, ...p });
const hoy = "2026-10-19";
const CARGAS_OK = (sabado: string) => ["ventas_mes", "rotacion", "cortesias", "ventas_trabajador"].map((clave) => ({ clave: clave as never, fecha: sabado }));

describe("¿llego con los datos completos?", () => {
  // Fonavi: NPS solo el 13; mermas faltan el 14 y el 16 (lo que había el 19-oct).
  const fonavi: SedeEntrada = {
    info: { businessId: 2, sede: "Fonavi", desde: null, esCafeteria: true, diasEsperados: TODA_LA_SEMANA },
    dias: [
      d("2026-10-11", 1027.8, { nps: null }), d("2026-10-12", 1383.6, { nps: null }), d("2026-10-13", 1393.42),
      d("2026-10-14", 1125.5, { nps: null, mermas: null }), d("2026-10-15", 1011.4, { nps: null }),
      d("2026-10-16", 1665.8, { nps: null, mermas: null }), d("2026-10-17", 751.6, { nps: null }),
    ],
    byte: [{ fecha: "2026-10-11", total: 1027.8 }, { fecha: "2026-10-14", total: 1125.5 }, { fecha: "2026-10-17", total: 751.6 }],
    byteHasta: "2026-10-18", cargas: [], excelHasta: "2026-10-13",
  };
  const r = listoParaLaReunion({ start: "2026-10-11", end: "2026-10-17", hoy, sedes: [fonavi] });
  const h = r.sedes[0].hallazgos;

  it("Fonavi: el NPS cargado en 1 de 7 días y las mermas de 2 días salen como pendientes, con sus fechas", () => {
    expect(h.find((x) => x.tema === "nps")).toMatchObject({ nivel: "falta", titulo: "NPS: 1 de 7 días" });
    expect(h.find((x) => x.tema === "nps")!.detalle).toContain("dom 11");
    expect(h.find((x) => x.tema === "mermas")!.detalle).toContain("mié 14");
    expect(h.find((x) => x.tema === "mermas")!.detalle).toContain("vie 16");
  });

  it("los archivos del sábado: sin subir es falta; subidos el 17 se dan por buenos", () => {
    expect(h.find((x) => x.tema === "archivos")).toBeDefined();
    const ok = listoParaLaReunion({ start: "2026-10-11", end: "2026-10-17", hoy, sedes: [{ ...fonavi, cargas: CARGAS_OK("2026-10-17") }] });
    expect(ok.sedes[0].hallazgos.find((x) => x.tema === "archivos")).toBeUndefined();
  });

  it("el Excel atrasado se dice, pero no impide llegar «listo» (Kelly entrega los viernes)", () => {
    expect(h.find((x) => x.tema === "excel")?.nivel).toBe("info");
    const perfecta: SedeEntrada = { ...fonavi, dias: fonavi.dias.map((x) => ({ ...x, nps: 9, mermas: 5 })), cargas: CARGAS_OK("2026-10-17") };
    const ok = listoParaLaReunion({ start: "2026-10-11", end: "2026-10-17", hoy, sedes: [perfecta] });
    expect(ok.listo).toBe(true);
    expect(ok.resumen).toBe("Llegas con los datos completos de las tres sedes.");
  });

  it("un día sin venta es falta; el domingo libre de Atelier no lo es", () => {
    const atelier: SedeEntrada = {
      info: { businessId: 1, sede: "Atelier", desde: null, esCafeteria: false, diasEsperados: LUNES_A_SABADO },
      dias: ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-17"].map((f) => d(f, 1500, { nps: null })), // falta el 16
      byte: [], byteHasta: "2026-10-17", cargas: CARGAS_OK("2026-10-17"), excelHasta: null,
    };
    const x = listoParaLaReunion({ start: "2026-10-11", end: "2026-10-17", hoy, sedes: [atelier] }).sedes[0].hallazgos.find((y) => y.tema === "ventas");
    expect(x?.detalle).toContain("vie 16");
    expect(x?.detalle).not.toContain("dom 11");
  });

  it("el reporte de Byte atrasado respecto del último día cerrado es falta", () => {
    const x = listoParaLaReunion({ start: "2026-10-11", end: "2026-10-17", hoy, sedes: [{ ...fonavi, byteHasta: "2026-09-30" }] }).sedes[0].hallazgos.find((y) => y.tema === "byte");
    expect(x?.nivel).toBe("falta");
    expect(x?.detalle).toContain("30/09");
  });

  it("lo que tecleó el administrador contra Byte: Centro 15 y 16 de octubre, Atelier sábado 17", () => {
    const centro: SedeEntrada = {
      info: { businessId: 3, sede: "Centro", desde: null, esCafeteria: true, diasEsperados: TODA_LA_SEMANA },
      dias: [d("2026-10-15", 1130.4), d("2026-10-16", 2067.8), d("2026-10-17", 1167.4)],
      byte: [{ fecha: "2026-10-15", total: 1998.32 }, { fecha: "2026-10-16", total: 1283.22 }, { fecha: "2026-10-17", total: 1167.4 }],
      byteHasta: "2026-10-18", cargas: CARGAS_OK("2026-10-17"), excelHasta: null,
    };
    const x = listoParaLaReunion({ start: "2026-10-15", end: "2026-10-17", hoy, sedes: [centro] }).sedes[0].hallazgos.find((y) => y.tema === "panel-vs-byte");
    expect(x?.nivel).toBe("aviso");
    expect(x?.titulo).toBe("El panel no coincide con Byte en 2 días");
    expect(x?.detalle).toContain("panel S/1,130, Byte S/1,998");
    expect(x?.detalle).not.toContain("sáb 17");
  });
});
