import { describe, expect, test } from "vitest";
import { ventasAlDia, type SedeVentasEntrada } from "./ventas-al-dia";

const base = (o: Partial<SedeVentasEntrada>): SedeVentasEntrada => ({
  businessId: 3, sede: "Centro", diasEsperados: [0, 1, 2, 3, 4, 5, 6], diasPausados: [], admin: [], byte: [], byteHasta: null, ...o,
});
const dias = (xs: [string, number][]) => xs.map(([fecha, total]) => ({ fecha, total }));

describe("ventas al día · lo que anotan los administradores contra Byte", () => {
  test("suma lo anotado, dice hasta cuándo y cuadra con Byte", () => {
    const r = ventasAlDia({ mes: "2026-10", hoy: "2026-10-19", sedes: [base({
      admin: dias([["2026-10-16", 1000], ["2026-10-17", 500], ["2026-10-18", 700]]),
      byte: dias([["2026-10-16", 1000], ["2026-10-17", 500], ["2026-10-18", 703]]), byteHasta: "2026-10-18",
    })] });
    const s = r.sedes[0];
    expect(s.anotado).toBe(2200);
    expect(s.hasta).toBe("2026-10-18");
    expect(s.byteMismosDias).toBe(2203);
    expect(s.diferencia).toBe(-3);
    expect(s.estado).toBe("cuadra");
  });

  test("días que Byte repartió distinto pero que juntos coinciden (caja sin abrir) no son error del administrador", () => {
    const s = ventasAlDia({ mes: "2026-10", hoy: "2026-10-19", sedes: [base({
      admin: dias([["2026-10-15", 1130.4], ["2026-10-16", 2067.8]]),
      byte: dias([["2026-10-15", 1998.32], ["2026-10-16", 1283.22]]), byteHasta: "2026-10-18",
    })] }).sedes[0];
    expect(s.repartoDistinto).toEqual([["2026-10-15", "2026-10-16"]]);
    expect(s.sueltos).toEqual([]);
    expect(s.estado).toBe("cuadra");
  });

  test("un día suelto que no coincide hay que revisarlo", () => {
    const s = ventasAlDia({ mes: "2026-10", hoy: "2026-10-19", sedes: [base({
      admin: dias([["2026-10-17", 1210]]), byte: dias([["2026-10-17", 667]]), byteHasta: "2026-10-18",
    })] }).sedes[0];
    expect(s.sueltos).toEqual(["2026-10-17"]);
    expect(s.estado).toBe("revisar");
  });

  test("los días después de lo que cubre Byte no se comparan todavía", () => {
    const s = ventasAlDia({ mes: "2026-10", hoy: "2026-10-19", sedes: [base({
      admin: dias([["2026-10-17", 500], ["2026-10-18", 600]]), byte: dias([["2026-10-17", 500]]), byteHasta: "2026-10-17",
    })] }).sedes[0];
    expect(s.anotado).toBe(1100);
    expect(s.byteMismosDias).toBe(500);
    expect(s.diferencia).toBe(0);
    expect(s.estado).toBe("cuadra");
  });

  test("faltan: los días esperados hasta ayer sin anotar; los domingos de Atelier y los días pausados no se reclaman", () => {
    const s = ventasAlDia({ mes: "2026-10", hoy: "2026-10-19", sedes: [base({
      businessId: 1, sede: "Atelier", diasEsperados: [1, 2, 3, 4, 5, 6], diasPausados: ["2026-10-17"],
      admin: dias([["2026-10-14", 100], ["2026-10-15", 100], ["2026-10-16", 100]]),
    })] }).sedes[0];
    // del 1 al 18: faltan los días de lunes a sábado sin anotar, salvo el 17 (pausado) y el domingo 18
    expect(s.faltan).not.toContain("2026-10-18");
    expect(s.faltan).not.toContain("2026-10-17");
    expect(s.faltan).toContain("2026-10-13");
    expect(s.faltan).not.toContain("2026-10-11"); // domingo
  });

  test("un día en que Byte vendió y el administrador no anotó va a «faltan»; un día sin venta en Byte no se reclama", () => {
    const s = ventasAlDia({ mes: "2026-10", hoy: "2026-10-19", sedes: [base({
      admin: dias([["2026-10-16", 500]]), byte: dias([["2026-10-16", 500], ["2026-10-18", 435]]), byteHasta: "2026-10-18",
    })] }).sedes[0];
    expect(s.faltan).toContain("2026-10-18");
    expect(s.sueltos).not.toContain("2026-10-18");
    expect(s.faltan).not.toContain("2026-10-17"); // Byte cubre el 17 y no vendió nada
  });

  test("el total del grupo suma las tres sedes", () => {
    const r = ventasAlDia({ mes: "2026-10", hoy: "2026-10-19", sedes: [
      base({ businessId: 2, sede: "Fonavi", admin: dias([["2026-10-17", 100]]), byte: dias([["2026-10-17", 100]]), byteHasta: "2026-10-18" }),
      base({ businessId: 3, sede: "Centro", admin: dias([["2026-10-17", 250]]), byte: dias([["2026-10-17", 250]]), byteHasta: "2026-10-18" }),
    ] });
    expect(r.grupo).toEqual({ anotado: 350, byteMismosDias: 350, diferencia: 0 });
  });

  test("sin nada anotado: sin-dato", () => {
    expect(ventasAlDia({ mes: "2026-10", hoy: "2026-10-19", sedes: [base({})] }).sedes[0].estado).toBe("sin-dato");
  });
});
