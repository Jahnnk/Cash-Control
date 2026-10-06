import { describe, it, expect } from "vitest";
import { puedoRetirar, puedoContratar, ajustarPrecios, puedoReinvertir, comprarInventario, matrizDeSede, reservaDe, disponible, type DatosDecision } from "./decisiones";

// Fonavi con sus números de octubre: lectura del banco 11,795 + 190 en efectivo, fijos 14,703 al mes,
// margen 53.4%, un mes típico de ~37,800, cuotas 1,379 al mes, reserva 4 semanas.
const fonavi: DatosDecision = {
  businessId: 2, sede: "Fonavi", banco: 11795.47, efectivo: 190.4, bancoAl: "2026-10-03", fondos: null, fondosAl: null,
  fijosMes: 14703, varRatio: 0.466, ventasMes: 37803, ticket: 30.47, cuotasMes: 1379, diasDelMes: 31,
  reserva: reservaDe(14703, null),
  tendencias: { varAntes: 0.46, varAhora: 0.466, fijosAntes: 14500, fijosAhora: 14703 },
};

describe("reserva mínima", () => {
  it("por defecto: 4 semanas de costos fijos (la del libro)", () => {
    expect(reservaDe(14703, null)).toEqual({ monto: 13723, como: "4 semanas de costos fijos" });
  });
  it("se puede cambiar a otras semanas o a un monto fijo (el monto manda)", () => {
    expect(reservaDe(14703, { semanas: 2, monto: null }).monto).toBe(6861);
    expect(reservaDe(14703, { semanas: 2, monto: 5000 })).toEqual({ monto: 5000, como: "monto fijo de S/5,000" });
  });
});

describe("¿Puedo retirar dinero?", () => {
  it("Fonavi: banco + lo que deja el mes − cuotas − reserva ≈ S/2,367 libres → sí", () => {
    const r = puedoRetirar(fonavi);
    expect(r.semaforo).toBe("verde");
    expect(r.veredicto).toMatch(/^Sí, hasta S\/2,3\d\d$/);
    const libre = r.pasos[r.pasos.length - 1].valor;
    expect(libre).toBeGreaterThan(2300);
    expect(libre).toBeLessThan(2450);
    expect(r.pasos.map((p) => p.op)).toEqual(["", "+", "+", "+", "−", "−", "="]);
  });

  it("Centro: S/349 en el banco y la reserva en fondos mutuos; sin anotar los fondos sale en rojo o ámbar, anotándolos cambia", () => {
    const centro: DatosDecision = { ...fonavi, businessId: 3, sede: "Centro", banco: 348.8, efectivo: 0, fijosMes: 17470, varRatio: 0.414, ventasMes: 39832, cuotasMes: 0, reserva: reservaDe(17470, null) };
    const sinFondos = puedoRetirar(centro);
    expect(sinFondos.semaforo).not.toBe("verde");
    const conFondos = puedoRetirar({ ...centro, fondos: 30000, fondosAl: "2026-09-30" });
    expect(conFondos.semaforo).toBe("verde");
    expect(disponible({ ...centro, fondos: 30000 })).toBeCloseTo(30348.8, 1);
  });

  it("cubre los pagos pero se comería la reserva: «Espera»", () => {
    const r = puedoRetirar({ ...fonavi, banco: 5000 });
    expect(r.semaforo).toBe("ambar");
    expect(r.veredicto).toBe("Espera");
  });

  it("ni siquiera cubre los pagos del mes: «No»", () => {
    const r = puedoRetirar({ ...fonavi, banco: 0, efectivo: 0, ventasMes: 20000, cuotasMes: 5000 });
    expect(r.semaforo).toBe("rojo");
    expect(r.veredicto).toBe("No");
  });

  it("sin lectura del banco no inventa", () => {
    expect(puedoRetirar({ ...fonavi, banco: null }).semaforo).toBe("gris");
  });
});

describe("¿Puedo contratar o sumar un gasto fijo?", () => {
  it("como la tabla del libro: el gasto ÷ el margen = ventas adicionales", () => {
    // Margen 55% (como el libro): software S/80 → S/145; medio tiempo S/600 → S/1,091; local +S/400 → S/727.
    const libro = { ...fonavi, varRatio: 0.45 };
    expect(puedoContratar(libro, 80, "software").interpretacion).toMatch(/vender S\/145 más/);
    expect(puedoContratar(libro, 600, "medio tiempo").interpretacion).toMatch(/vender S\/1,091 más/);
    expect(puedoContratar(libro, 400, "local").interpretacion).toMatch(/vender S\/727 más/);
  });

  it("Fonavi con un sueldo de S/1,500: sus ventas ya cubren el nuevo piso → sí", () => {
    const r = puedoContratar(fonavi, 1500);
    expect(r.semaforo).toBe("verde");
    expect(r.accion).toMatch(/aguanta hasta S\/[\d,]+ de gasto fijo nuevo/);
  });

  it("si hace falta vender hasta 30% más: «solo si vendes X% más»; más de 30%: «todavía no»", () => {
    const justo = { ...fonavi, ventasMes: 30000 };
    const r1 = puedoContratar(justo, 3000);
    expect(r1.semaforo).toBe("ambar");
    expect(r1.veredicto).toMatch(/^Solo si vendes \d+% más$/);
    const r2 = puedoContratar({ ...fonavi, ventasMes: 22000 }, 6000);
    expect(r2.semaforo).toBe("rojo");
    expect(r2.veredicto).toBe("Todavía no");
  });
});

describe("¿Necesito ajustar precios?", () => {
  it("el margen cubre los gastos y deja más de 10%, sin alzas: no por ahora", () => {
    const r = ajustarPrecios(fonavi);
    expect(r.semaforo).toBe("verde");
  });
  it("si no cubre los costos fijos, es necesario (Atelier en setiembre)", () => {
    const atelier = { ...fonavi, sede: "Atelier", fijosMes: 18678, varRatio: 0.519, ventasMes: 36285 };
    const r = ajustarPrecios(atelier);
    expect(r.semaforo).toBe("rojo");
    expect(r.veredicto).toBe("Sí, es necesario");
  });
  it("si los insumos o los fijos vienen subiendo, avisa aunque haya ganancia", () => {
    const r = ajustarPrecios({ ...fonavi, tendencias: { varAntes: 0.42, varAhora: 0.466, fijosAntes: 14703, fijosAhora: 14703 } });
    expect(r.semaforo).toBe("ambar");
    expect(r.interpretacion).toMatch(/los insumos subieron de 42% a 46.6%/);
    const f = ajustarPrecios({ ...fonavi, tendencias: { varAntes: 0.466, varAhora: 0.466, fijosAntes: 12000, fijosAhora: 14703 } });
    expect(f.interpretacion).toMatch(/los costos fijos subieron 23%/);
  });
});

describe("¿Puedo reinvertir?", () => {
  it("menos de 4 semanas de costos fijos guardadas: espera (Fonavi hoy, 3.5 semanas)", () => {
    const r = puedoReinvertir(fonavi);
    expect(r.semaforo).toBe("rojo");
    expect(r.numero).toMatch(/^3[.,]\d semanas$/);
  });
  it("entre 4 y 8: con cuidado; más de 8 y el mes deja plata: sí", () => {
    expect(puedoReinvertir({ ...fonavi, fondos: 10000 }).semaforo).toBe("ambar");
    expect(puedoReinvertir({ ...fonavi, fondos: 30000 }).semaforo).toBe("verde");
  });
});

describe("¿Puedo comprar inventario?", () => {
  it("con plata libre: sí, y recuerda que el stock no lo mide el sistema", () => {
    const r = comprarInventario(fonavi);
    expect(r.semaforo).toBe("verde");
    expect(r.interpretacion).toMatch(/no lleva el stock/);
  });
  it("sin plata libre: espera o no", () => {
    expect(comprarInventario({ ...fonavi, banco: 5000 }).semaforo).toBe("ambar");
  });
});

it("la matriz de una sede trae las cinco respuestas", () => {
  expect(Object.keys(matrizDeSede(fonavi))).toEqual(["retirar", "contratar", "precios", "reinvertir", "inventario"]);
});
