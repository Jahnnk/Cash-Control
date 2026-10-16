import { describe, expect, test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PorQueMonto } from "./por-que-monto";
import { explicarBono } from "@/lib/incentives/explicacion-bono";
import type { IncentiveLevel, StaffMember } from "@/lib/incentives/engine";

const N1: IncentiveLevel = { nombre: "Nivel 1", delta: 1.5, bono_mt: 24, bono_tc: 48, bono_admin: 89, premio_mv: 68 };
const equipo: StaffMember[] = [
  { name: "Dagnia", jornada: "administrador", area: "salon", active: true, horasSemanales: null, horasMesTrabajadas: 192 },
  { name: "Alisson", jornada: "medio_turno", area: "salon", active: true, horasSemanales: null, horasMesTrabajadas: 94 },
];
const x = explicarBono({ staff: equipo, levels: [N1], porNivel: [{ level: N1, pozoNivel: 300, colchon: 300 - 181 }], excluidos: [{ nombre: "Luana", motivo: "marketing, no participa" }], usaTrabajadas: true });

describe("tarjeta «¿Por qué este monto?»", () => {
  test("cerrada solo invita a abrir: no muestra cuentas", () => {
    const html = renderToStaticMarkup(createElement(PorQueMonto, { x, nivelActual: null }));
    expect(html).toContain("¿Por qué este monto?");
    expect(html).not.toContain("Se paga por horas");
  });

  test("abierta: el total, la tarifa por hora, cada persona, el premio, quién no entra y si alcanza el pozo", () => {
    const html = renderToStaticMarkup(createElement(PorQueMonto, { x, nivelActual: "Nivel 1", abiertaAlInicio: true }));
    for (const t of ["Se paga por horas", "S/0.26", "Dagnia", "puesto fijo", "Alisson", "94 h", "Premio al mejor vendedor", "No entran al reparto", "Luana", "Alcanza"]) {
      expect(html).toContain(t);
    }
    expect(html).toContain("sobran");
  });

  test("si el pozo no cubre los bonos lo dice con claridad, sin disfrazarlo", () => {
    const corto = explicarBono({ staff: equipo, levels: [N1], porNivel: [{ level: N1, pozoNivel: 100, colchon: 100 - 181 }], excluidos: [], usaTrabajadas: true });
    const html = renderToStaticMarkup(createElement(PorQueMonto, { x: corto, nivelActual: "Nivel 1", abiertaAlInicio: true }));
    expect(html).toContain("No alcanza");
    expect(html).toContain("faltan");
  });
});
