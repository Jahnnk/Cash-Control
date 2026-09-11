/**
 * UNA sola cifra de liquidez.
 *
 * El 10-sep-2026 el dashboard mostraba S/2,472.11 en un panel y
 * S/16,747.46 en otro, en la misma pantalla. Dos métodos distintos para
 * el mismo número. Estos tests fijan cuál manda y, sobre todo, fijan que
 * el sistema diga cuándo la cifra no es de fiar.
 */
import { describe, it, expect } from "vitest";
import {
  calcularLiquidez, DIAS_SALDO_FRESCO, DIAS_ARRASTRE_SOSPECHOSO,
  type EntradaSede,
} from "../liquidez";

const HOY = "2026-09-10";

const sede = (
  businessId: number, nombre: string,
  declarado: EntradaSede["declarado"], derivado: EntradaSede["derivado"],
): EntradaSede => ({ businessId, nombre, declarado, derivado });

describe("lo declarado manda sobre lo derivado", () => {
  it("si Jahnn registró el saldo, ese es el número", () => {
    // Él lo vio en la app del BCP. Ninguna estimación le gana a eso.
    const r = calcularLiquidez({
      todayISO: HOY,
      sedes: [sede(1, "Atelier",
        { banco: 5000, caja: 300, fecha: HOY },
        { banco: 8673.52, caja: -981.11, fechaAncla: "2026-08-10" })],
    });
    expect(r.sedes[0].origen).toBe("declarado");
    expect(r.sedes[0].banco).toBe(5000);
    expect(r.total).toBe(5300);
  });

  it("sin saldo declarado usa el arrastre y AVISA que es estimado", () => {
    const r = calcularLiquidez({
      todayISO: HOY,
      sedes: [sede(1, "Atelier", null, { banco: 8673.52, caja: -981.11, fechaAncla: "2026-08-10" })],
    });
    expect(r.sedes[0].origen).toBe("derivado");
    expect(r.sedes[0].avisos.some((a) => a.includes("estimado"))).toBe(true);
    expect(r.confiable).toBe(false);
  });

  it("sin ninguno de los dos no inventa un cero silencioso", () => {
    const r = calcularLiquidez({ todayISO: HOY, sedes: [sede(2, "Fonavi", null, null)] });
    expect(r.sedes[0].origen).toBe("ninguno");
    expect(r.sedes[0].avisos).toContain("no hay saldo registrado ni forma de estimarlo");
    expect(r.procedencia).toContain("el total está incompleto");
  });
});

describe("el caso real del 10-set-2026", () => {
  // Los tres anclajes reales, con sus problemas.
  const REAL = [
    sede(1, "Atelier", null, { banco: 8673.52, caja: -981.11, fechaAncla: "2026-08-10" }),
    sede(2, "Fonavi", null, { banco: 9185.03, caja: 6427.87, fechaAncla: "2026-08-31" }),
    sede(3, "Centro", null, { banco: -1111.09, caja: 2369.89, fechaAncla: "2026-02-28" }),
  ];

  it("banco + caja da S/24,564, no los S/16,747 que mostraba la tarjeta", () => {
    // La tarjeta decía "Banco + caja de las tres sedes" y mostraba solo
    // el banco. La caja eran otros S/7,816.
    const r = calcularLiquidez({ todayISO: HOY, sedes: REAL });
    expect(r.banco).toBeCloseTo(16747.46, 2);
    expect(r.caja).toBeCloseTo(7816.65, 2);
    expect(r.total).toBeCloseTo(24564.11, 2);
  });

  it("denuncia el banco negativo de Centro: es imposible", () => {
    const r = calcularLiquidez({ todayISO: HOY, sedes: REAL });
    const centro = r.sedes.find((s) => s.nombre === "Centro")!;
    expect(centro.avisos.some((a) => a.includes("banco sale en negativo"))).toBe(true);
  });

  it("denuncia la caja negativa de Atelier", () => {
    const r = calcularLiquidez({ todayISO: HOY, sedes: REAL });
    const at = r.sedes.find((s) => s.nombre === "Atelier")!;
    expect(at.avisos.some((a) => a.includes("caja sale en negativo"))).toBe(true);
  });

  it("avisa que Centro viene arrastrando siete meses de movimientos", () => {
    // Ancla S/0 del 28 de febrero, arrastrada por S/214,068 de entradas
    // y S/215,180 de salidas. Eso no es un dato: es la suma de todos los
    // errores de registro de siete meses.
    const r = calcularLiquidez({ todayISO: HOY, sedes: REAL });
    const centro = r.sedes.find((s) => s.nombre === "Centro")!;
    expect(centro.antiguedadDias).toBeGreaterThan(DIAS_ARRASTRE_SOSPECHOSO);
    expect(centro.avisos.some((a) => a.includes("no está verificado contra el banco"))).toBe(true);
  });

  it("con este estado, la cifra NO es confiable", () => {
    const r = calcularLiquidez({ todayISO: HOY, sedes: REAL });
    expect(r.confiable).toBe(false);
    expect(r.procedencia).toContain("registra los saldos");
  });
});

describe("cuándo sí es confiable", () => {
  it("las tres declaradas y frescas", () => {
    const r = calcularLiquidez({
      todayISO: HOY,
      sedes: [
        sede(1, "Atelier", { banco: 8500, caja: 1200, fecha: "2026-09-08" }, null),
        sede(2, "Fonavi", { banco: 9185, caja: 6428, fecha: "2026-09-08" }, null),
        sede(3, "Centro", { banco: 4000, caja: 2370, fecha: "2026-09-08" }, null),
      ],
    });
    expect(r.confiable).toBe(true);
    expect(r.procedencia).toContain("verificados contra el banco");
    expect(r.total).toBe(31683);
  });

  it("un saldo declarado viejo rompe la confianza y dice cuánto", () => {
    const r = calcularLiquidez({
      todayISO: HOY,
      sedes: [sede(1, "Atelier", { banco: 8500, caja: 1200, fecha: "2026-08-20" }, null)],
    });
    expect(r.confiable).toBe(false);
    expect(r.sedes[0].avisos[0]).toContain("hace 21 días");
    expect(21).toBeGreaterThan(DIAS_SALDO_FRESCO);
  });
});

describe("redacción", () => {
  it("enumera con comas, no con 'y' repetida", () => {
    const r = calcularLiquidez({
      todayISO: HOY,
      sedes: [
        sede(1, "Atelier", null, { banco: 100, caja: 0, fechaAncla: "2026-08-10" }),
        sede(2, "Fonavi", null, { banco: 100, caja: 0, fechaAncla: "2026-08-31" }),
        sede(3, "Centro", null, { banco: 100, caja: 0, fechaAncla: "2026-02-28" }),
      ],
    });
    expect(r.procedencia).toContain("Atelier, Fonavi y Centro");
    expect(r.procedencia).not.toContain("y Fonavi y");
  });
});

describe("el saldo que viene del Excel de Kelly", () => {
  // Jahnn (10-sep-2026): "no podemos basarnos en estimados, necesitamos
  // datos exactos". El dato exacto ya llegaba: Kelly copia la lectura
  // del BCP en su Excel para cuadrar su libro. El sistema sabía leerla
  // desde agosto y la tiraba después de mostrarla una vez.
  const conKelly = (descuadre: number | null) =>
    calcularLiquidez({
      todayISO: HOY,
      sedes: [
        sede(1, "Atelier", { banco: 14345.74, caja: 200, fecha: "2026-09-08", fuente: "excel-kelly", descuadreKelly: descuadre }, null),
        sede(2, "Fonavi", { banco: 15594.02, caja: 6427.87, fecha: "2026-09-08", fuente: "excel-kelly", descuadreKelly: null }, null),
        sede(3, "Centro", { banco: 1112.68, caja: 2369.89, fecha: "2026-09-08", fuente: "excel-kelly", descuadreKelly: null }, null),
      ],
    });

  it("cuenta como dato exacto, no como estimación", () => {
    const r = conKelly(null);
    expect(r.sedes.every((s) => s.origen === "declarado")).toBe(true);
    expect(r.confiable).toBe(true);
    expect(r.procedencia).toBe("Saldos leídos del banco en el Excel de Kelly.");
  });

  it("NO tapa lo que Kelly no logró cuadrar", () => {
    // Si su libro no cuaja con su banco, el saldo sirve para mirar pero
    // no para decidir al céntimo. Taparlo sería peor que el estimado.
    const r = conKelly(1752.3);
    const at = r.sedes.find((s) => s.nombre === "Atelier")!;
    expect(at.avisos.some((a) => a.includes("le falta cuadrar 1752.3"))).toBe(true);
    expect(r.confiable).toBe(false);
  });

  it("un descuadre de céntimos no molesta", () => {
    const r = conKelly(0.004);
    expect(r.confiable).toBe(true);
  });

  it("mezcla de fuentes: lo dice", () => {
    const r = calcularLiquidez({
      todayISO: HOY,
      sedes: [
        sede(1, "Atelier", { banco: 14345.74, caja: 200, fecha: "2026-09-08", fuente: "excel-kelly" }, null),
        sede(2, "Fonavi", { banco: 15594.02, caja: 6427.87, fecha: "2026-09-08", fuente: "dirección" }, null),
      ],
    });
    expect(r.procedencia).toContain("parte del Excel de Kelly, parte registrados por ti");
  });
});
