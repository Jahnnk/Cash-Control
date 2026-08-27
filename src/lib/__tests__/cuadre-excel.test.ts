/**
 * Tests del cuadre Excel ↔ sistema.
 *
 * El caso base es el real de Atelier en agosto: el Excel trae
 * S/47,642.34 de ingresos y S/31,666.38 de egresos, y el sistema tiene
 * además un alquiler compartido de S/1,800 que Kelly no lleva en su
 * archivo. Esa diferencia es correcta y hay que poder explicarla sin
 * escarbar la base de datos.
 */
import { describe, it, expect } from "vitest";
import { construirCuadre, resumenCuadre, motivoSoloSistema } from "../cuadre-excel";

const alquiler = {
  tipo: "egreso" as const,
  fecha: "2026-08-03",
  detalle: "Alquiler del mes",
  monto: 1800,
  motivo: "Gasto compartido entre sedes",
};

describe("el caso real de Atelier (agosto 2026)", () => {
  const cuadre = construirCuadre({
    excelIngresos: 47642.34,
    excelEgresos: 31666.38,
    movimientos: [alquiler],
  });

  it("anticipa el número exacto que va a mostrar la pantalla", () => {
    // 31,666.38 + 1,800 = 33,466.38, que es justo lo que Jahnn veía.
    expect(cuadre.esperado.egresos).toBe(33466.38);
    expect(cuadre.esperado.ingresos).toBe(47642.34);
  });

  it("no dice que cuadra cuando hay una diferencia", () => {
    expect(cuadre.cuadra).toBe(false);
  });

  it("explica la diferencia con su monto y su motivo, sin llamarla error", () => {
    const r = resumenCuadre(cuadre);
    expect(r).toContain("S/1800.00 de egresos");
    expect(r).toContain("1 movimiento");
    expect(r).toContain("No es un error");
  });
});

describe("cuando sí cuadra", () => {
  it("lo dice sin rodeos y no inventa diferencias", () => {
    const c = construirCuadre({ excelIngresos: 100, excelEgresos: 50, movimientos: [] });
    expect(c.cuadra).toBe(true);
    expect(c.esperado).toEqual({ ingresos: 100, egresos: 50 });
    expect(resumenCuadre(c)).toContain("exactamente lo mismo");
  });
});

describe("varios movimientos", () => {
  const c = construirCuadre({
    excelIngresos: 1000,
    excelEgresos: 500,
    movimientos: [
      alquiler,
      { tipo: "ingreso", fecha: "2026-08-10", detalle: "Cobro Fonavi", monto: 250, motivo: "Cobro a cliente B2B" },
      { tipo: "egreso", fecha: "2026-08-01", detalle: "Compra socio", monto: 300, motivo: "Pagado por el socio" },
    ],
  });

  it("suma cada lado por separado", () => {
    expect(c.soloSistema.egresos).toBe(2100);   // 1800 + 300
    expect(c.soloSistema.ingresos).toBe(250);
  });

  it("los ordena por fecha para poder buscarlos en el Excel", () => {
    expect(c.movimientos.map((m) => m.fecha)).toEqual(["2026-08-01", "2026-08-03", "2026-08-10"]);
  });

  it("nombra los dos lados en el resumen", () => {
    const r = resumenCuadre(c);
    expect(r).toContain("S/250.00 de ingresos");
    expect(r).toContain("S/2100.00 de egresos");
    expect(r).toContain("3 movimientos");
  });
});

describe("el motivo de cada movimiento", () => {
  it("reconoce los casos del negocio", () => {
    expect(motivoSoloSistema({ isShared: true })).toBe("Gasto compartido entre sedes");
    expect(motivoSoloSistema({ isSpecialLoan: true })).toBe("Préstamo del socio");
    expect(motivoSoloSistema({ paymentMethod: "socio" })).toBe("Pagado por el socio");
    expect(motivoSoloSistema({ paymentMethod: "pendiente_atelier" })).toBe("Espejo de gasto compartido");
    expect(motivoSoloSistema({ clientId: "abc" })).toBe("Cobro a cliente B2B");
    expect(motivoSoloSistema({ isFonaviReimbursement: true })).toBe("Reembolso de Fonavi");
  });

  it("lo compartido manda sobre lo demás: es lo que explica la diferencia", () => {
    expect(motivoSoloSistema({ isShared: true, paymentMethod: "socio" }))
      .toBe("Gasto compartido entre sedes");
  });

  it("sin ninguna marca, dice la verdad simple", () => {
    expect(motivoSoloSistema({})).toBe("Registrado a mano");
  });
});
