/**
 * Rastreador de cada puesto, estilo pedido de delivery (11-oct-2026).
 * Lo que se clava: qué paso es el actual, cuándo se pone en alerta y qué
 * frase ve cada uno — no la forma del componente.
 */
import { describe, it, expect } from "vitest";
import { seguimientoAdministrador, armar, type EntradaSemanaSede } from "../seguimiento";

// Semana del lunes 12 al domingo 18 de octubre de 2026.
const MIE = "2026-10-14";
const SAB = "2026-10-17";
const DOM = "2026-10-18";

const sede = (over: Partial<EntradaSemanaSede> = {}): EntradaSemanaSede => ({
  hoy: MIE,
  highlight: { texto: "Ordenar la vitrina de la mañana", estado: "pendiente" },
  faltan: [],
  incompletos: [],
  reportes: [
    { nombre: "Ventas del mes", ultimaCarga: "2026-10-10" },
    { nombre: "Platos con Mayor Rotación", ultimaCarga: "2026-10-10" },
    { nombre: "Cortesías", ultimaCarga: "2026-10-10" },
    { nombre: "Ventas por Trabajador", ultimaCarga: "2026-10-10" },
  ],
  modo: "manual",
  ...over,
});

describe("administrador", () => {
  it("a mitad de semana y al día: el paso actual son los reportes del sábado, sin alarma", () => {
    const s = seguimientoAdministrador(sede());
    expect(s.pasos.map((p) => p.estado)).toEqual(["hecho", "hecho", "actual", "pendiente"]);
    expect(s.tono).toBe("normal");
    expect(s.pasos[2].detalle).toBe("toca el sábado");
    expect(s.mensaje).toContain("«Ordenar la vitrina de la mañana»");
    expect(s.mensaje).toContain("El sábado 17");
  });

  it("un día sin registrar manda sobre todo lo demás, con el botón para registrarlo", () => {
    const s = seguimientoAdministrador(sede({ faltan: ["2026-10-13"] }));
    expect(s.tono).toBe("alerta");
    expect(s.indiceActual).toBe(1);
    expect(s.pasos[1]).toMatchObject({ detalle: "falta mar 13", alerta: true });
    expect(s.pasos[1].accion).toMatchObject({ evento: "registrar", texto: "Registrar el mar 13" });
    expect(s.mensaje).toContain("Falta registrar el mar 13");
  });

  it("Atelier: el día llega con el Reporte de Ventas, y el aviso lo dice", () => {
    expect(seguimientoAdministrador(sede({ faltan: ["2026-10-13"], modo: "importado" })).mensaje).toContain("Reporte de Ventas");
  });

  it("el sábado pide los reportes que faltan, por nombre", () => {
    const s = seguimientoAdministrador(sede({
      hoy: SAB,
      reportes: [
        { nombre: "Ventas del mes", ultimaCarga: SAB },
        { nombre: "Cortesías", ultimaCarga: "2026-10-10" },
      ],
    }));
    expect(s.tono).toBe("normal");
    expect(s.pasos[2].detalle).toBe("1 de 2");
    expect(s.mensaje).toBe("Hoy toca subir los reportes de Byte: falta Cortesías. Del 1 del mes a hoy, todos juntos.");
    expect(s.pasos[2].accion?.texto).toBe("Subir reportes de Byte");
  });

  it("el domingo, si no se subieron, ya es alerta", () => {
    const s = seguimientoAdministrador(sede({ hoy: DOM }));
    expect(s.tono).toBe("alerta");
    expect(s.pasos[2].alerta).toBe(true);
    expect(s.mensaje).toMatch(/^Ayer tocaba subir los reportes de Byte: los 4/);
  });

  it("con todo subido, lo último es cerrar el Highlight", () => {
    const todos = sede().reportes.map((r) => ({ ...r, ultimaCarga: SAB }));
    const s = seguimientoAdministrador(sede({ hoy: SAB, reportes: todos }));
    expect(s.indiceActual).toBe(3);
    expect(s.pasos[3].accion).toMatchObject({ evento: "highlight" });
    expect(s.mensaje).toContain("cerrar tu Highlight");
  });

  it("semana entregada: todo en verde y la barra completa", () => {
    const todos = sede().reportes.map((r) => ({ ...r, ultimaCarga: SAB }));
    const s = seguimientoAdministrador(sede({ hoy: DOM, reportes: todos, highlight: { texto: "x", estado: "logrado" } }));
    expect(s.tono).toBe("listo");
    expect(s.avance).toBe(1);
    expect(s.pasos.every((p) => p.estado === "hecho")).toBe(true);
    expect(s.mensaje).toContain("Semana entregada. El lunes 19");
  });

  it("sin Highlight asignado no es culpa del administrador: ese paso no lo frena", () => {
    const todos = sede().reportes.map((r) => ({ ...r, ultimaCarga: SAB }));
    const s = seguimientoAdministrador(sede({ hoy: SAB, reportes: todos, highlight: null }));
    expect(s.pasos[0].detalle).toBe("sin Highlight");
    expect(s.tono).toBe("listo");
  });

  it("solo el paso actual ofrece botón", () => {
    const s = seguimientoAdministrador(sede({ faltan: ["2026-10-13"] }));
    expect(s.pasos.filter((p) => p.accion).map((p) => p.clave)).toEqual(["registro"]);
  });
});

describe("armar", () => {
  it("la barra avanza con el paso actual y llega a 1 al terminar", () => {
    const paso = (hecho: boolean) => ({ clave: "x", titulo: "x", cuando: "x", hecho, alerta: false, detalle: null, accion: null });
    expect(armar("t", [paso(true), paso(false), paso(false)], "m", "normal").avance).toBe(0.5);
    expect(armar("t", [paso(true), paso(true)], "m", "normal").avance).toBe(1);
  });
});
