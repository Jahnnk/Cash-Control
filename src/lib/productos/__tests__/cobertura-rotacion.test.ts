/**
 * La grilla de cargas y el aviso de "qué hará este archivo", con los casos
 * reales de Fonavi (set 2026): agosto subido por la sede hasta el 29, julio
 * declarado completo pero parcial, setiembre en curso.
 */
import { describe, it, expect } from "vitest";
import { celdaCobertura, queHaraLaCarga, sedeDelNombre, periodosEfectivos, marcarSospechosas, type PeriodoCargado } from "../cobertura-rotacion";

const p = (o: Partial<PeriodoCargado>): PeriodoCargado => ({
  businessId: 2, month: "2026-08", origen: "sede", desde: "2026-08-01", hasta: "2026-08-29", ventas: 36844.8, cargadoEl: null, ...o,
});

describe("la celda de la grilla", () => {
  it("agosto hasta el 29: parcial, y dice qué días faltan", () => {
    expect(celdaCobertura([p({})], "2026-08", "2026-09-22")).toMatchObject({
      estado: "parcial", diasCubiertos: 29, diasMes: 31, quien: "sede", faltan: "30 y 31 ago",
    });
  });

  it("el mes completo sale completo", () => {
    expect(celdaCobertura([p({ hasta: "2026-08-31" })], "2026-08", "2026-09-22").estado).toBe("completo");
  });

  it("el mes en curso está al día si cubre hasta hace 2 días", () => {
    const c = celdaCobertura([p({ month: "2026-09", desde: "2026-09-01", hasta: "2026-09-20", ventas: 24000 })], "2026-09", "2026-09-22");
    expect(c.estado).toBe("en-curso");
  });

  it("sin cargas, vacío", () => {
    expect(celdaCobertura([], "2026-06", "2026-09-22").estado).toBe("vacio");
  });

  it("dirección gana donde se pisan: los números son los suyos", () => {
    const ps = [p({}), p({ origen: "direccion", hasta: "2026-08-31", ventas: 39298.2 })];
    expect(periodosEfectivos(ps).map((x) => x.origen)).toEqual(["direccion"]);
    expect(celdaCobertura(ps, "2026-08", "2026-09-22")).toMatchObject({ estado: "completo", ventas: 39298.2, quien: "ambos" });
  });

  it("semanas sueltas de la sede se suman sin pisarse", () => {
    const ps = [
      p({ month: "2026-09", desde: "2026-09-01", hasta: "2026-09-07", ventas: 8000 }),
      p({ month: "2026-09", desde: "2026-09-08", hasta: "2026-09-14", ventas: 8200 }),
    ];
    expect(celdaCobertura(ps, "2026-09", "2026-09-30")).toMatchObject({ diasCubiertos: 14, ventas: 16200, faltan: "15 al 29 set" });
  });
});

describe("qué hará el archivo antes de subirlo", () => {
  const agosto = { businessId: 2, month: "2026-08", desde: "2026-08-01", hasta: "2026-08-31", total: 39298.2 };

  it("si la sede ya subió esos días, se comparan y manda el tuyo", () => {
    const q = queHaraLaCarga(agosto, [p({})]);
    expect(q.tipo).toBe("compara");
    expect(q.texto).toContain("manda la tuya");
    expect(q.texto).toContain("S/2,453.40 más");
  });

  it("si ya habías subido ese rango, lo reemplaza", () => {
    expect(queHaraLaCarga(agosto, [p({ origen: "direccion", hasta: "2026-08-31" })]).tipo).toBe("reemplaza");
  });

  it("si no había nada, es nuevo", () => {
    expect(queHaraLaCarga({ ...agosto, month: "2026-06", desde: "2026-06-01", hasta: "2026-06-30" }, [p({})]).tipo).toBe("nuevo");
  });

  it("no mezcla sedes", () => {
    expect(queHaraLaCarga({ ...agosto, businessId: 3 }, [p({})]).tipo).toBe("nuevo");
  });
});

describe("la sede según el nombre del archivo", () => {
  it("la sugiere cuando es clara", () => {
    expect(sedeDelNombre("Fonavi_Agosto-Platos con mayor rotacion del 2026-08-01 al 2026-08-31.xlsx")).toBe(2);
    expect(sedeDelNombre("centro julio.xlsx")).toBe(3);
    expect(sedeDelNombre("Platos con mayor rotacion del 2026-08-01 al 2026-08-31.xlsx")).toBeNull();
  });
});

describe("la carga parcial que dice ser mes completo", () => {
  it("julio de Fonavi (S/6,996 en '1 al 31') sale marcado", () => {
    const hoy = "2026-09-22";
    const ps = [
      p({ month: "2026-06", desde: "2026-06-01", hasta: "2026-06-30", ventas: 38244.8 }),
      p({ month: "2026-07", desde: "2026-07-01", hasta: "2026-07-31", ventas: 6996.3 }),
      p({ month: "2026-08", desde: "2026-08-01", hasta: "2026-08-29", ventas: 36844.8 }),
      p({ month: "2026-09", desde: "2026-09-01", hasta: "2026-09-19", ventas: 24381.2 }),
    ];
    const celdas = marcarSospechosas(["2026-06", "2026-07", "2026-08", "2026-09"].map((m) => celdaCobertura(ps, m, hoy)));
    expect(celdas.map((c) => !!c.sospechosa)).toEqual([false, true, false, false]);
  });
});
