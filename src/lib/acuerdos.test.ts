import { describe, expect, it } from "vitest";
import { ordenAcuerdos as orden2, avancePorEstado, cargaEquipo, resumenSemanal, alertaDe, conAlerta, cajaDe, conteos, erroresAcuerdo, indicadores, mesesHasta, periodoMes, resumir, type AcuerdoIndicador, estadoVisible, ordenAcuerdos, puede, quedaTarde, textoPlazo, limpiarApoyos, nombreConApoyos } from "./acuerdos";

const HOY = "2026-11-19";

describe("estado visible", () => {
  it("vencido lo pone la fecha, solo si sigue abierto", () => {
    expect(estadoVisible({ estado: "pendiente", fechaLimite: "2026-11-18" }, HOY)).toBe("vencido");
    expect(estadoVisible({ estado: "en_proceso", fechaLimite: "2026-11-18" }, HOY)).toBe("vencido");
    expect(estadoVisible({ estado: "pendiente", fechaLimite: HOY }, HOY)).toBe("pendiente");
    expect(estadoVisible({ estado: "cumplido", fechaLimite: "2026-11-01" }, HOY)).toBe("cumplido");
  });

  it("textos del plazo", () => {
    expect(textoPlazo(HOY, HOY)).toBe("vence hoy");
    expect(textoPlazo("2026-11-20", HOY)).toBe("vence mañana");
    expect(textoPlazo("2026-11-25", HOY)).toBe("en 6 días");
    expect(textoPlazo("2026-11-16", HOY)).toBe("venció hace 3 días");
  });
});

describe("tarde es pegajoso", () => {
  it("marcar después de la fecha es tarde; una vez tarde, sigue tarde", () => {
    expect(quedaTarde(false, "2026-11-18", HOY)).toBe(true);
    expect(quedaTarde(false, HOY, HOY)).toBe(false);
    expect(quedaTarde(true, "2026-12-30", HOY)).toBe(true);
  });
});

describe("validar un acuerdo nuevo", () => {
  const claves = new Set(["jahnn", "u:4"]);
  it("pide qué, área, responsable y fecha no pasada", () => {
    expect(erroresAcuerdo({ que: "Cambiar el letrero", area: "marketing", responsable: "u:4", fechaLimite: HOY }, HOY, claves)).toEqual([]);
    const e = erroresAcuerdo({ que: "x", area: "ventas", responsable: "u:9", fechaLimite: "2026-11-01" }, HOY, claves);
    expect(e).toHaveLength(4);
  });
});

describe("permisos", () => {
  const a = { responsableClave: "u:4", creadoPorClave: "jahnn", estado: "pendiente" as const };
  it("el responsable cambia el estado de lo suyo, también para reabrir un Hecho", () => {
    expect(puede({ clave: "u:4", tipo: "admin" }, a, "avanzar")).toBe(true);
    expect(puede({ clave: "u:4", tipo: "admin" }, { ...a, estado: "cumplido" }, "avanzar")).toBe(true);
    expect(puede({ clave: "u:4", tipo: "admin" }, a, "editar")).toBe(false);
  });
  it("otro admin no toca lo ajeno", () => {
    expect(puede({ clave: "u:5", tipo: "admin" }, a, "avanzar")).toBe(false);
    expect(puede({ clave: "u:5", tipo: "admin" }, a, "comentar")).toBe(false);
  });
  it("la dirección cambia el estado y edita; quien lo creó también edita", () => {
    expect(puede({ clave: "u:2", tipo: "direccion" }, a, "avanzar")).toBe(true);
    expect(puede({ clave: "u:7", tipo: "equipo" }, { ...a, creadoPorClave: "u:7" }, "editar")).toBe(true);
    expect(puede({ clave: "u:7", tipo: "equipo" }, a, "editar")).toBe(false);
  });
  it("lo anulado no se toca y lo cumplido no se edita", () => {
    expect(puede({ clave: "jahnn", tipo: "direccion" }, { ...a, estado: "anulado" }, "comentar")).toBe(false);
    expect(puede({ clave: "jahnn", tipo: "direccion" }, { ...a, estado: "cumplido" }, "editar")).toBe(false);
  });
});

describe("orden y conteos", () => {
  const lista = [
    { id: 1, estado: "cumplido" as const, fechaLimite: "2026-11-10" },
    { id: 2, estado: "pendiente" as const, fechaLimite: "2026-11-25" },
    { id: 3, estado: "pendiente" as const, fechaLimite: "2026-11-17" },
    { id: 4, estado: "en_proceso" as const, fechaLimite: "2026-11-20" },
    { id: 5, estado: "en_proceso" as const, fechaLimite: HOY },
  ];
  it("vencidos primero, luego por fecha; cerrados al final", () => {
    expect(ordenAcuerdos(lista, HOY).map((a) => a.id)).toEqual([3, 5, 4, 2, 1]);
  });
  it("cuenta abiertos, vencidos y los que vencen hoy", () => {
    expect(conteos(lista, HOY)).toEqual({ abiertos: 4, vencidos: 1, venceHoy: 1 });
  });
});

describe("indicadores de cumplimiento", () => {
  const mk = (id: number, o: Partial<AcuerdoIndicador>): AcuerdoIndicador & { id: number } => ({
    id, estado: "pendiente", fechaLimite: "2026-11-10", tarde: false, area: "marketing", responsableClave: "u:1", responsableNombre: "Ana", ...o,
  });
  it("cada acuerdo cae en su caja", () => {
    expect(cajaDe(mk(1, { estado: "cumplido" }), HOY)).toBe("a_tiempo");
    expect(cajaDe(mk(1, { estado: "cumplido", tarde: true }), HOY)).toBe("tarde");
    expect(cajaDe(mk(1, {}), HOY)).toBe("vencido");
    expect(cajaDe(mk(1, { fechaLimite: "2026-11-25" }), HOY)).toBe("en_plazo");
    expect(cajaDe(mk(1, { estado: "anulado" }), HOY)).toBe("fuera");
  });
  it("sin nada que juzgar es null, no 0%", () => {
    expect(resumir([mk(1, { fechaLimite: "2026-11-30" })], HOY).pctATiempo).toBeNull();
    expect(resumir([], HOY).pctCumplido).toBeNull();
  });
  it("por responsable y por área, peor primero, solo lo que vence en el periodo", () => {
    const lista = [
      mk(1, { estado: "cumplido" }),
      mk(2, { estado: "cumplido", tarde: true }),
      mk(3, { responsableClave: "u:2", responsableNombre: "Luis", area: "operaciones" }),
      mk(4, { responsableClave: "u:2", responsableNombre: "Luis", area: "operaciones", estado: "cumplido" }),
      mk(5, { fechaLimite: "2026-10-05" }), // otro mes
      mk(6, { estado: "anulado" }),
    ];
    const r = indicadores(lista, HOY, periodoMes("2026-11"));
    expect(r.total).toMatchObject({ aTiempo: 2, tarde: 1, vencidos: 1, juzgados: 4, pctATiempo: 50, pctCumplido: 75 });
    expect(r.porResponsable.map((x) => [x.nombre, x.pctATiempo])).toEqual([["Luis", 50], ["Ana", 50]]); // empate: primero quien tiene vencidos
    expect(r.porArea.map((x) => x.nombre)).toEqual(["Operaciones", "Marketing"]);
  });
  it("meses y periodos", () => {
    expect(periodoMes("2026-02")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
    expect(mesesHasta("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});

describe("alertas en pantalla", () => {
  const base = { estado: "pendiente" as const, fechaLimite: "2026-11-25", creadoDia: "2026-11-01" };
  it("la más urgente gana", () => {
    expect(alertaDe({ ...base, fechaLimite: "2026-11-18" }, HOY)).toBe("vencido");
    expect(alertaDe({ ...base, fechaLimite: HOY }, HOY)).toBe("hoy");
    expect(alertaDe({ ...base, fechaLimite: "2026-11-20" }, HOY)).toBe("manana");
    expect(alertaDe({ ...base, creadoDia: "2026-11-18" }, HOY)).toBe("nuevo");
    expect(alertaDe({ ...base, estado: "en_proceso", creadoDia: "2026-11-18" }, HOY)).toBeNull();
    expect(alertaDe(base, HOY)).toBeNull();
    expect(alertaDe({ ...base, estado: "cumplido", fechaLimite: "2026-11-01" }, HOY)).toBeNull();
  });
  it("ordena por urgencia", () => {
    const l = [{ ...base, id: 1, fechaLimite: "2026-11-20" }, { ...base, id: 2, fechaLimite: "2026-11-10" }, { ...base, id: 3, fechaLimite: HOY }];
    expect(conAlerta(l, HOY).map((x) => x.a.id)).toEqual([2, 3, 1]);
  });
});

describe("resumen semanal", () => {
  // Reunión del lunes 23-nov: semana cerrada dom 15 → sáb 21.
  const hoyL = "2026-11-23";
  const sem = { desde: "2026-11-15", hasta: "2026-11-21" };
  const a = (id: number, o: Partial<import("./acuerdos").AcuerdoResumen>) => ({
    id, que: `Tarea ${id}`, estado: "pendiente" as const, fechaLimite: "2026-11-18", tarde: false, area: "operaciones" as const,
    responsableClave: "u:1", responsableNombre: "Luis", creadoDia: "2026-11-16", ...o,
  });
  const lista = [
    a(1, {}), // vencido (5 días)
    a(2, { fechaLimite: "2026-11-05", creadoDia: "2026-11-01" }), // vencido de antes (18 días)
    a(3, { estado: "cumplido", responsableClave: "u:2", responsableNombre: "Ana" }),
    a(4, { estado: "cumplido", responsableClave: "u:2", responsableNombre: "Ana", fechaLimite: "2026-11-20" }),
    a(5, { fechaLimite: "2026-11-24" }), // vence esta semana
    a(6, { fechaLimite: "2026-11-12", estado: "cumplido", creadoDia: "2026-11-02" }), // semana anterior, a tiempo
    a(7, { estado: "anulado" }),
  ];
  const r = resumenSemanal(lista, [{ fecha: "2026-11-16", titulo: "Marketing", area: "marketing" }, { fecha: "2026-11-09", titulo: "Vieja", area: "finanzas" }], hoyL, sem);
  it("cifras de la semana y comparación", () => {
    expect(r.cumplimiento).toMatchObject({ aTiempo: 2, vencidos: 1, juzgados: 3, pctATiempo: 67 });
    expect(r.pctAnterior).toBe(100);
  });
  it("vencidos arrastrados, próximos, reuniones y nuevos", () => {
    expect(r.arrastrados.map((x) => [x.id, x.diasAtraso])).toEqual([[2, 18], [1, 5]]);
    expect(r.proximos.map((x) => x.id)).toEqual([5]);
    expect(r.reuniones.map((x) => x.titulo)).toEqual(["Marketing"]);
    expect(r.nuevos).toBe(4);
  });
  it("recomienda con nombre y en orden", () => {
    expect(r.recomendaciones[0]).toMatch(/^Habla con Luis: tiene 2 acuerdos vencidos, el más antiguo hace 18 días/);
    expect(r.recomendaciones).toHaveLength(1);
  });
  it("sin nada pendiente, lo dice", () => {
    expect(resumenSemanal([], [], hoyL, sem).recomendaciones[0]).toMatch(/^Sin acuerdos que vencieran/);
  });
});

describe("carga del equipo y avance por estado", () => {
  const x = (estado: "pendiente" | "en_proceso" | "cumplido" | "anulado", fechaLimite: string, clave = "u:1", nombre = "Luis") =>
    ({ estado, fechaLimite, responsableClave: clave, responsableNombre: nombre });
  const l = [x("pendiente", "2026-11-10"), x("en_proceso", "2026-11-25"), x("pendiente", "2026-11-30", "u:2", "Ana"),
    x("cumplido", "2026-11-12", "u:2", "Ana"), x("cumplido", "2026-09-01"), x("cumplido", "2026-11-18"), x("anulado", "2026-11-18")];
  it("reparte lo abierto por persona", () => {
    expect(cargaEquipo(l, HOY)).toEqual([
      { clave: "u:1", nombre: "Luis", abiertos: 2, vencidos: 1, pct: 67 },
      { clave: "u:2", nombre: "Ana", abiertos: 1, vencidos: 0, pct: 33 },
    ]);
  });
  it("cuenta por estado y deja fuera lo cerrado viejo y lo anulado", () => {
    const r = avancePorEstado(l, HOY);
    expect(r.conteo).toEqual({ cumplido: 2, en_proceso: 1, vencido: 1, pendiente: 1 });
    expect(r.pctCumplido).toBe(40);
    expect(avancePorEstado([], HOY).pctCumplido).toBeNull();
  });
});

describe("prioridad", () => {
  it("dentro del mismo grupo, Alta primero; sin prioridad cuenta como Media", () => {
    const l = [
      { id: 1, estado: "pendiente" as const, fechaLimite: "2026-11-21" },
      { id: 2, estado: "pendiente" as const, fechaLimite: "2026-11-28", prioridad: "alta" as const },
      { id: 3, estado: "pendiente" as const, fechaLimite: "2026-11-20", prioridad: "baja" as const },
      { id: 4, estado: "pendiente" as const, fechaLimite: "2026-11-10", prioridad: "baja" as const },
    ];
    expect(orden2(l, HOY).map((a) => a.id)).toEqual([4, 2, 1, 3]);
  });
});

describe("apoyos (23-nov-2026)", () => {
  const claves = new Set(["jahnn", "kelly", "u:3", "u:6"]);
  it("limpia: sin el principal, sin repetidos y solo personas que existen", () => {
    expect(limpiarApoyos(["u:3", "jahnn", "u:3", "u:99", "u:6"], "jahnn", claves)).toEqual(["u:3", "u:6"]);
    expect(limpiarApoyos(undefined, "jahnn", claves)).toEqual([]);
  });
  it("«Nombre + N» solo cuando hay apoyos", () => {
    expect(nombreConApoyos({ responsableNombre: "Luana", apoyoNombres: [] })).toBe("Luana");
    expect(nombreConApoyos({ responsableNombre: "Luana", apoyoNombres: ["Sol", "Chari"] })).toBe("Luana + 2");
  });
  it("un apoyo avanza y comenta, pero no edita ni anula", () => {
    const a = { responsableClave: "u:3", creadoPorClave: "jahnn", estado: "pendiente" as const, apoyoClaves: ["u:6"] };
    const yo = { clave: "u:6", tipo: "admin" as const };
    expect(puede(yo, a, "avanzar")).toBe(true);
    expect(puede(yo, a, "comentar")).toBe(true);
    expect(puede(yo, a, "editar")).toBe(false);
    expect(puede(yo, a, "anular")).toBe(false);
    expect(puede({ clave: "u:9", tipo: "admin" }, a, "avanzar")).toBe(false);
  });
});
