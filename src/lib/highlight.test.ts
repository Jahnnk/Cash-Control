/**
 * Tests del Highlight diario.
 *
 * Lo que se clava acá son las DECISIONES de la metodología, no el
 * cálculo por el cálculo: un día sin Highlight asignado no le corta la
 * racha al administrador, y el % de cumplimiento se mide sobre lo
 * cerrado y no sobre lo que todavía está en curso.
 */
import { describe, it, expect } from "vitest";
import {
  calcularRacha,
  calcularCumplimiento,
  tieneReflect,
  validarTexto,
  etiquetaEstado,
  MAX_TEXTO,
  type HighlightDia,
} from "./highlight";

const d = (fecha: string, estado: HighlightDia["estado"]): HighlightDia => ({ fecha, estado });

describe("calcularRacha", () => {
  it("cuenta los días cumplidos seguidos desde el más reciente", () => {
    expect(
      calcularRacha([
        d("2026-08-10", "logrado"),
        d("2026-08-09", "logrado"),
        d("2026-08-08", "logrado"),
        d("2026-08-07", "no_logrado"),
      ]),
    ).toBe(3);
  });

  it("no depende del orden en que lleguen los días", () => {
    const desordenados = [
      d("2026-08-08", "logrado"),
      d("2026-08-10", "logrado"),
      d("2026-08-09", "logrado"),
    ];
    expect(calcularRacha(desordenados)).toBe(3);
  });

  it("un día no logrado corta la racha", () => {
    expect(calcularRacha([d("2026-08-10", "no_logrado"), d("2026-08-09", "logrado")])).toBe(0);
  });

  it("un día aún pendiente no cuenta como cumplido", () => {
    // Hoy todavía no cerró: no se puede afirmar que se logró.
    expect(calcularRacha([d("2026-08-10", "pendiente"), d("2026-08-09", "logrado")])).toBe(0);
  });

  it("sin días, la racha es 0", () => {
    expect(calcularRacha([])).toBe(0);
  });
});

describe("calcularCumplimiento", () => {
  it("mide el % sobre los días cerrados, no sobre el total", () => {
    // 2 logrados de 3 cerrados = 66.7%. El pendiente no es un fallo.
    const r = calcularCumplimiento([
      d("2026-08-10", "pendiente"),
      d("2026-08-09", "logrado"),
      d("2026-08-08", "no_logrado"),
      d("2026-08-07", "logrado"),
    ]);
    expect(r.cerrados).toBe(3);
    expect(r.logrados).toBe(2);
    expect(r.pendientes).toBe(1);
    expect(r.pct).toBe(66.7);
  });

  it("sin días cerrados el % es null, no 0", () => {
    // 0% diría "lo hace mal"; null dice "todavía no hay con qué juzgar".
    const r = calcularCumplimiento([d("2026-08-10", "pendiente")]);
    expect(r.pct).toBeNull();
  });

  it("todo cumplido da 100%", () => {
    expect(calcularCumplimiento([d("2026-08-10", "logrado")]).pct).toBe(100);
  });
});

describe("tieneReflect", () => {
  it("basta una respuesta para darlo por hecho", () => {
    expect(tieneReflect({ ayudo: "Bloqueé la mañana" })).toBe(true);
    expect(tieneReflect({ distrajo: "", manana: "Empezar más temprano" })).toBe(true);
  });

  it("vacío o solo espacios no cuenta", () => {
    expect(tieneReflect({})).toBe(false);
    expect(tieneReflect({ ayudo: "   ", distrajo: null, manana: undefined })).toBe(false);
  });
});

describe("validarTexto", () => {
  it("limpia espacios de sobra", () => {
    const r = validarTexto("  Cerrar   el inventario  ");
    expect(r).toEqual({ ok: true, texto: "Cerrar el inventario" });
  });

  it("rechaza un Highlight vacío", () => {
    expect(validarTexto("   ").ok).toBe(false);
  });

  it("rechaza uno demasiado largo — si no entra, son varias cosas", () => {
    const r = validarTexto("a".repeat(MAX_TEXTO + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(String(MAX_TEXTO));
  });

  it("acepta justo en el límite", () => {
    expect(validarTexto("a".repeat(MAX_TEXTO)).ok).toBe(true);
  });
});

describe("etiquetaEstado", () => {
  it("traduce los tres estados", () => {
    expect(etiquetaEstado("logrado")).toBe("Logrado");
    expect(etiquetaEstado("no_logrado")).toBe("No se logró");
    expect(etiquetaEstado("pendiente")).toBe("Pendiente");
  });
});
