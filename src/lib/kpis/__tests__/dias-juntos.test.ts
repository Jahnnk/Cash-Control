/**
 * Días que Byte junta en uno (Fonavi, 3 y 4 de octubre de 2026: nadie abrió la
 * caja el domingo y Byte dijo S/1,664.30 el sábado 03 y nada el domingo 04).
 * Regla pura + cargador con base de datos falsa + puente de verificación.
 */
import { describe, it, expect } from "vitest";
import { resolverVentasPorDia, sumarDias, type FuentesDia } from "../venta-del-dia";
import { loadVentaRowsBlended } from "../ventas-loader";
import { verificarVentas } from "../../verificacion-kelly";

const r = (date: string, total: number) => ({ date, total });
const vacio: FuentesDia = { byte: [], kelly: [], registro: [] };

describe("resolverVentasPorDia: días juntos", () => {
  it("caso real: Byte junta sábado y domingo y el administrador los separa", () => {
    const { dias, avisos } = resolverVentasPorDia({
      byte: [r("2026-10-02", 1552.1), r("2026-10-03", 1664.3)],
      kelly: [],
      registro: [r("2026-10-02", 1552.1), r("2026-10-03", 900.5), r("2026-10-04", 763.8)],
    });
    expect(dias.get("2026-10-02")).toMatchObject({ total: 1552.1, motivo: "coinciden" });
    expect(dias.get("2026-10-03")).toEqual({ total: 900.5, fuente: "admin", motivo: "dias-juntos" });
    expect(dias.get("2026-10-04")).toEqual({ total: 763.8, fuente: "admin", motivo: "dias-juntos" });
    expect(avisos).toEqual([]);
  });

  it("la suma de los dos días reproduce el total de Byte (no se cuenta el domingo dos veces)", () => {
    const { dias } = resolverVentasPorDia({
      byte: [r("2026-10-03", 1664.3)], kelly: [],
      registro: [r("2026-10-03", 900.5), r("2026-10-04", 763.8)],
    });
    const total = [...dias.values()].reduce((s, x) => s + x.total, 0);
    expect(total).toBeCloseTo(1664.3, 2);
  });

  it("el Excel (copia de Byte) también cuenta como la cifra de Byte", () => {
    const { dias } = resolverVentasPorDia({
      byte: [], kelly: [r("2026-10-03", 1664.3)],
      registro: [r("2026-10-03", 900.5), r("2026-10-04", 763.8)],
    });
    expect(dias.get("2026-10-04")?.motivo).toBe("dias-juntos");
  });

  it("si la suma no cuadra, no adivina: queda Byte y se avisa", () => {
    const { dias, avisos } = resolverVentasPorDia({
      byte: [r("2026-10-03", 1664.3), r("2026-10-06", 1300)], kelly: [],
      registro: [r("2026-10-03", 900.5), r("2026-10-04", 500)],
    });
    expect(dias.get("2026-10-03")).toMatchObject({ total: 1664.3, fuente: "byte" });
    expect(dias.get("2026-10-04")).toMatchObject({ total: 500, motivo: "unica" });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ fecha: "2026-10-03", byte: 1664.3 });
  });

  it("no avisa si Byte aún no llegó a los días siguientes (no hay Byte posterior)", () => {
    const { avisos } = resolverVentasPorDia({
      byte: [r("2026-10-03", 1664.3)], kelly: [],
      registro: [r("2026-10-03", 900.5), r("2026-10-04", 500)],
    });
    expect(avisos).toEqual([]);
  });

  it("si el administrador del día ya coincide con Byte, no hay nada que separar", () => {
    const { dias } = resolverVentasPorDia({
      byte: [r("2026-10-03", 1500)], kelly: [],
      registro: [r("2026-10-03", 1501), r("2026-10-04", 700)],
    });
    expect(dias.get("2026-10-03")).toMatchObject({ total: 1500, motivo: "coinciden" });
    expect(dias.get("2026-10-04")).toMatchObject({ total: 700, motivo: "unica" });
  });

  it("si Byte sí tiene el día siguiente, no son días juntos", () => {
    const { dias } = resolverVentasPorDia({
      byte: [r("2026-10-03", 1664.3), r("2026-10-04", 763.8)], kelly: [],
      registro: [r("2026-10-03", 900.5), r("2026-10-04", 763.8)],
    });
    expect(dias.get("2026-10-03")?.motivo).toBe("sin-desempate");
    expect(dias.get("2026-10-04")?.motivo).toBe("coinciden");
  });

  it("puede juntar hasta tres días siguientes", () => {
    const { dias } = resolverVentasPorDia({
      byte: [r("2026-10-03", 3000)], kelly: [],
      registro: [r("2026-10-03", 800), r("2026-10-04", 700), r("2026-10-05", 900), r("2026-10-06", 600)],
    });
    for (const d of ["03", "04", "05", "06"]) expect(dias.get(`2026-10-${d}`)?.motivo).toBe("dias-juntos");
  });

  it("falta el registro de un día intermedio: no se junta", () => {
    const { dias } = resolverVentasPorDia({
      byte: [r("2026-10-03", 1664.3)], kelly: [],
      registro: [r("2026-10-03", 900.5), r("2026-10-05", 763.8)],
    });
    expect(dias.get("2026-10-03")).toMatchObject({ total: 1664.3, motivo: "sin-desempate" });
  });

  it("sin días juntos, funciona igual que la regla de dos de tres", () => {
    const { dias } = resolverVentasPorDia({
      byte: [r("2026-08-30", 102.1)], kelly: [r("2026-08-30", 899.6)], registro: [r("2026-08-30", 899.6)],
    });
    expect(dias.get("2026-08-30")).toEqual({ total: 899.6, fuente: "excel", motivo: "admin-confirma-excel" });
  });

  it("los días de `despues` ayudan a decidir pero no salen en el resultado", () => {
    const { dias } = resolverVentasPorDia(
      { byte: [r("2026-10-03", 1664.3)], kelly: [], registro: [r("2026-10-03", 900.5)] },
      { byte: [], kelly: [], registro: [r("2026-10-04", 763.8)] },
    );
    expect(dias.get("2026-10-03")).toEqual({ total: 900.5, fuente: "admin", motivo: "dias-juntos" });
    expect(dias.has("2026-10-04")).toBe(false);
  });

  it("sumarDias cruza fin de mes y de año", () => {
    expect(sumarDias("2026-09-30", 3)).toBe("2026-10-03");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("sin datos no inventa nada", () => {
    expect(resolverVentasPorDia(vacio).dias.size).toBe(0);
  });
});

describe("cargador de ventas: la semana del deck termina el sábado, el domingo queda fuera", () => {
  // Base falsa: devuelve las filas pedidas dentro del rango BETWEEN que usa cada consulta.
  const filas = {
    byte: [r("2026-10-02", 1552.1), r("2026-10-03", 1664.3)],
    registro: [r("2026-10-02", 1552.1), r("2026-10-03", 900.5), r("2026-10-04", 763.8)],
  };
  const sql = (strings: TemplateStringsArray, ...v: unknown[]) => {
    const t = strings.join(" ");
    const [, from, to] = v as [number, string, string];
    const dentro = (xs: { date: string; total: number }[]) => xs.filter((x) => x.date >= from && x.date <= to);
    const out = t.includes("FROM byte_ventas_efectiva") ? dentro(filas.byte)
      : t.includes("FROM upselling_daily") ? dentro(filas.registro)
      : [];
    return Promise.resolve(out);
  };

  it("deck de la semana 27-sep a 03-oct: el sábado es lo del administrador, no los S/1,664.30", async () => {
    const { rows } = await loadVentaRowsBlended(sql as never, 2, "2026-09-27", "2026-10-03");
    expect(rows.find((x) => x.date === "2026-10-03")?.total).toBe(900.5);
    expect(rows.some((x) => x.date === "2026-10-04")).toBe(false);
  });

  it("semana siguiente (desde el 04): el domingo tiene su venta", async () => {
    const { rows } = await loadVentaRowsBlended(sql as never, 2, "2026-10-04", "2026-10-10");
    expect(rows).toEqual([{ date: "2026-10-04", total: 763.8 }]);
  });

  it("el mes completo suma lo que dice Byte, ni más ni menos", async () => {
    const { rows } = await loadVentaRowsBlended(sql as never, 2, "2026-10-01", "2026-10-31");
    expect(rows.reduce((s, x) => s + x.total, 0)).toBeCloseTo(1552.1 + 1664.3, 2);
  });
});

describe("verificación contra el Excel: días que Byte junta", () => {
  it("lo explica en el puente y no lo marca como error", () => {
    const v = verificarVentas({
      byte: [r("2026-10-03", 1664.3)], kelly: [r("2026-10-03", 1664.3)],
      registro: [r("2026-10-03", 900.5), r("2026-10-04", 763.8)],
    })!;
    expect(v.sistema).toBeCloseTo(1664.3, 2);
    expect(v.puente.some((l) => /Byte junta en uno/i.test(l.etiqueta))).toBe(true);
    expect(v.alertas).toEqual([]);
  });

  it("si no suman, alerta con las cifras", () => {
    const v = verificarVentas({
      byte: [r("2026-10-03", 1664.3), r("2026-10-06", 1300)], kelly: [],
      registro: [r("2026-10-03", 900.5), r("2026-10-04", 500)],
    })!;
    expect(v.alertas.some((a) => /juntado días/i.test(a.titulo))).toBe(true);
  });
});
