/**
 * Los cuatro motores del EBITDA (pedido de Jahnn, 15-oct-2026). Lo que se clava: el hueco entre el
 * EBITDA y su meta se reparte entre ventas, producto y fijos sin contar nada dos veces, y la
 * eficiencia es un semáforo de señales comprobadas.
 */
import { describe, it, expect } from "vitest";
import { motoresDeSede, peorEstado, type Senal } from "../motores-ebitda";
import { regla33 } from "../regla-33";
import { cifrasDeSede, cifrasDelGrupo } from "../seis-cifras";

const f = (categoria: string, monto: number) => ({ categoria, propio: monto, monto });
// Venta 30,000: costos 14,000 (46.7%), fijos 11,000 (36.7%, planilla 9,000 = 30%) → EBITDA 5,000 (16.7%).
const sede = cifrasDeSede({
  businessId: 2, sede: "Fonavi", mes: "2026-09", finDeMes: "2026-09-30", corte: "2026-09-30",
  filas: [f("INSUMOS", 14000), f("PLANILLA", 9000), f("ALQUILER", 2000)], ventas: 30000, caja: { entro: 30000, salio: 0 }, cobrado: 30000,
});
const fila = regla33({ sedes: [sede], grupo: cifrasDelGrupo([sede]) })[0];
const verde = (c: string): Senal => ({ clave: c, etiqueta: c, estado: "verde", detalle: "ok" });
const roja = (c: string): Senal => ({ clave: c, etiqueta: c, estado: "rojo", detalle: "mal" });
const entrada = (over: Partial<Parameters<typeof motoresDeSede>[0]> = {}) => ({
  regla: fila, ventas: { monto: 30000, esperada: 30000, mesAnterior: 33000 }, senales: [verde("Mermas")], ...over,
});

describe("el hueco del EBITDA se reparte entre los tres motores de plata", () => {
  it("con las ventas en su meta, lo que los costos y los fijos se pasaron es de ellos", () => {
    const m = motoresDeSede(entrada());
    const [ventas, producto, fijos] = m.motores;
    // Costos: 14,000 − 10,000 = 4,000 sobre su tercio. Fijos: 11,000 − 10,000 = 1,000.
    expect(producto.quita).toBe(4000);
    expect(fijos.quita).toBe(1000);
    expect(ventas.quita).toBe(0);
    expect(m.frena).toBe("producto");
    expect(m.titular).toContain("el costo del producto");
  });

  it("vender menos de lo esperado le pasa parte de los fijos al motor de ventas (sin contarla dos veces)", () => {
    // Esperaba 33,000 y vendió 30,000: los fijos de 11,000 se reparten entre 3,000 de menos → 11,000 × 3,000 ÷ 33,000 = 1,000.
    const m = motoresDeSede(entrada({ ventas: { monto: 30000, esperada: 33000, mesAnterior: null } }));
    const [ventas, producto, fijos] = m.motores;
    expect(ventas.quita).toBe(1000);
    expect(fijos.quita).toBe(0);                  // los 1,000 que sobraban eran de volumen
    expect(producto.quita).toBe(4000);
    // La suma de los tres = el hueco del EBITDA con su meta (14,000 − 10,000) + (11,000 − 10,000) = 5,000.
    expect((ventas.quita ?? 0) + (producto.quita ?? 0) + (fijos.quita ?? 0)).toBe(5000);
  });

  it("la parte de ventas nunca pasa de lo que los fijos se pasaron", () => {
    const m = motoresDeSede(entrada({ ventas: { monto: 30000, esperada: 60000, mesAnterior: null } }));
    expect(m.motores[0].quita).toBe(1000);
    expect(m.motores[2].quita).toBe(0);
  });

  it("sin venta esperada no se le inventa plata al motor de ventas", () => {
    const m = motoresDeSede(entrada({ ventas: { monto: 30000, esperada: null, mesAnterior: null } }));
    expect(m.motores[0].quita).toBeNull();
    expect(m.motores[0].meta).toBe("sin meta ni historial");
    expect(m.motores[2].quita).toBe(1000);
  });
});

describe("estados y frases", () => {
  it("ventas: verde si llega a lo esperado, ámbar a menos de 5%, rojo si queda más lejos", () => {
    const est = (monto: number) => motoresDeSede(entrada({ ventas: { monto, esperada: 30000, mesAnterior: null } })).motores[0].estado;
    expect([est(31000), est(29000), est(24000)]).toEqual(["verde", "ambar", "rojo"]);
  });

  it("dice cuánto cambió contra el mes anterior", () => {
    expect(motoresDeSede(entrada()).motores[0].frase).toContain("−9.1% contra el mes anterior");
  });

  it("si casi no cambió contra el mes anterior, no escribe «−0%»", () => {
    expect(motoresDeSede(entrada({ ventas: { monto: 30000, esperada: 30000, mesAnterior: 30040 } })).motores[0].frase).toContain("Igual que el mes anterior.");
  });

  it("costo del producto: dentro de su tercio verde; hasta 3 puntos ámbar; más rojo", () => {
    expect(motoresDeSede(entrada()).motores[1].estado).toBe("rojo");
    expect(motoresDeSede(entrada()).motores[1].cifra).toBe("46.7%");
  });

  it("la planilla sobre su tope pone ámbar a los fijos aunque estén dentro de su tercio", () => {
    const ok = cifrasDeSede({ businessId: 2, sede: "Fonavi", mes: "2026-09", finDeMes: "2026-09-30", corte: "2026-09-30",
      filas: [f("INSUMOS", 9000), f("PLANILLA", 8000), f("ALQUILER", 1500)], ventas: 30000, caja: { entro: 30000, salio: 0 }, cobrado: 30000 });
    const fl = regla33({ sedes: [ok], grupo: cifrasDelGrupo([ok]) })[0];
    const m = motoresDeSede({ regla: fl, ventas: { monto: 30000, esperada: 30000, mesAnterior: null }, senales: [] });
    // Fijos 9,500 = 31.7% (dentro de su tercio) pero planilla 26.7% > 25%.
    expect(m.motores[2].estado).toBe("ambar");
    expect(m.motores[2].frase).toContain("sano 20–25%");
  });

  it("con el EBITDA en su meta ningún motor frena", () => {
    const sano = cifrasDeSede({ businessId: 2, sede: "Fonavi", mes: "2026-09", finDeMes: "2026-09-30", corte: "2026-09-30",
      filas: [f("INSUMOS", 9000), f("PLANILLA", 6000), f("ALQUILER", 3000)], ventas: 30000, caja: { entro: 30000, salio: 0 }, cobrado: 30000 });
    const fl = regla33({ sedes: [sano], grupo: cifrasDelGrupo([sano]) })[0];
    const m = motoresDeSede({ regla: fl, ventas: { monto: 30000, esperada: 30000, mesAnterior: null }, senales: [verde("Mermas")] });
    expect(m.frena).toBeNull();
    expect(m.titular).toMatch(/ningún motor frena/);
  });
});

describe("eficiencia del sistema: semáforo de señales comprobadas", () => {
  it("el peor estado manda; las señales sin dato no cuentan", () => {
    expect(peorEstado(["verde", "ambar", "gris"])).toBe("ambar");
    expect(peorEstado(["verde", "rojo", "ambar"])).toBe("rojo");
    expect(peorEstado(["gris", "gris"])).toBe("gris");
    expect(peorEstado([])).toBe("gris");
  });

  it("dice cuántas están en verde y cuáles revisar", () => {
    const m = motoresDeSede(entrada({ senales: [verde("Mermas"), roja("Tiempos de atención"), { clave: "x", etiqueta: "Highlight", estado: "gris", detalle: "" }] }));
    const ef = m.motores[3];
    expect(ef.estado).toBe("rojo");
    expect(ef.cifra).toBe("1 de 2 en verde");
    expect(ef.frase).toContain("tiempos de atención");
    expect(ef.quita).toBeNull();
  });

  it("sin señales: gris, y no se inventa un rojo", () => {
    const ef = motoresDeSede(entrada({ senales: [] })).motores[3];
    expect(ef.estado).toBe("gris");
    expect(ef.cifra).toBe("—");
  });

  it("si la plata no explica el hueco pero la eficiencia está en rojo, la culpa es de la eficiencia", () => {
    // EBITDA apenas bajo su meta: nada pasa de S/50 por motor.
    const casi = cifrasDeSede({ businessId: 2, sede: "Fonavi", mes: "2026-09", finDeMes: "2026-09-30", corte: "2026-09-30",
      filas: [f("INSUMOS", 10010), f("PLANILLA", 6000), f("ALQUILER", 4000)], ventas: 30000, caja: { entro: 30000, salio: 0 }, cobrado: 30000 });
    const fl = regla33({ sedes: [casi], grupo: cifrasDelGrupo([casi]) })[0];
    const m = motoresDeSede({ regla: fl, ventas: { monto: 30000, esperada: 30000, mesAnterior: null }, senales: [roja("Mermas")] });
    expect(m.frena).toBe("eficiencia");
  });
});

describe("mes a medias", () => {
  it("avisa que los fijos aún no están completos, para no dar un «ningún motor frena» falso", () => {
    const a = cifrasDeSede({ businessId: 2, sede: "Fonavi", mes: "2026-10", finDeMes: "2026-10-31", corte: "2026-10-13",
      filas: [f("INSUMOS", 4000), f("ALQUILER", 1000)], ventas: 15000, caja: { entro: 15000, salio: 0 }, cobrado: 15000 });
    const fl = regla33({ sedes: [a], grupo: cifrasDelGrupo([a]) })[0];
    const m = motoresDeSede({ regla: fl, ventas: { monto: 15000, esperada: 15000, mesAnterior: null }, senales: [] });
    expect(m.titular).toContain("Mes a medias");
  });
});

describe("sin base", () => {
  it("sin gastos cargados dice por qué en lugar de mostrar motores inventados", () => {
    const vacia = cifrasDeSede({ businessId: 2, sede: "Fonavi", mes: "2026-10", finDeMes: "2026-10-31", corte: "2026-10-02", filas: [], ventas: 3000, caja: { entro: 900, salio: 0 }, cobrado: 900 });
    const fl = regla33({ sedes: [vacia], grupo: cifrasDelGrupo([vacia]) })[0];
    const m = motoresDeSede({ regla: fl, ventas: { monto: 3000, esperada: null, mesAnterior: null }, senales: [verde("Mermas")] });
    expect(m.motores.slice(0, 3).every((x) => x.estado === "gris")).toBe(true);
    expect(m.titular).toBe("Sin gastos cargados");
    expect(m.frena).toBeNull();
    // La eficiencia sí se puede medir aunque no haya Excel.
    expect(m.motores[3].estado).toBe("verde");
  });
});
