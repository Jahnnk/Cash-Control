import { describe, expect, it } from "vitest";
import { botonesPara, perfilDesdeScope } from "../puerta";

const apps = (p: Parameters<typeof botonesPara>[0]) => botonesPara(p).map((b) => b.app);

describe("puerta única: cada uno ve solo lo que usa", () => {
  it("la dirección ve las 5 apps", () => {
    expect(new Set(apps({ tipo: "direccion" }))).toEqual(new Set(["cash", "caja", "envios", "planilla", "produccion"]));
  });
  it("el admin de Atelier usa las 5; Fonavi y Centro no ven Producción", () => {
    expect(apps({ tipo: "admin", sede: "atelier" })).toEqual(["cash", "caja", "envios", "planilla", "produccion"]);
    expect(apps({ tipo: "admin", sede: "fonavi" })).toEqual(["cash", "caja", "envios", "planilla"]);
    expect(botonesPara({ tipo: "admin", sede: "centro" })[0].href).toBe("/centro/panel");
  });
  it("marketing (equipo) solo tareas; lector solo mirar", () => {
    expect(botonesPara({ tipo: "equipo" }).map((b) => b.href)).toEqual(["/grupo/acuerdos"]);
    expect(apps({ tipo: "lector" })).toEqual(["cash", "cash"]);
  });
  it("la gerencia de finanzas: sin Producción", () => {
    expect(apps({ tipo: "finanzas" })).toEqual(["cash", "cash", "cash", "caja", "envios", "planilla"]);
    expect(perfilDesdeScope("finanzas")).toEqual({ tipo: "finanzas" });
  });
  it("scope de la sesión → perfil", () => {
    expect(perfilDesdeScope("admin-fonavi")).toEqual({ tipo: "admin", sede: "fonavi" });
    expect(perfilDesdeScope("direccion-kelly")).toEqual({ tipo: "direccion" });
    expect(perfilDesdeScope("verif-centro")).toEqual({ tipo: "verif", sede: "centro" });
    expect(perfilDesdeScope("raro")).toBeNull();
  });
});
