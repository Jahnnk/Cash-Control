import { describe, expect, it } from "vitest";
import { detectarPatrones, liquidezContraCompromisos, proyectarRecurrentes, tramoDe, type Pago } from "./compromisos";

const meses = ["2026-07", "2026-08", "2026-09"];
// Fonavi, con los nombres cambiando cada mes como en el Excel real.
const pagos: Pago[] = [
  ...meses.flatMap((m) => [
    { fecha: `${m}-${m === "2026-07" ? "31" : "30"}`, monto: 10000, categoria: "PLANILLA" },
    { fecha: `${m}-08`, monto: 411, categoria: "PRÉSTAMOS Y TARJETAS" },
    { fecha: `${m}-16`, monto: 750, categoria: "PRÉSTAMOS Y TARJETAS" },
    { fecha: `${m}-30`, monto: 900, categoria: "ALQUILER" },
  ]),
  { fecha: "2026-08-11", monto: 74, categoria: "PLANILLA" }, // bono suelto: un solo mes
  { fecha: "2026-09-04", monto: 150, categoria: "CONTABILIDAD Y ASESORÍAS" }, // un solo mes
  { fecha: "2026-09-05", monto: 3000, categoria: "INSUMOS" }, // no es un compromiso fijo
];

describe("compromisos", () => {
  it("detecta por categoría y tramo del mes, no por nombre", () => {
    const p = detectarPatrones(pagos, meses);
    expect(p.map((x) => `${x.categoria}|${x.tramo}|${x.dia}`).sort()).toEqual([
      "ALQUILER|4|30", "PLANILLA|4|30", "PRÉSTAMOS Y TARJETAS|2|8", "PRÉSTAMOS Y TARJETAS|3|16",
    ]);
    const prestamos = p.filter((x) => x.categoria === "PRÉSTAMOS Y TARJETAS");
    expect(prestamos.reduce((t, x) => t + x.participacion, 0)).toBeCloseTo(1);
    expect(tramoDe(22)).toBe(4);
  });

  it("proyecta lo que viene con el presupuesto aprobado y descuenta lo ya pagado", () => {
    const patrones = detectarPatrones(pagos, meses);
    const c = proyectarRecurrentes({
      patrones, desde: "2026-10-02", hasta: "2026-10-20",
      presupuestoMes: (cat) => (cat === "PRÉSTAMOS Y TARJETAS" ? 1814 : null),
      pagado: [{ fecha: "2026-10-08", monto: 411, categoria: "PRÉSTAMOS Y TARJETAS" }],
      ignorados: new Set(),
    });
    // Tramo 2 (día 8): esperado 1814 × 411/1161 ≈ 642 − 411 pagado ≈ 231; tramo 3 (día 16): 1814 × 750/1161 ≈ 1172.
    expect(c.map((x) => x.fecha)).toEqual(["2026-10-08", "2026-10-16"]);
    expect(c[0].monto).toBeCloseTo(231.2, 0);
    expect(c[1].monto).toBeCloseTo(1171.8, 0);
    // Planilla y alquiler (día 30) quedan fuera de la ventana.
    expect(c.some((x) => x.categoria === "PLANILLA")).toBe(false);
  });

  it("cruza al mes siguiente y respeta los descartados", () => {
    const patrones = detectarPatrones(pagos, meses);
    const c = proyectarRecurrentes({
      patrones, desde: "2026-10-25", hasta: "2026-11-09", presupuestoMes: () => null, pagado: [],
      ignorados: new Set(["ALQUILER|4|2026-10"]),
    });
    expect(c.map((x) => `${x.fecha} ${x.categoria}`)).toEqual([
      "2026-10-30 PLANILLA", "2026-11-08 PRÉSTAMOS Y TARJETAS",
    ]);
    expect(c[0].monto).toBe(10000);
  });

  it("semáforo: rojo si ni con lo que entra alcanza; ámbar si el saldo no cubre la semana", () => {
    const comp = [
      { fecha: "2026-10-08", concepto: "a", monto: 3000, origen: "recurrente" as const },
      { fecha: "2026-10-16", concepto: "b", monto: 9000, origen: "recurrente" as const },
    ];
    expect(liquidezContraCompromisos(5000, 10000, comp, "2026-10-06").semaforo).toBe("verde");
    expect(liquidezContraCompromisos(2000, 12000, comp, "2026-10-06").semaforo).toBe("ambar");
    const rojo = liquidezContraCompromisos(1000, 5000, comp, "2026-10-06");
    expect(rojo.semaforo).toBe("rojo");
    expect(rojo.libre14).toBe(-6000);
  });
});
