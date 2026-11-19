import { describe, expect, it } from "vitest";
import { conteos, erroresAcuerdo, estadoAlCumplir, estadoVisible, ordenAcuerdos, puede, quedaTarde, textoPlazo } from "./acuerdos";

const HOY = "2026-11-19";

describe("estado visible", () => {
  it("vencido lo pone la fecha, solo si sigue abierto", () => {
    expect(estadoVisible({ estado: "pendiente", fechaLimite: "2026-11-18" }, HOY)).toBe("vencido");
    expect(estadoVisible({ estado: "en_proceso", fechaLimite: "2026-11-18" }, HOY)).toBe("vencido");
    expect(estadoVisible({ estado: "pendiente", fechaLimite: HOY }, HOY)).toBe("pendiente");
    // Ya lo entregó el responsable: no se le acusa de vencido mientras la dirección confirma.
    expect(estadoVisible({ estado: "por_confirmar", fechaLimite: "2026-11-01" }, HOY)).toBe("por_confirmar");
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
  it("el responsable avanza lo suyo; no confirma", () => {
    expect(puede({ clave: "u:4", tipo: "admin" }, a, "avanzar")).toBe(true);
    expect(puede({ clave: "u:4", tipo: "admin" }, { ...a, estado: "por_confirmar" }, "confirmar")).toBe(false);
    expect(puede({ clave: "u:4", tipo: "admin" }, a, "editar")).toBe(false);
  });
  it("otro admin no toca lo ajeno", () => {
    expect(puede({ clave: "u:5", tipo: "admin" }, a, "avanzar")).toBe(false);
    expect(puede({ clave: "u:5", tipo: "admin" }, a, "comentar")).toBe(false);
  });
  it("la dirección confirma y edita; quien lo creó también edita", () => {
    expect(puede({ clave: "u:2", tipo: "direccion" }, { ...a, estado: "por_confirmar" }, "confirmar")).toBe(true);
    expect(puede({ clave: "u:7", tipo: "equipo" }, { ...a, creadoPorClave: "u:7" }, "editar")).toBe(true);
    expect(puede({ clave: "u:7", tipo: "equipo" }, a, "editar")).toBe(false);
  });
  it("lo anulado no se toca y lo cumplido no se edita", () => {
    expect(puede({ clave: "jahnn", tipo: "direccion" }, { ...a, estado: "anulado" }, "comentar")).toBe(false);
    expect(puede({ clave: "jahnn", tipo: "direccion" }, { ...a, estado: "cumplido" }, "editar")).toBe(false);
  });
  it("si el responsable es de la dirección, su cumplido vale directo", () => {
    expect(estadoAlCumplir("direccion")).toBe("cumplido");
    expect(estadoAlCumplir("admin")).toBe("por_confirmar");
  });
});

describe("orden y conteos", () => {
  const lista = [
    { id: 1, estado: "cumplido" as const, fechaLimite: "2026-11-10" },
    { id: 2, estado: "pendiente" as const, fechaLimite: "2026-11-25" },
    { id: 3, estado: "pendiente" as const, fechaLimite: "2026-11-17" },
    { id: 4, estado: "por_confirmar" as const, fechaLimite: "2026-11-20" },
    { id: 5, estado: "en_proceso" as const, fechaLimite: HOY },
  ];
  it("vencidos primero, luego por confirmar, luego por fecha; cerrados al final", () => {
    expect(ordenAcuerdos(lista, HOY).map((a) => a.id)).toEqual([3, 4, 5, 2, 1]);
  });
  it("cuenta abiertos, vencidos, por confirmar y los que vencen hoy", () => {
    expect(conteos(lista, HOY)).toEqual({ abiertos: 3, vencidos: 1, porConfirmar: 1, venceHoy: 1 });
  });
});
