/**
 * "¿Podemos asumir este gasto?" — el caso de la refrigeradora.
 *
 * 9-sep-2026: se malogra la refrigeradora de Atelier, el técnico cobra
 * S/3,400 y Kelly pregunta si las cafeterías tienen liquidez para
 * prestar. Jahnn entra al sistema con el técnico esperando y no
 * encuentra la respuesta.
 *
 * Los saldos de estos tests son los REALES de esa fecha, incluidos los
 * que están mal (la caja negativa de Atelier, las cafeterías sin saldo
 * de banco) — porque el valor del módulo está justamente en no callarse
 * cuando el dato no da para decidir.
 */
import { describe, it, expect } from "vitest";
import {
  evaluarGasto, evaluarSede, DIAS_COLCHON_MINIMO, DIAS_SALDO_VIEJO,
  type SaldoSede,
} from "../saldos-sede";

const HOY = "2026-09-10";

const sede = (
  businessId: number, nombre: string, banco: number | null, caja: number,
  fecha: string | null, gastoFijoDiario: number,
): SaldoSede => ({ businessId, nombre, banco, caja, fecha, gastoFijoDiario });

/**
 * Saldos sanos con los COSTOS FIJOS diarios reales de agosto
 * (Atelier S/18,540, Fonavi S/15,020, Centro S/17,080, ÷31 días).
 */
const SANOS = [
  sede(1, "Atelier", 8500, 1200, HOY, 598),
  sede(2, "Fonavi", 6000, 900, HOY, 484),
  sede(3, "Centro", 7000, 1100, HOY, 551),
];

describe("la refrigeradora de S/3,400", () => {
  it("con S/24,700 alcanza, pero queda JUSTO: 13 días de costos fijos", () => {
    // El grupo tiene S/50,640 de costos fijos al mes = S/1,633 al día.
    // Quedarse con S/21,300 son 13 días: por debajo de la quincena de
    // planilla, que es el compromiso impostergable. El sistema lo dice
    // así en vez de dar un "sí" tranquilizador.
    const r = evaluarGasto({ monto: 3400, sedes: SANOS, todayISO: HOY });
    expect(r.veredicto).toBe("alcanza_justo");
    expect(r.disponibleTotal).toBe(24700);
    expect(r.quedaTotal).toBe(21300);
    expect(r.titular).toContain("Alcanza, pero justo");
  });

  it("con caja suficiente para media planilla más, sí dice holgado", () => {
    const holgado = SANOS.map((s) => ({ ...s, banco: (s.banco ?? 0) + 4000 }));
    const r = evaluarGasto({ monto: 3400, sedes: holgado, todayISO: HOY });
    expect(r.veredicto).toBe("alcanza_holgado");
    expect(r.titular).toContain("Sí alcanza");
  });

  it("sugiere la sede que queda con MÁS colchón, no la que tiene más plata", () => {
    // Atelier tiene el saldo más alto (9,700) pero también el gasto más
    // bajo, así que después del gasto queda con más días. La sugerencia
    // mira los días, no los soles.
    const r = evaluarGasto({ monto: 3400, sedes: SANOS, todayISO: HOY });
    expect(r.sedeSugerida?.nombre).toBe("Atelier");
  });

  it("una sede que no lo cubre sola no se sugiere", () => {
    const r = evaluarGasto({
      monto: 8000,
      sedes: [sede(1, "Atelier", 3000, 0, HOY, 1000), sede(2, "Fonavi", 9000, 0, HOY, 1500)],
      todayISO: HOY,
    });
    expect(r.sedeSugerida?.nombre).toBe("Fonavi");
  });

  it("si nadie lo cubre solo, no inventa una sede", () => {
    const r = evaluarGasto({
      monto: 8000,
      sedes: [sede(1, "Atelier", 5000, 0, HOY, 1000), sede(2, "Fonavi", 5000, 0, HOY, 1000)],
      todayISO: HOY,
    });
    expect(r.veredicto).not.toBe("no_alcanza");   // entre las dos sí alcanza
    expect(r.sedeSugerida).toBeNull();
  });
});

describe("el colchón se mide en días, no en soles", () => {
  it("alcanzar no es lo mismo que alcanzar holgado", () => {
    // Queda plata, pero menos de una semana de operación.
    const r = evaluarGasto({
      monto: 20000,
      sedes: [sede(1, "Atelier", 24000, 0, HOY, 1000), sede(2, "Fonavi", 1000, 0, HOY, 500)],
      todayISO: HOY,
    });
    expect(r.veredicto).toBe("alcanza_justo");
    expect(r.titular).toContain(`por debajo del colchón de ${DIAS_COLCHON_MINIMO} días`);
  });

  it("cuando no alcanza dice cuánto falta", () => {
    const r = evaluarGasto({ monto: 40000, sedes: SANOS, todayISO: HOY });
    expect(r.veredicto).toBe("no_alcanza");
    expect(r.titular).toContain("faltan S/15,300");
  });
});

describe("no se calla cuando el dato no da para decidir", () => {
  it("avisa que el saldo está viejo y nombra la fecha", () => {
    // El caso real: el último saldo de Atelier era del 10 de agosto.
    const s = evaluarSede(sede(1, "Atelier", 3453, 0, "2026-08-10", 598), HOY);
    expect(s.antiguedadDias).toBe(31);
    expect(s.avisos[0]).toContain("hace 31 días");
    expect(31).toBeGreaterThan(DIAS_SALDO_VIEJO);
  });

  it("una caja negativa se denuncia: es imposible, faltan ingresos", () => {
    // Atelier salía en −S/981 porque registra más egresos en efectivo
    // que ingresos. Decidir sobre ese número sería decidir sobre un
    // error de carga.
    const s = evaluarSede(sede(1, "Atelier", 3453, -981, HOY, 598), HOY);
    expect(s.avisos.some((a) => a.includes("negativo"))).toBe(true);
  });

  it("una sede sin saldo jamás registrado lo dice", () => {
    // Fonavi y Centro: cero saldos de banco desde siempre.
    const s = evaluarSede(sede(2, "Fonavi", null, 0, null, 484), HOY);
    expect(s.avisos).toContain("nunca se ha registrado su saldo");
  });

  it("marca datosDebiles para que la pantalla no muestre un veredicto firme", () => {
    const r = evaluarGasto({
      monto: 3400,
      sedes: [sede(1, "Atelier", 3453, -981, "2026-08-10", 598), ...SANOS.slice(1)],
      todayISO: HOY,
    });
    expect(r.datosDebiles).toBe(true);
  });

  it("sin ningún saldo registrado no da veredicto", () => {
    const r = evaluarGasto({
      monto: 3400,
      sedes: [sede(1, "Atelier", null, 0, null, 598), sede(2, "Fonavi", null, 0, null, 484)],
      todayISO: HOY,
    });
    expect(r.veredicto).toBe("sin_datos");
    expect(r.titular).toContain("no puede decir si alcanza");
  });
});

describe("los días de colchón por sede", () => {
  it("traduce soles a días con el gasto real de esa sede", () => {
    const s = evaluarSede(sede(3, "Centro", 7000, 1100, HOY, 551), HOY);
    expect(s.disponible).toBe(8100);
    expect(s.diasColchon).toBe(15);
  });

  it("sin gasto conocido no inventa días", () => {
    const s = evaluarSede(sede(3, "Centro", 7000, 0, HOY, 0), HOY);
    expect(s.diasColchon).toBeNull();
  });
});

describe("el dato débil se dice ANTES que el veredicto", () => {
  // El caso real del 10-set-2026: Atelier con saldo del 10 de agosto,
  // Fonavi y Centro sin ninguno. El panel decía "No alcanza" y eso
  // habría hecho entrar en pánico por un problema de registro, no de
  // plata — justo con el técnico esperando.
  const ROTO = [
    sede(1, "Atelier", 3453, -981, "2026-08-10", 598),
    sede(2, "Fonavi", null, 0, null, 484),
    sede(3, "Centro", null, 0, null, 551),
  ];

  it("encabeza con lo que falta registrar, no con 'no alcanza'", () => {
    const r = evaluarGasto({ monto: 3400, sedes: ROTO, todayISO: HOY });
    expect(r.titular.startsWith("Falta registrar el saldo de Fonavi y Centro")).toBe(true);
    expect(r.titular).toContain("NO es la plata real");
  });

  it("igual da el veredicto después: no oculta la conclusión", () => {
    const r = evaluarGasto({ monto: 3400, sedes: ROTO, todayISO: HOY });
    expect(r.veredicto).toBe("no_alcanza");
    expect(r.titular).toContain("No alcanza");
  });

  it("si solo hay saldos viejos, avisa la antigüedad", () => {
    const viejos = [
      sede(1, "Atelier", 8500, 1200, "2026-08-10", 598),
      sede(2, "Fonavi", 6000, 900, "2026-08-10", 484),
      sede(3, "Centro", 7000, 1100, "2026-08-10", 551),
    ];
    const r = evaluarGasto({ monto: 3400, sedes: viejos, todayISO: HOY });
    expect(r.titular).toContain("hace 31 días");
    expect(r.titular).toContain("puede no ser la plata real");
  });

  it("con los saldos frescos no mete prefijo: la frase va limpia", () => {
    const r = evaluarGasto({ monto: 3400, sedes: SANOS, todayISO: HOY });
    expect(r.titular.startsWith("Alcanza")).toBe(true);
    expect(r.datosDebiles).toBe(false);
  });
});
