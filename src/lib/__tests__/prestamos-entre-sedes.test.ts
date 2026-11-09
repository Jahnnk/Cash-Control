import { describe, expect, it } from "vitest";
import { armarPrestamosEntreSedes } from "../prestamos-entre-sedes";

const centro = { prestamistaId: 3, prestamista: "Centro", fecha: "2026-08-11", monto: 6000 };
const fonavi = { prestamistaId: 2, prestamista: "Fonavi", fecha: "2026-08-11", monto: 5000 };
const cuotasCentro = ["2026-08-31", "2026-09-30", "2026-10-31"].map((fecha) => ({ prestamistaId: 3, fecha, monto: 1200 }));
const cuotasFonavi = ["2026-08-31", "2026-09-30", "2026-10-31"].map((fecha) => ({ prestamistaId: 2, fecha, monto: 1000 }));

describe("préstamos entre sedes", () => {
  it("con 3 de 5 cuotas pagadas, falta lo que dicen los números de Jahnn", () => {
    const [c, f] = armarPrestamosEntreSedes([centro, fonavi], [...cuotasCentro, ...cuotasFonavi]);
    expect(f).toMatchObject({ prestamista: "Fonavi", devuelto: 3000, pendiente: 2000, cuotasPagadas: 3, cuotasTotal: 5, cuotasFaltan: 2, proxima: "2026-11-30" });
    expect(c).toMatchObject({ prestamista: "Centro", devuelto: 3600, pendiente: 2400, cuota: 1200, cuotasFaltan: 2 });
  });
  it("sin cuotas todavía, todo está pendiente y no inventa calendario", () => {
    const [c] = armarPrestamosEntreSedes([centro], []);
    expect(c).toMatchObject({ pendiente: 6000, cuota: null, cuotasTotal: null, cuotasFaltan: null, proxima: null, saldado: false });
  });
  it("saldado cuando se devolvió todo", () => {
    const todas = [...cuotasCentro, ...["2026-11-30", "2026-12-31"].map((fecha) => ({ prestamistaId: 3, fecha, monto: 1200 }))];
    const [c] = armarPrestamosEntreSedes([centro], todas);
    expect(c).toMatchObject({ pendiente: 0, saldado: true, cuotasFaltan: 0, proxima: null });
  });
  it("no mezcla las cuotas de otra sede", () => {
    const [c] = armarPrestamosEntreSedes([centro], cuotasFonavi);
    expect(c.devuelto).toBe(0);
  });
  it("diciembre pasa a enero del año siguiente", () => {
    const [c] = armarPrestamosEntreSedes([centro], [{ prestamistaId: 3, fecha: "2026-12-31", monto: 1200 }].map((x) => ({ ...x, fecha: "2026-12-31" })));
    expect(c.proxima).toBe("2027-01-31");
  });
});
