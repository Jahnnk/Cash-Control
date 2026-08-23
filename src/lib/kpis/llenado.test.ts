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
  restarDias, rachaDeRegistro, mensajeEstadoKpis,
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

describe("restarDias — la ventana móvil del panel del administrador", () => {
  it("resta días dentro del mismo mes", () => {
    expect(restarDias("2026-08-16", 6)).toBe("2026-08-10");
  });

  it("cruza para atrás el cambio de mes", () => {
    expect(restarDias("2026-08-03", 6)).toBe("2026-07-28");
  });

  it("sirve para armar los 7 días que terminan hoy", () => {
    // Es la clave de la tarjeta del panel: al admin le importa lo que
    // se le está pasando, no el calendario de domingo a sábado.
    expect(diasDeLaSemana(restarDias("2026-08-16", 6))).toEqual([
      "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13",
      "2026-08-14", "2026-08-15", "2026-08-16",
    ]);
  });

  it("un lunes, la ventana SÍ alcanza los pendientes de la semana pasada", () => {
    // Con la semana del calendario, el lunes solo se vería dom+lun y
    // todo lo que quedó debiendo la semana anterior desaparecería.
    const lunes = "2026-08-10";
    const ventana = diasDeLaSemana(restarDias(lunes, 6));
    expect(ventana[0]).toBe("2026-08-04");  // martes anterior
    expect(ventana).toContain("2026-08-07"); // viernes anterior
  });
});

describe("rachaDeRegistro — el hábito, no la deuda", () => {
  const HOY = "2026-08-16";
  const d = (fecha: string, estado: string) =>
    ({ fecha, estado, faltan: [] }) as Parameters<typeof rachaDeRegistro>[0][number];

  it("cuenta los días seguidos registrados hasta ayer", () => {
    const dias = [
      d("2026-08-13", "lleno"), d("2026-08-14", "lleno"),
      d("2026-08-15", "lleno"), d("2026-08-16", "hoy"),
    ];
    expect(rachaDeRegistro(dias, HOY)).toBe(3);
  });

  it("hoy sin registrar NO corta la racha: el día sigue abierto", () => {
    // Castigar a las 9 de la mañana a quien todavía no cierra sería
    // exactamente la alarma falsa que estamos evitando.
    const dias = [d("2026-08-15", "lleno"), d("2026-08-16", "hoy")];
    expect(rachaDeRegistro(dias, HOY)).toBe(1);
  });

  it("un día sin registrar sí la corta", () => {
    const dias = [
      d("2026-08-13", "lleno"), d("2026-08-14", "falta"),
      d("2026-08-15", "lleno"), d("2026-08-16", "hoy"),
    ];
    expect(rachaDeRegistro(dias, HOY)).toBe(1);
  });

  it("un día libre no suma ni corta", () => {
    // Atelier libra domingo: no rompió nada quien no debía reportar.
    const dias = [
      d("2026-08-13", "lleno"), d("2026-08-14", "lleno"),
      d("2026-08-15", "dia-libre"), d("2026-08-16", "hoy"),
    ];
    expect(rachaDeRegistro(dias, HOY)).toBe(2);
  });

  it("un día registrado a medias igual cuenta: el registro existe", () => {
    const dias = [d("2026-08-14", "lleno"), d("2026-08-15", "incompleto"), d("2026-08-16", "hoy")];
    expect(rachaDeRegistro(dias, HOY)).toBe(2);
  });
});

describe("mensajeEstadoKpis — lo que lee el administrador al entrar", () => {
  const HOY = "2026-08-16";
  const d = (fecha: string, estado: string, faltan: string[] = []) =>
    ({ fecha, estado, faltan }) as Parameters<typeof rachaDeRegistro>[0][number];

  it("todo al día: confirma, no desaparece", () => {
    // La mitad del pedido de Jahnn era justamente el aviso en positivo.
    const m = mensajeEstadoKpis({ hoy: HOY, dias: [d("2026-08-15", "lleno"), d(HOY, "lleno")] });
    expect(m.tono).toBe("verde");
    expect(m.titulo).toBe("KPIs de hoy registrados");
    expect(m.accion).toBeNull();      // no hay nada que hacer
  });

  it("hoy pendiente: ámbar y sin dramatismo", () => {
    const m = mensajeEstadoKpis({ hoy: HOY, dias: [d("2026-08-15", "lleno"), d(HOY, "hoy")] });
    expect(m.tono).toBe("ambar");
    expect(m.titulo).toBe("KPIs de hoy: aún sin registrar");
    expect(m.detalle).toContain("Todavía estás a tiempo");
    expect(m.accion).toBe(HOY);
  });

  it("un día vencido: rojo y con nombre y apellido", () => {
    const m = mensajeEstadoKpis({ hoy: HOY, dias: [d("2026-08-14", "falta"), d(HOY, "lleno")] });
    expect(m.tono).toBe("rojo");
    expect(m.titulo).toBe("Falta registrar el vie 14");
    expect(m.accion).toBe("2026-08-14");
  });

  it("varios días vencidos: los enumera como los diría una persona", () => {
    const m = mensajeEstadoKpis({
      hoy: HOY,
      dias: [d("2026-08-12", "falta"), d("2026-08-13", "falta"), d("2026-08-14", "falta"), d(HOY, "hoy")],
    });
    expect(m.titulo).toBe("Faltan 3 días por registrar");
    expect(m.detalle).toContain("mié 12, jue 13 y vie 14");
    expect(m.accion).toBe("2026-08-12");   // abre la deuda más vieja
  });

  it("lo VENCIDO manda sobre lo de hoy", () => {
    // Que falte el cierre de hoy a las 3pm es normal; que falte el del
    // miércoles no. Si están las dos cosas, gana la deuda vieja.
    const m = mensajeEstadoKpis({ hoy: HOY, dias: [d("2026-08-12", "falta"), d(HOY, "hoy")] });
    expect(m.tono).toBe("rojo");
    expect(m.titulo).toBe("Falta registrar el mié 12");
  });

  it("registrado a medias: dice QUÉ dato falta", () => {
    const m = mensajeEstadoKpis({
      hoy: HOY,
      dias: [d("2026-08-14", "incompleto", ["NPS"]), d(HOY, "lleno")],
    });
    expect(m.tono).toBe("ambar");
    expect(m.detalle).toBe("Al vie 14 le falta NPS.");
    expect(m.accion).toBe("2026-08-14");
  });

  it("un día libre no se felicita como si hubiera registrado", () => {
    // Atelier libra domingo: decir "KPIs de hoy registrados" sería falso.
    const m = mensajeEstadoKpis({ hoy: HOY, dias: [d("2026-08-15", "lleno"), d(HOY, "dia-libre")] });
    expect(m.tono).toBe("verde");
    expect(m.titulo).toBe("Hoy es día libre");
    expect(m.accion).toBeNull();
  });

  it("un día futuro nunca genera reclamo", () => {
    const m = mensajeEstadoKpis({ hoy: HOY, dias: [d(HOY, "lleno"), d("2026-08-17", "futuro")] });
    expect(m.tono).toBe("verde");
  });
});

describe("mensajeEstadoKpis — Atelier, que se llena con el reporte de Byte", () => {
  const HOY = "2026-08-16";
  const d = (fecha: string, estado: string, faltan: string[] = []) =>
    ({ fecha, estado, faltan }) as Parameters<typeof rachaDeRegistro>[0][number];
  const atelier = (dias: Parameters<typeof rachaDeRegistro>[0]) =>
    mensajeEstadoKpis({ hoy: HOY, dias, modo: "importado" as const });

  it("un día faltante ofrece los DOS caminos: el reporte y el registro a mano", () => {
    // Jahnn pidió que no se descarte la carga manual: por eso el aviso
    // la nombra, en vez de mandar solo a subir el Excel.
    const m = atelier([d("2026-08-14", "falta"), d(HOY, "lleno")]);
    expect(m.tono).toBe("rojo");
    expect(m.titulo).toBe("Falta registrar el vie 14");
    expect(m.detalle).toContain("reporte de Byte");
    expect(m.detalle).toContain("a mano");
    expect(m.accion).toBe("2026-08-14");   // el botón lleva al formulario
  });

  it("varios días faltantes también nombran los dos caminos", () => {
    const m = atelier([d("2026-08-13", "falta"), d("2026-08-14", "falta"), d(HOY, "lleno")]);
    expect(m.detalle).toContain("jue 13 y vie 14");
    expect(m.detalle).toContain("a mano");
  });

  it("hoy pendiente habla del cierre, no de teclear KPIs", () => {
    const m = atelier([d("2026-08-15", "lleno"), d(HOY, "hoy")]);
    expect(m.titulo).toBe("Cierre de hoy: aún sin registrar");
    expect(m.detalle).toContain("También puedes cargarlo a mano");
  });

  it("al día dice 'cierre registrado', no 'KPIs registrados'", () => {
    const m = atelier([d("2026-08-15", "lleno"), d(HOY, "lleno")]);
    expect(m.tono).toBe("verde");
    expect(m.titulo).toBe("Cierre de hoy registrado");
  });

  it("el domingo libre de Atelier no se felicita ni se reclama", () => {
    const m = atelier([d("2026-08-15", "lleno"), d(HOY, "dia-libre")]);
    expect(m.titulo).toBe("Hoy es día libre");
    expect(m.accion).toBeNull();
  });

  it("pasar Atelier a carga manual es cambiar una palabra", () => {
    // El día que Jahnn quiera que Atelier se teclee como Fonavi, se
    // cambia "importado" por "manual" y el aviso habla igual que allá.
    const dias = [d("2026-08-14", "falta"), d(HOY, "lleno")];
    const comoFonavi = mensajeEstadoKpis({ hoy: HOY, dias, modo: "manual" });
    expect(comoFonavi.detalle).toBe("Sin ese día no corren los KPIs, la meta ni el bono.");
    expect(comoFonavi.titulo).toBe(atelier(dias).titulo);   // la regla no cambia
  });

  it("el modo NO cambia qué día falta, solo cómo se dice", () => {
    const dias = [d("2026-08-12", "falta"), d("2026-08-14", "falta"), d(HOY, "hoy")];
    const a = mensajeEstadoKpis({ hoy: HOY, dias, modo: "importado" });
    const b = mensajeEstadoKpis({ hoy: HOY, dias, modo: "manual" });
    expect(a.tono).toBe(b.tono);
    expect(a.titulo).toBe(b.titulo);
    expect(a.accion).toBe(b.accion);
  });
});

describe("días pausados por dirección", () => {
  // El caso real: 22-ago-2026, corte de luz en Centro. Sin esto, ese día
  // le quedaba en rojo a Chari para siempre.
  it("un día pausado no se reclama como falta", () => {
    const sedes = SEDES.map((s) =>
      s.businessId === 3 ? { ...s, diasPausados: ["2026-08-19"] } : s,
    );
    const r = evaluarLlenado({
      weekStart: "2026-08-16", hoy: "2026-08-22", sedes, filas: [],
    });
    const centro = r.sedes.find((s) => s.businessId === 3)!;
    const dia = centro.dias.find((d) => d.fecha === "2026-08-19")!;
    expect(dia.estado).toBe("pausado");
    expect(centro.dias.filter((d) => d.estado === "falta")).not.toContainEqual(dia);
  });

  it("pausar Centro no pausa Fonavi el mismo día", () => {
    const sedes = SEDES.map((s) =>
      s.businessId === 3 ? { ...s, diasPausados: ["2026-08-19"] } : s,
    );
    const r = evaluarLlenado({
      weekStart: "2026-08-16", hoy: "2026-08-22", sedes, filas: [],
    });
    const fonavi = r.sedes.find((s) => s.businessId === 2)!;
    expect(fonavi.dias.find((d) => d.fecha === "2026-08-19")!.estado).toBe("falta");
  });

  it("si el día pausado IGUAL trae datos, se pinta lleno: el dato manda", () => {
    const sedes = SEDES.map((s) =>
      s.businessId === 3 ? { ...s, diasPausados: ["2026-08-19"] } : s,
    );
    const r = evaluarLlenado({
      weekStart: "2026-08-16",
      hoy: "2026-08-22",
      sedes,
      filas: [{ businessId: 3, fecha: "2026-08-19", revenue: 800, nps: 9, mermas: 10 }],
    });
    const centro = r.sedes.find((s) => s.businessId === 3)!;
    expect(centro.dias.find((d) => d.fecha === "2026-08-19")!.estado).toBe("lleno");
  });
});
