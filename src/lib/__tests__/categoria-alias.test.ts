/**
 * Tests del mapa de variantes de categoría.
 *
 * La razón de existir de este mapa es que Kelly va a seguir escribiendo
 * como escribe. Los casos de abajo son los reales que aparecieron en sus
 * Excels de Centro y Fonavi entre febrero y agosto de 2026.
 */
import { describe, it, expect } from "vitest";
import { categoriaCanonica, esVarianteConocida, listaDeAlias, esGrupoBolson } from "../categoria-alias";

describe("errores de tipeo reales", () => {
  it("corrige las seis variantes que Kelly alterna entre meses", () => {
    expect(categoriaCanonica("PACKAGIN")).toBe("PACKAGING");
    expect(categoriaCanonica("MANTENIENTO")).toBe("MANTENIMIENTO");
    expect(categoriaCanonica("LIMIPEZA")).toBe("LIMPIEZA");
    expect(categoriaCanonica("MARKETINK")).toBe("MARKETING");
    expect(categoriaCanonica("SERVICIO")).toBe("SERVICIOS");
    expect(categoriaCanonica("AUSPICIO")).toBe("MARKETING");
  });

  it("la tilde invertida de REMODELACIÒN cae en la forma correcta", () => {
    // Se ven casi igual pero para el sistema son nombres distintos, así
    // que sin esto quedaban como dos categorías separadas.
    expect(categoriaCanonica("REMODELACIÒN")).toBe("REMODELACIÓN");
    expect(categoriaCanonica("REMODELACIÓN")).toBe("REMODELACIÓN");
    expect(categoriaCanonica("Remodelacion")).toBe("REMODELACIÓN");
  });
});

describe("absorciones aprobadas por Jahnn", () => {
  it("PRODUCTOS y PRODUCTOS ATELIER son la misma compra", () => {
    expect(categoriaCanonica("PRODUCTOS")).toBe("PRODUCTOS ATELIER");
    expect(categoriaCanonica("PRODUCTOS ATELIER")).toBe("PRODUCTOS ATELIER");
  });

  it("la lista única del 19-sep-2026 junta las que eran lo mismo", () => {
    expect(categoriaCanonica("COCINA")).toBe("MENAJE Y UTENSILIOS");
    expect(categoriaCanonica("VAJILLA")).toBe("MENAJE Y UTENSILIOS");
    expect(categoriaCanonica("PROVEEDOR")).toBe("CAJA CHICA");
    expect(categoriaCanonica("MEDICINA")).toBe("PERSONAL");
    expect(categoriaCanonica("BONO")).toBe("PLANILLA");
    expect(categoriaCanonica("FLETE")).toBe("DELIVERY Y FLETES");
    expect(categoriaCanonica("SOFTWARE")).toBe("OFICINA Y SISTEMAS");
    expect(categoriaCanonica("SS CONTABLES")).toBe("CONTABILIDAD Y ASESORÍAS");
    expect(categoriaCanonica("FINANCIAMIENTO")).toBe("PRÉSTAMOS Y TARJETAS");
  });

  it("los bolsones NO se traducen: cada gasto se clasifica por su concepto", () => {
    for (const b of ["FONDOS MUTUOS", "OTROS", "SS GENERALES", "G", "Sin categoría"]) {
      expect(esGrupoBolson(b)).toBe(true);
      expect(categoriaCanonica(b)).toBe(b.trim());
    }
    expect(esGrupoBolson("INSUMOS")).toBe(false);
  });
});

describe("lo que NO se toca", () => {
  it("una categoría bien escrita pasa igual", () => {
    for (const c of ["PLANILLA", "ALQUILER", "INSUMOS", "CAJA CHICA", "SS BANCARIOS"]) {
      expect(categoriaCanonica(c)).toBe(c);
    }
  });

  it("una categoría nueva entra tal cual, no se adivina por parecido", () => {
    // Si mañana Kelly inventa una categoría, aparece en Configuración
    // para decidirla — no se mete a la fuerza en la más parecida.
    expect(categoriaCanonica("DONACIONES")).toBe("DONACIONES");
    expect(categoriaCanonica("PACKAGING PREMIUM")).toBe("PACKAGING PREMIUM");
  });

  it("no revienta con vacío ni con null", () => {
    expect(categoriaCanonica("")).toBe("");
    expect(categoriaCanonica(null)).toBe("");
    expect(categoriaCanonica(undefined)).toBe("");
  });

  it("limpia espacios de sobra sin cambiar el nombre", () => {
    expect(categoriaCanonica("  INSUMOS  ")).toBe("INSUMOS");
  });
});

describe("da igual cómo venga escrita la variante", () => {
  it("mayúsculas, minúsculas o mezcla llegan al mismo lugar", () => {
    expect(categoriaCanonica("packagin")).toBe("PACKAGING");
    expect(categoriaCanonica("Packagin")).toBe("PACKAGING");
    expect(categoriaCanonica("PACKAGIN")).toBe("PACKAGING");
  });
});

describe("esVarianteConocida y listaDeAlias", () => {
  it("distingue una variante de un nombre correcto", () => {
    expect(esVarianteConocida("PACKAGIN")).toBe(true);
    expect(esVarianteConocida("PACKAGING")).toBe(false);
  });

  it("corregir dos veces da lo mismo que corregir una: no hay cadenas", () => {
    // Si una variante apuntara a OTRA variante, el nombre quedaría a
    // medio corregir según cuántas veces se aplicara el mapa.
    const lista = listaDeAlias();
    expect(lista.length).toBeGreaterThan(10);
    for (const { variante, correcta } of lista) {
      expect(categoriaCanonica(correcta)).toBe(correcta);
      expect(categoriaCanonica(categoriaCanonica(variante))).toBe(correcta);
    }
  });
});
