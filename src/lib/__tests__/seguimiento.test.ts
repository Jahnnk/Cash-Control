/**
 * Rastreador de cada puesto, estilo pedido de delivery (11-oct-2026).
 * Lo que se clava: qué paso es el actual, cuándo se pone en alerta y qué
 * frase ve cada uno — no la forma del componente.
 */
import { describe, it, expect } from "vitest";
import { seguimientoAdministrador, seguimientoCeoSemana, seguimientoCeoMes, armar, type EntradaSemanaSede } from "../seguimiento";

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

describe("CEO · semana", () => {
  const sedesAlDia = (hoy: string) => ["Fonavi", "Centro", "Atelier"].map((n) => ({
    sede: n, seguimiento: seguimientoAdministrador(sede({ hoy, reportes: sede().reportes.map((r) => ({ ...r, ultimaCarga: hoy >= SAB ? SAB : r.ultimaCarga })) })),
  }));
  const base = {
    hoy: "2026-10-12", semanaRevision: { desde: "2026-10-05", hasta: "2026-10-11" }, revisada: false,
    highlights: [{ sede: "Fonavi", asignado: false }, { sede: "Centro", asignado: false }, { sede: "Atelier", asignado: false }],
    porDefinir: 0, propuestas: 0,
  };

  it("el lunes recuerda revisar y asignar, sin alarma todavía", () => {
    const s = seguimientoCeoSemana({ ...base, sedes: sedesAlDia(base.hoy) });
    expect(s.tono).toBe("normal");
    expect(s.indiceActual).toBe(0);
    expect(s.mensaje).toBe("Hoy es lunes: revisa la semana del 5 al 11 oct y deja el Highlight de cada sede.");
    expect(s.pasos[0].accion).toMatchObject({ href: "/grupo/direccion?vista=control" });
  });

  it("el martes sin revisión ya es alerta", () => {
    const s = seguimientoCeoSemana({ ...base, hoy: "2026-10-13", sedes: sedesAlDia("2026-10-13") });
    expect(s.tono).toBe("alerta");
    expect(s.pasos[0].alerta).toBe(true);
  });

  it("nombra la sede atrasada y por qué", () => {
    const sedes = sedesAlDia(MIE);
    sedes[2] = { sede: "Atelier", seguimiento: seguimientoAdministrador(sede({ faltan: ["2026-10-13"] })) };
    const s = seguimientoCeoSemana({
      ...base, hoy: MIE, revisada: true, highlights: base.highlights.map((h) => ({ ...h, asignado: true })), sedes,
    });
    expect(s.pasos[3]).toMatchObject({ detalle: "2 de 3", alerta: true });
    expect(s.mensaje).toContain("Atelier está atrasada: Atelier, falta mar 13");
  });

  it("los pendientes de Por definir y propuestas se cuentan juntos", () => {
    const s = seguimientoCeoSemana({
      ...base, hoy: MIE, revisada: true, highlights: base.highlights.map((h) => ({ ...h, asignado: true })),
      porDefinir: 3, propuestas: 1, sedes: sedesAlDia(MIE),
    });
    expect(s.pasos[2].detalle).toBe("3 por definir · 1 propuesta");
    expect(s.pasos[2].accion).toMatchObject({ href: "/grupo/por-definir" });
  });

  it("semana en orden cuando todo está hecho y las sedes subieron el sábado", () => {
    const s = seguimientoCeoSemana({
      ...base, hoy: SAB, revisada: true, highlights: base.highlights.map((h) => ({ ...h, asignado: true })), sedes: sedesAlDia(SAB),
    });
    expect(s.tono).toBe("listo");
  });
});

describe("CEO · mes", () => {
  const base = { hoy: "2026-10-11", totalSedes: 3, presupuestoMes: 3, presupuestoSiguiente: 0, cierreMarcados: 4, cierreTotal: 12, menorAnterior: 3 };

  it("el día 11 el cierre del mes anterior ya está vencido", () => {
    const s = seguimientoCeoMes(base);
    expect(s.indiceActual).toBe(1);
    expect(s.tono).toBe("alerta");
    expect(s.mensaje).toBe("El cierre de setiembre se pasó del día 10: van 4 de 12 puntos.");
  });

  it("antes del día 10 solo lo recuerda", () => {
    expect(seguimientoCeoMes({ ...base, hoy: "2026-10-05" }).tono).toBe("normal");
  });

  it("sin presupuesto del mes, eso va primero", () => {
    const s = seguimientoCeoMes({ ...base, presupuestoMes: 1 });
    expect(s.indiceActual).toBe(0);
    expect(s.mensaje).toContain("2 sedes no tienen presupuesto aprobado");
  });

  it("los últimos días del mes avisa del presupuesto siguiente", () => {
    const s = seguimientoCeoMes({ ...base, hoy: "2026-10-28", cierreMarcados: 12 });
    expect(s.pasos[3].alerta).toBe(true);
    expect(s.mensaje).toContain("Faltan pocos días para noviembre");
  });

  it("mes en orden", () => {
    expect(seguimientoCeoMes({ ...base, cierreMarcados: 12, presupuestoSiguiente: 3 }).tono).toBe("listo");
  });
});

describe("armar", () => {
  it("la barra avanza con el paso actual y llega a 1 al terminar", () => {
    const paso = (hecho: boolean) => ({ clave: "x", titulo: "x", cuando: "x", hecho, alerta: false, detalle: null, accion: null });
    expect(armar("t", [paso(true), paso(false), paso(false)], "m", "normal").avance).toBe(0.5);
    expect(armar("t", [paso(true), paso(true)], "m", "normal").avance).toBe(1);
  });
});
