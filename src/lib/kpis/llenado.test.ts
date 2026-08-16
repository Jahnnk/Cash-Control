/**
 * Tests del estado de llenado de reportes.
 *
 * Lo que se clava acá son las reglas que evitan alarmas falsas: un día
 * futuro no falta, un día anterior a la apertura de la sede tampoco, y
 * el día de hoy es un aviso y no una deuda. Si esas tres se rompen, el
 * panel grita todos los días y Jahnn deja de mirarlo.
 */
import { describe, it, expect } from "vitest";
import {
  evaluarLlenado, diasDeLaSemana, resumenFaltantes, etiquetaDia,
  TODA_LA_SEMANA, LUNES_A_SABADO,
  type FilaDia, type SedeInfo,
} from "./llenado";

// Semana dom 09-ago a sáb 15-ago de 2026.
const SEMANA = "2026-08-09";

const SEDES: SedeInfo[] = [
  // Atelier libra los domingos (día libre del administrador).
  { businessId: 1, sede: "Atelier", desde: null, esCafeteria: false, diasEsperados: LUNES_A_SABADO },
  { businessId: 2, sede: "Fonavi", desde: "2026-08-01", esCafeteria: true, diasEsperados: TODA_LA_SEMANA },
  { businessId: 3, sede: "Centro", desde: "2026-06-01", esCafeteria: true, diasEsperados: TODA_LA_SEMANA },
];

const dia = (businessId: number, fecha: string, extra: Partial<FilaDia> = {}): FilaDia => ({
  businessId, fecha, revenue: 1000, nps: 9, mermas: 0, ...extra,
});

/** Todos los días de la semana llenos para las 3 sedes. */
function semanaCompleta(): FilaDia[] {
  return diasDeLaSemana(SEMANA).flatMap((f) => [dia(1, f, { nps: null, mermas: 0 }), dia(2, f), dia(3, f)]);
}

describe("diasDeLaSemana", () => {
  it("devuelve los 7 días desde el domingo", () => {
    expect(diasDeLaSemana(SEMANA)).toEqual([
      "2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12",
      "2026-08-13", "2026-08-14", "2026-08-15",
    ]);
  });

  it("cruza bien el cambio de mes", () => {
    expect(diasDeLaSemana("2026-08-30")).toEqual([
      "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02",
      "2026-09-03", "2026-09-04", "2026-09-05",
    ]);
  });
});

describe("evaluarLlenado — nada que reclamar", () => {
  it("semana completa y terminada: al día", () => {
    const r = evaluarLlenado({
      weekStart: SEMANA, hoy: "2026-08-16", sedes: SEDES, filas: semanaCompleta(),
    });
    expect(r.alDia).toBe(true);
    expect(r.totalFaltan).toBe(0);
    expect(resumenFaltantes(r)).toBe("");
  });
});

describe("evaluarLlenado — las tres reglas anti-alarma falsa", () => {
  it("los días FUTUROS no cuentan como falta", () => {
    // Miércoles: de jueves en adelante todavía no pasó nada.
    const r = evaluarLlenado({
      weekStart: SEMANA, hoy: "2026-08-12", sedes: SEDES,
      filas: ["2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12"].flatMap((f) => [
        dia(1, f, { nps: null }), dia(2, f), dia(3, f),
      ]),
    });
    expect(r.alDia).toBe(true);
    const centro = r.sedes.find((s) => s.sede === "Centro")!;
    expect(centro.dias.filter((d) => d.estado === "futuro")).toHaveLength(3);
  });

  it("los días ANTERIORES a la apertura de la sede no cuentan", () => {
    // Fonavi abrió el 01-ago; en la semana del 26-jul no debe salir en rojo.
    const r = evaluarLlenado({
      weekStart: "2026-07-26", hoy: "2026-08-16", sedes: SEDES, filas: [],
    });
    const fonavi = r.sedes.find((s) => s.sede === "Fonavi")!;
    // Esa semana va del dom 26-jul al sáb 01-ago. Los 6 primeros días
    // Fonavi no existía; el 01-ago SÍ operaba, así que ese sí falta.
    expect(fonavi.dias.filter((d) => d.estado === "sin-operar")).toHaveLength(6);
    expect(fonavi.faltan).toBe(1);
    expect(fonavi.dias.find((d) => d.fecha === "2026-08-01")!.estado).toBe("falta");
    // Centro sí operaba desde junio: esos días SÍ faltan.
    expect(r.sedes.find((s) => s.sede === "Centro")!.faltan).toBe(7);
  });

  it("HOY sin registrar es aviso, no deuda", () => {
    const r = evaluarLlenado({
      weekStart: SEMANA, hoy: "2026-08-11", sedes: SEDES,
      filas: ["2026-08-09", "2026-08-10"].flatMap((f) => [
        dia(1, f, { nps: null }), dia(2, f), dia(3, f),
      ]),
    });
    expect(r.alDia).toBe(true);          // nadie debe nada todavía
    expect(r.totalFaltan).toBe(0);
    expect(r.pendientesHoy.sort()).toEqual(["Atelier", "Centro", "Fonavi"]);
  });
});

describe("evaluarLlenado — lo que sí hay que perseguir", () => {
  it("señala la sede y el día exactos que faltan", () => {
    const filas = semanaCompleta().filter(
      (f) => !(f.businessId === 2 && f.fecha === "2026-08-11"),
    );
    const r = evaluarLlenado({ weekStart: SEMANA, hoy: "2026-08-16", sedes: SEDES, filas });
    expect(r.alDia).toBe(false);
    expect(r.totalFaltan).toBe(1);
    expect(resumenFaltantes(r)).toBe("Fonavi (mar 11)");
  });

  it("junta varios días de la misma sede en una sola frase", () => {
    const filas = semanaCompleta().filter(
      (f) => !(f.businessId === 3 && ["2026-08-09", "2026-08-13"].includes(f.fecha)),
    );
    const r = evaluarLlenado({ weekStart: SEMANA, hoy: "2026-08-16", sedes: SEDES, filas });
    expect(resumenFaltantes(r)).toBe("Centro (dom 9, jue 13)");
  });

  it("distingue INCOMPLETO de FALTA: hay venta pero sin NPS", () => {
    const filas = semanaCompleta().map((f) =>
      f.businessId === 2 && f.fecha === "2026-08-10" ? { ...f, nps: null } : f,
    );
    const r = evaluarLlenado({ weekStart: SEMANA, hoy: "2026-08-16", sedes: SEDES, filas });
    expect(r.alDia).toBe(true);           // el reporte existe
    expect(r.totalIncompletos).toBe(1);
    const d = r.sedes.find((s) => s.sede === "Fonavi")!.dias.find((x) => x.fecha === "2026-08-10")!;
    expect(d.estado).toBe("incompleto");
    expect(d.faltan).toEqual(["NPS"]);
  });

  it("a Atelier NO se le exige NPS ni mermas: su registro es otro", () => {
    const filas = diasDeLaSemana(SEMANA).map((f) =>
      dia(1, f, { nps: null, mermas: null }),
    );
    const r = evaluarLlenado({
      weekStart: SEMANA, hoy: "2026-08-16",
      sedes: [{ ...SEDES[0], diasEsperados: TODA_LA_SEMANA }], filas,
    });
    expect(r.totalIncompletos).toBe(0);
    expect(r.sedes[0].dias.every((d) => d.estado === "lleno")).toBe(true);
  });

  it("una venta en cero cuenta como registrada (cerrar sin vender es un dato)", () => {
    const filas = semanaCompleta().map((f) =>
      f.businessId === 3 && f.fecha === "2026-08-09" ? { ...f, revenue: 0 } : f,
    );
    const r = evaluarLlenado({ weekStart: SEMANA, hoy: "2026-08-16", sedes: SEDES, filas });
    expect(r.totalFaltan).toBe(0);
  });
});

describe("etiquetaDia", () => {
  it("nombra el día como lo diría una persona", () => {
    expect(etiquetaDia("2026-08-09")).toBe("dom 9");
    expect(etiquetaDia("2026-08-15")).toBe("sáb 15");
  });
});

describe("días libres por sede (Atelier no reporta domingos)", () => {
  it("un domingo sin datos NO cuenta como falta para Atelier", () => {
    // Semana completa salvo el domingo de Atelier: debe quedar al día.
    const filas = semanaCompleta().filter(
      (f) => !(f.businessId === 1 && f.fecha === "2026-08-09"),
    );
    const r = evaluarLlenado({ weekStart: SEMANA, hoy: "2026-08-16", sedes: SEDES, filas });
    expect(r.alDia).toBe(true);
    expect(r.totalFaltan).toBe(0);
    const atelier = r.sedes.find((s) => s.sede === "Atelier")!;
    expect(atelier.dias.find((d) => d.fecha === "2026-08-09")!.estado).toBe("dia-libre");
  });

  it("pero un domingo SÍ registrado se muestra lleno: el dato manda", () => {
    // El día que Atelier decida reportar domingos, no hay que tocar nada.
    const r = evaluarLlenado({
      weekStart: SEMANA, hoy: "2026-08-16", sedes: SEDES, filas: semanaCompleta(),
    });
    const atelier = r.sedes.find((s) => s.sede === "Atelier")!;
    expect(atelier.dias.find((d) => d.fecha === "2026-08-09")!.estado).toBe("lleno");
  });

  it("a las cafeterías el domingo SÍ se les exige", () => {
    const filas = semanaCompleta().filter(
      (f) => !(f.businessId === 2 && f.fecha === "2026-08-09"),
    );
    const r = evaluarLlenado({ weekStart: SEMANA, hoy: "2026-08-16", sedes: SEDES, filas });
    expect(r.totalFaltan).toBe(1);
    expect(resumenFaltantes(r)).toBe("Fonavi (dom 9)");
  });

  it("abrir Atelier a los 7 días es cambiar una lista, nada más", () => {
    const sedes = SEDES.map((s) =>
      s.sede === "Atelier" ? { ...s, diasEsperados: TODA_LA_SEMANA } : s,
    );
    const filas = semanaCompleta().filter(
      (f) => !(f.businessId === 1 && f.fecha === "2026-08-09"),
    );
    const r = evaluarLlenado({ weekStart: SEMANA, hoy: "2026-08-16", sedes, filas });
    expect(resumenFaltantes(r)).toBe("Atelier (dom 9)");
  });
});
