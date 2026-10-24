/**
 * Regresión · setiembre 2026, Fonavi y Centro (auditoría del 24-oct-2026).
 *
 * Corre el cálculo de la app (cifrasDelMes, controlesDeSede, regla 33-33-33) sobre una FOTO de los datos de setiembre
 * — sin conexión a la base — y exige las cifras al céntimo. Si alguien rompe un cálculo, esto falla; si Kelly corrige
 * setiembre y vuelve a subir el Excel, NO falla (la foto no cambia).
 *
 *   npm run regresion:foto   → saca la foto de la base (solo lectura) a scripts/regresion/fixtures/ (fuera de GitHub)
 *   npm run test:regresion   → corre esta prueba (también corre dentro de `npm test`)
 *
 * Sin la foto (CI, otra máquina) la prueba se salta con un aviso: la suite normal sigue pasando.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { FotoRegresion } from "./foto";
import { controlesDeSede, type ControlesMes } from "../../src/lib/controles-fiabilidad";
import { cifrasDelGrupo, type CifrasSede } from "../../src/lib/seis-cifras";
import { regla33, CONFIG_PROFIT_FIRST } from "../../src/lib/regla-33";

const RUTA_FOTO = join(__dirname, "fixtures", "2026-09-fonavi-centro.json");
const hayFoto = existsSync(RUTA_FOTO);

const ESPERADO = {
  Fonavi: { ventas: 37293.99, costos: 17147.5, gastos: 13537.83, ebitda: 6608.66, pe: 25060.43, entro: 37109.37, salio: 33181.21, movimientos: 249 },
  // Centro: costos fijos 18,370.96 = 18,415.06 − S/44.10 de «GASTO NO EJECUTADO (ROSARIO REYES)» (A1, 25/09 y 29/09).
  Centro: { ventas: 41336.31, costos: 16349.64, gastos: 18370.96, ebitda: 6615.71, pe: 30391.71, entro: 43984.61, salio: 44906.85, movimientos: 245 },
} as const;

if (!hayFoto) {
  describe("regresión setiembre 2026 (Fonavi y Centro)", () => {
    it.skip("SALTADA: no hay foto en scripts/regresion/fixtures/. Créala con `npm run regresion:foto` (necesita .env.local).", () => {});
  });
} else {
  const foto = JSON.parse(readFileSync(RUTA_FOTO, "utf8")) as FotoRegresion;
  const r = { Fonavi: controlesDeSede(foto.sedes.Fonavi), Centro: controlesDeSede(foto.sedes.Centro) };
  const sedes: Record<"Fonavi" | "Centro", CifrasSede> = { Fonavi: r.Fonavi.cifras, Centro: r.Centro.cifras };
  const controles: Record<"Fonavi" | "Centro", ControlesMes> = r;
  const config = foto.sedes.Fonavi.config ?? CONFIG_PROFIT_FIRST;
  const ebitdaDe = (s: CifrasSede) => regla33({ sedes: [s], grupo: cifrasDelGrupo([s]) }, config)[0].ebitda!.monto;
  const control = (sede: "Fonavi" | "Centro", id: string) => controles[sede].controles.find((c) => c.id === id)!;

  describe(`foto de ${foto.mes} sacada el ${foto.generada.slice(0, 10)}`, () => {
    it("es de setiembre 2026 y trae las dos sedes", () => {
      expect(foto.mes).toBe("2026-09");
      expect(Object.keys(foto.sedes).sort()).toEqual(["Centro", "Fonavi"]);
    });
  });

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
    it("total de ingresos y de egresos (lo que entró y salió de la cuenta)", () => {
      expect(sedes[sede].caja.entro).toBe(e.entro);
      expect(sedes[sede].caja.salio).toBe(e.salio);
    });
    it("cantidad de movimientos del mes", () => {
      expect(foto.sedes[sede].datos.gastos.length + foto.sedes[sede].datos.ingresos.length).toBe(e.movimientos);
    });
  });

  describe("Grupo (Fonavi + Centro)", () => {
    it("EBITDA 13,224.37", () => {
      const g = cifrasDelGrupo([sedes.Fonavi, sedes.Centro]);
      expect(regla33({ sedes: [], grupo: g }, config).at(-1)!.ebitda!.monto).toBe(13224.37);
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
    it("A4: «ingresado por ventas» de Centro = 40,184.55, igual que el Excel", () => {
      expect(sedes.Centro.ingresadoVentas).toBe(40184.55);
    });
  });

  describe("controles de fiabilidad de setiembre 2026", () => {
    it("C1: Fonavi verde; Centro rojo (el pie de la hoja no suma todas las filas: +S/33.20 ingresos, +S/9,568.77 egresos)", () => {
      expect(control("Fonavi", "C1").estado).toBe("verde");
      expect(control("Centro", "C1")).toMatchObject({ estado: "rojo", diferencia: 9601.97 });
    });
    it("C2: amarillo en las dos (Byte vs Control de VTAS: S/3.20 y S/1.70)", () => {
      expect(control("Fonavi", "C2")).toMatchObject({ estado: "amarillo", diferencia: 3.2 });
      expect(control("Centro", "C2")).toMatchObject({ estado: "amarillo", diferencia: 1.7 });
    });
    it("C3: Fonavi amarillo (S/138.04 por aclarar, 0.42%); Centro verde", () => {
      expect(control("Fonavi", "C3")).toMatchObject({ estado: "amarillo", diferencia: 138.04 });
      expect(control("Centro", "C3").estado).toBe("verde");
    });
    it("C4: Fonavi rojo por S/32.12 y Centro rojo por S/3,810.52", () => {
      expect(control("Fonavi", "C4")).toMatchObject({ estado: "rojo", diferencia: 32.12 });
      expect(control("Centro", "C4")).toMatchObject({ estado: "rojo", diferencia: 3810.52 });
    });
    it("C5 Fonavi verde: CONTROL EFECTIVO 8,031.15 vendido vs 8,031.10 depositado (S/0.05)", () => {
      expect(foto.sedes.Fonavi.efectivo).toEqual({ ventas: 8031.15, depositos: 8031.1 });
      expect(control("Fonavi", "C5")).toMatchObject({ estado: "verde", diferencia: 0.05 });
    });
    it("C5 Centro rojo SOLO por la caja de −S/103 al 31/08 que quedó guardada (error de lectura ya corregido; se va al volver a subir agosto)", () => {
      expect(foto.sedes.Centro.efectivo).toEqual({ ventas: 7787.7, depositos: 7787.7 });
      const c5 = control("Centro", "C5");
      expect(c5).toMatchObject({ estado: "rojo", diferencia: 103 });
      expect(c5.detalle).toContain("Caja negativa al 31/08");
      // Sin ese saldo, el efectivo cuadra al céntimo: verde.
      const sinNegativo = controlesDeSede({ ...foto.sedes.Centro, saldoInicial: { ...foto.sedes.Centro.saldoInicial!, caja: 2388.87 } });
      expect(sinNegativo.controles.find((c) => c.id === "C5")!.estado).toBe("verde");
    });
    it("C6: Centro rojo por la fila del 11/09 de S/63.19; Fonavi verde", () => {
      expect(control("Centro", "C6")).toMatchObject({ estado: "rojo", diferencia: 63.19 });
      expect(control("Centro", "C6").filas?.[0]).toMatch(/^Fila 114 · 11\/09 · DEPÓSITO POR VENTAS EN EFECTIVO/);
      expect(control("Fonavi", "C6").estado).toBe("verde");
    });
    it("C7 y C8 verdes en las dos sedes", () => {
      for (const s of ["Fonavi", "Centro"] as const) {
        expect(control(s, "C7").estado).toBe("verde");
        expect(control(s, "C8").estado).toBe("verde");
      }
    });
    it("el mes queda «No confiable» en las dos sedes", () => {
      expect(controles.Fonavi.estado).toBe("no_confiable");
      expect(controles.Centro.estado).toBe("no_confiable");
    });
  });
}
