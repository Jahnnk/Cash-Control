/**
 * Regresión · setiembre 2026, Fonavi y Centro (auditoría del 24-oct-2026).
 *
 * Corre el cálculo REAL de la app sobre lo que hoy está en la base (solo lectura) y exige las cifras al céntimo,
 * después de las correcciones A1–A3. Si alguien rompe un cálculo, esto falla. Si alguien vuelve a subir el Excel
 * de setiembre con otros datos, también falla: es a propósito (las cifras auditadas cambiaron).
 *
 *   npm run test:regresion
 *
 * Cada esperado sale de la auditoría; los que se explican abajo los confirmó la base fila por fila.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";

// La sesión de Next (cookies) no existe aquí: se simula dirección. Es lo único que se simula.
vi.mock("@/lib/session-access", async (o) => ({
  ...(await o<typeof import("@/lib/session-access")>()),
  getSessionRole: async () => ({ kind: "full", quien: "jahnn" }),
  requireFullSession: async () => true,
  requireLectura: async () => true,
}));

import { neon } from "@neondatabase/serverless";
import { getSeisCifras } from "@/app/actions/seis-cifras";
import { getGroupBreakeven } from "@/app/actions/breakeven";
import { cifrasDelGrupo, type CifrasSede } from "@/lib/seis-cifras";
import { regla33 } from "@/lib/regla-33";
import { leerDatosMesSede } from "@/lib/seis-cifras-sql";
import { controlesDelMes } from "@/lib/controles-fiabilidad-sql";
import type { ControlesMes } from "@/lib/controles-fiabilidad";

const MES = "2026-09";
const sql = neon(process.env.DATABASE_URL!);

const ESPERADO = {
  Fonavi: { id: 2, ventas: 37293.99, costos: 17147.5, gastos: 13537.83, ebitda: 6608.66, pe: 25060.43, entro: 37109.37, salio: 33181.21, movimientos: 249 },
  // Centro: costos fijos 18,370.96 = 18,415.06 − S/44.10 de «GASTO NO EJECUTADO (ROSARIO REYES)» (A1, 25/09 y 29/09).
  Centro: { id: 3, ventas: 41336.31, costos: 16349.64, gastos: 18370.96, ebitda: 6615.71, pe: 30391.71, entro: 43984.61, salio: 44906.85, movimientos: 245 },
} as const;

let sedes: Record<"Fonavi" | "Centro", CifrasSede>;
let controles: Record<"Fonavi" | "Centro", ControlesMes>;
let configRegla: Parameters<typeof regla33>[1];

beforeAll(async () => {
  const r = await getSeisCifras(MES);
  if (!r.ok) throw new Error(r.error);
  configRegla = r.data.config;
  sedes = { Fonavi: r.data.sedes.find((s) => s.businessId === 2)!, Centro: r.data.sedes.find((s) => s.businessId === 3)! };
  const [f, c] = await Promise.all([controlesDelMes(sql as never, 2, MES), controlesDelMes(sql as never, 3, MES)]);
  controles = { Fonavi: f, Centro: c };
});

const ebitdaDe = (s: CifrasSede) => regla33({ sedes: [s], grupo: cifrasDelGrupo([s]) }, configRegla)[0].ebitda!.monto;

describe.each(["Fonavi", "Centro"] as const)("%s · las seis cifras de setiembre 2026", (sede) => {
  const e = ESPERADO[sede];
  it("ventas, costos variables, costos fijos y EBITDA al céntimo", () => {
    const s = sedes[sede];
    expect(s.ventas).toBe(e.ventas);
    expect(s.costos).toBe(e.costos);
    expect(s.gastos).toBe(e.gastos);
    expect(ebitdaDe(s)).toBe(e.ebitda);
  });
  it("punto de equilibrio = fijos ÷ (1 − variables ÷ ventas) con esas mismas cifras (A3)", () => {
    expect(sedes[sede].puntoEquilibrio).toBe(e.pe);
  });
  it("el punto de equilibrio del módulo de equilibrio es el mismo (ya no clasifica por su cuenta)", async () => {
    const b = await getGroupBreakeven(MES);
    if (!b.ok) throw new Error(b.error);
    const r = b.data.sedes.find((x) => x.businessId === e.id)!.result;
    expect(r.fijos).toBe(e.gastos);
    expect(r.variables).toBe(e.costos);
    expect(r.ventas).toBe(e.ventas);
    expect(r.breakEvenLibro).toBe(e.pe);
  });
  it("total de ingresos y de egresos (lo que entró y salió de la cuenta)", () => {
    expect(sedes[sede].caja.entro).toBe(e.entro);
    expect(sedes[sede].caja.salio).toBe(e.salio);
  });
  it("cantidad de movimientos del mes", async () => {
    const d = await leerDatosMesSede(sql as never, e.id, sede, MES);
    expect(d.gastos.length + d.ingresos.length).toBe(e.movimientos);
  });
});

describe("Grupo (Fonavi + Centro)", () => {
  it("EBITDA 13,224.37", () => {
    const g = cifrasDelGrupo([sedes.Fonavi, sedes.Centro]);
    expect(regla33({ sedes: [], grupo: g }, configRegla).at(-1)!.ebitda!.monto).toBe(13224.37);
  });
});

describe("correcciones de la auditoría", () => {
  it("A1: los S/44.10 de gasto no ejecutado de Centro se compensan (ni gasto ni otro ingreso)", () => {
    expect(sedes.Centro.fuera.compensado).toBe(44.1);
    expect(sedes.Centro.ingresosFuera.compensados).toBe(44.1);
    expect(sedes.Centro.porCategoria.find((c) => c.categoria === "POR ACLARAR")).toBeUndefined();
    // «A RENDIR (SOLANGE)» S/127.40 de Fonavi no tiene su devolución en setiembre: sigue contando.
    expect(sedes.Fonavi.fuera.compensado).toBe(0);
  });
  it("A2: la fila 114 de Centro (S/63.19, tipo cruzado) queda fuera de las seis cifras", () => {
    expect(sedes.Centro.fuera.revisarTipo).toBe(63.19);
  });
  it("A4: «ingresado por ventas» de Centro = 40,184.55, igual que el Excel (el Yape de S/21 devuelto por Fonavi es venta)", () => {
    expect(sedes.Centro.ingresadoVentas).toBe(40184.55);
  });
});

const estadoDe = (sede: "Fonavi" | "Centro", id: string) => controles[sede].controles.find((c) => c.id === id)!;

describe("controles de fiabilidad de setiembre 2026", () => {
  it("C4 Fonavi rojo por S/32.12 y C4 Centro rojo por S/3,810.52", () => {
    expect(estadoDe("Fonavi", "C4")).toMatchObject({ estado: "rojo", diferencia: 32.12 });
    expect(estadoDe("Centro", "C4")).toMatchObject({ estado: "rojo", diferencia: 3810.52 });
  });
  it("C5 Centro rojo (caja en −S/103 al 31/08 y sin un movimiento en efectivo con S/7,787.70 vendidos en efectivo)", () => {
    expect(estadoDe("Centro", "C5").estado).toBe("rojo");
  });
  it("C6 Centro rojo por la fila del 11/09 de S/63.19", () => {
    const c6 = estadoDe("Centro", "C6");
    expect(c6).toMatchObject({ estado: "rojo", diferencia: 63.19 });
    expect(c6.filas?.[0]).toMatch(/^Fila 114 · 11\/09 · DEPÓSITO POR VENTAS EN EFECTIVO/);
    expect(estadoDe("Fonavi", "C6").estado).toBe("verde");
  });
  it("C7 en verde en las dos sedes: las cifras de la app cuadran entre sí", () => {
    expect(estadoDe("Fonavi", "C7").estado).toBe("verde");
    expect(estadoDe("Centro", "C7").estado).toBe("verde");
  });
  it("el mes queda «No confiable» en las dos sedes", () => {
    expect(controles.Fonavi.estado).toBe("no_confiable");
    expect(controles.Centro.estado).toBe("no_confiable");
  });
  // Lo que además detectan los controles (no estaba en la lista de la auditoría; ver el PR):
  it("además: C5 Fonavi rojo (S/8,031.15 vendidos en efectivo y la caja quieta en S/190.40 todo el mes)", () => {
    expect(estadoDe("Fonavi", "C5").estado).toBe("rojo");
  });
  it("además: C1 Centro rojo (el pie de la hoja no suma todas las filas: +S/33.20 ingresos, +S/9,568.77 egresos)", () => {
    expect(estadoDe("Centro", "C1")).toMatchObject({ estado: "rojo", diferencia: 9601.97 });
    expect(estadoDe("Fonavi", "C1").estado).toBe("verde");
  });
});
