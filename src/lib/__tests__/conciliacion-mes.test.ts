/** Centro, setiembre 2026: lo que Jahnn concilió a mano el 16-oct. */
import { describe, it, expect } from "vitest";
import { cifrasDeSede } from "../seis-cifras";
import { conciliarSede } from "../conciliacion-mes";

const centroSet = () => cifrasDeSede({
  businessId: 3, sede: "Centro", mes: "2026-09", finDeMes: "2026-09-30", corte: "2026-09-30",
  filas: [
    { categoria: "INSUMOS", propio: 16425.14, monto: 16425.14 },
    { categoria: "PLANILLA", propio: 18478.25, monto: 18478.25 },
    { categoria: "AHORRO", propio: 7200, monto: 7200 },
    { categoria: "UTILIDADES A SOCIOS", propio: 2400, monto: 2400 },
    { categoria: "DEVOLUCIONES", propio: 253.46, monto: 253.46 },
    { categoria: "EQUIPOS", propio: 150, monto: 150 },
  ],
  recuperos: [{ categoria: "DELIVERY Y FLETES", monto: 75.5 }],
  ventas: 41336.31, caja: { entro: 43984.61, salio: 44906.85 },
  cobrado: 40207.65, ingresadoVentas: 40163.55,
  ingresosFuera: { devolucionesSedes: 1376.96, prestamos: 0, rescates: 2400, otros: 0 },
});

describe("conciliación del mes (Centro, setiembre)", () => {
  const c = conciliarSede(centroSet(), "2026-09-30");

  it("paso 1: Byte contra el grupo «Ventas», con la diferencia en S/ y %", () => {
    expect(c.ventas).toMatchObject({ byte: 41336.31, excel: 40163.55, dif: 1172.76, difPct: 2.8, estado: "normal" });
  });

  it("paso 2: lo que entró se separa en ventas y lo demás, y cuadra al céntimo", () => {
    expect(c.entro.lineas.map((l) => l.etiqueta)).toEqual(["Ventas (grupo «Ventas»)", "Otros ingresos de la operación", "Devoluciones de otras sedes", "Rescates de ahorro (fondos mutuos)"]);
    expect(c.entro.sinExplicar).toBe(0);
  });

  it("paso 3: de lo que salió al egreso real, sin nada sin explicar", () => {
    expect(c.salio.egresoReal).toBe(34827.89); // el egreso real de Centro en setiembre
    expect(c.salio.sinExplicar).toBe(0);
  });

  it("paso 4: la caja da negativo, pero la operación ganó", () => {
    expect(c.resultado.caja).toBe(-922.24);
    expect(c.resultado.operacion).toBeGreaterThan(5000);
  });

  it("Atelier vende a crédito: su diferencia de ventas no se juzga", () => {
    const a = conciliarSede({ ...centroSet(), businessId: 1, sede: "Atelier" }, "2026-09-30");
    expect(a.ventas.estado).toBe("credito");
  });
});
