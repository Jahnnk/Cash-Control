import { describe, expect, it } from "vitest";
import { armarFinanciamientos, cuotaMensualTotal, type Financiamiento, type PagoDeuda } from "../financiamientos";

const base = { acreedor: null, montoOriginal: null, cuotasTotal: null, incluyeIntereses: null, desde: null } as const;
const diners: Financiamiento = { ...base, id: 1, businessId: 1, sede: "Atelier", nombre: "Préstamo Diners", patron: "diners", diaPago: 8, cuota: 1595.89 };
const antigua: Financiamiento = { ...base, id: 2, businessId: 1, sede: "Atelier", nombre: "Deuda antigua", patron: null, diaPago: 16, cuota: 750 };
const p = (fecha: string, monto: number, concepto: string, businessId = 1): PagoDeuda => ({ fecha, monto, concepto, businessId });

describe("financiamientos", () => {
  it("reconoce el pago por el nombre y, si no lo dice, por el día y el monto de la cuota", () => {
    const r = armarFinanciamientos([diners, antigua], [
      p("2026-06-08", 1595.89, "Préstamo diners"),
      p("2026-09-08", 1595.89, "CUOTA SET 2026 (KELLY TERRONES)"), // sin la palabra: gana el día 8 y el monto
      p("2026-09-17", 750, "PRESTAMOS ANTIGUO (KELLY TERRONES)"),
    ]);
    expect(r.deudas[0]).toMatchObject({ pagado: 3191.78, cuotasPagadas: 2 });
    expect(r.deudas[1]).toMatchObject({ pagado: 750, cuotasPagadas: 1 });
    expect(r.sinDeuda).toHaveLength(0);
  });
  it("un pago de otra sede o que no encaja queda sin deuda", () => {
    const r = armarFinanciamientos([diners], [p("2026-06-08", 411.6, "Préstamo diners", 2), p("2026-06-25", 90, "otro")]);
    expect(r.deudas[0].pagado).toBe(0);
    expect(r.sinDeuda).toHaveLength(2);
  });
  it("sin datos del préstamo no inventa saldo y dice qué falta", () => {
    const [d] = armarFinanciamientos([diners], [p("2026-06-08", 1595.89, "diners")]).deudas;
    expect(d.saldo).toBeNull();
    expect(d.cuotasFaltan).toBeNull();
    expect(d.faltaDato).toEqual(["monto original", "número de cuotas", "si la cuota trae intereses"]);
  });
  it("con monto y cuotas calcula lo que falta, y saldado cuando se pagó todo", () => {
    const conDatos = { ...diners, montoOriginal: 6000, cuotasTotal: 4 };
    const pagos = ["2026-06-08", "2026-07-08", "2026-08-08"].map((f) => p(f, 1500, "diners"));
    const [d] = armarFinanciamientos([conDatos], pagos).deudas;
    expect(d).toMatchObject({ saldo: 1500, cuotasFaltan: 1, saldado: false });
    const [fin] = armarFinanciamientos([conDatos], [...pagos, p("2026-09-08", 1500, "diners")]).deudas;
    expect(fin).toMatchObject({ saldo: 0, saldado: true });
  });
  it("la cuota mensual suma solo las deudas vivas", () => {
    const { deudas } = armarFinanciamientos([diners, { ...antigua, montoOriginal: 750 }], [p("2026-09-17", 750, "x")]);
    expect(cuotaMensualTotal(deudas)).toBe(1595.89);
  });
});
