/** El menú lateral por secciones (rediseño UX, 8-oct-2026), respetando los órdenes que pidió Jahnn. */
import { describe, it, expect, vi } from "vitest";
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/grupo/dashboard" }));
vi.mock("@/app/actions/role", () => ({ clearRole: vi.fn() }));
import { MENU, navPara } from "./sidebar";

const segmentos = (s: Parameters<typeof navPara>[0]) => navPara(s).map((i) => i.segment);

describe("menú lateral", () => {
  it("Grupo: Reportes justo debajo de Dashboard y Productos justo debajo de Sistema de Dirección (pedidos de Jahnn)", () => {
    const g = segmentos("grupo");
    expect(g.slice(0, 4)).toEqual(["dashboard", "reportes", "direccion", "productos"]);
  });

  it("Grupo agrupa por para qué se entra y no pierde ninguna pantalla", () => {
    expect(MENU.grupo.map((s) => s.titulo)).toEqual([null, "Dirección", "Equipo", "Datos"]);
    const g = segmentos("grupo");
    for (const s of ["dashboard", "reportes", "direccion", "productos", "presupuesto", "highlight", "supervisiones", "incentivos", "recetas", "por-definir", "configuracion"]) {
      expect(g.filter((x) => x === s), s).toHaveLength(1);
    }
    expect(g).toHaveLength(11);
  });

  it("las sedes: lo principal arriba y Configuración al final; solo Atelier tiene Clientes y lo de antes va en Datos", () => {
    for (const sede of ["fonavi", "centro", "atelier"] as const) {
      const m = segmentos(sede);
      expect(m.slice(0, 2)).toEqual(["dashboard", "panel"]);
      expect(m[m.length - 1]).toBe("configuracion");
      for (const s of ["registro", "propinas", "reportes", "productos", "presupuesto"]) expect(m.filter((x) => x === s), `${sede} ${s}`).toHaveLength(1);
    }
    expect(segmentos("atelier")).toEqual(expect.arrayContaining(["clientes", "fonavi", "prestamos-socio"]));
    expect(segmentos("fonavi")).not.toContain("clientes");
    // Registro manual, abajo del todo (antes de Configuración): desde agosto todo entra con el Excel.
    for (const sede of ["fonavi", "centro"] as const) expect(segmentos(sede).slice(-2)).toEqual(["registro", "configuracion"]);
    expect(segmentos("atelier").slice(-4)).toEqual(["registro", "fonavi", "prestamos-socio", "configuracion"]);
    expect(MENU.atelier.map((s) => s.titulo)).not.toContain("Clientes");
    expect(segmentos("centro")).toHaveLength(8);
    expect(segmentos("atelier")).toHaveLength(11);
  });
});
