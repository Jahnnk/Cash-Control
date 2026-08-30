import { describe, it, expect } from "vitest";
import {
  resolverCategoria,
  categoriasQueNecesitanDecision,
} from "../categoria-resolver";
import { CATALOGO, NOMBRES_CANONICOS, grupoAColumnas } from "../catalogo-categorias";

describe("resolverCategoria · lo que ya está bien escrito", () => {
  it("reconoce el nombre exacto del catálogo", () => {
    const r = resolverCategoria("INSUMOS");
    expect(r.canonica).toBe("INSUMOS");
    expect(r.grupo).toBe("variable");
    expect(r.confianza).toBe("exacta");
  });

  it("ignora MAYÚSCULAS y minúsculas", () => {
    expect(resolverCategoria("Insumos").canonica).toBe("INSUMOS");
    expect(resolverCategoria("insumos").canonica).toBe("INSUMOS");
    expect(resolverCategoria("  Planilla  ").canonica).toBe("PLANILLA");
  });

  it("ignora la tilde, incluso invertida", () => {
    // El caso real: Fonavi tenía DECORACIÒN y DECORACIÓN como dos
    // categorías distintas. Se leen igual, el sistema las veía distintas.
    expect(resolverCategoria("DECORACIÒN").canonica).toBe("DECORACIÓN");
    expect(resolverCategoria("DECORACIÓN").canonica).toBe("DECORACIÓN");
    expect(resolverCategoria("decoracion").canonica).toBe("DECORACIÓN");
    expect(resolverCategoria("REMODELACIÒN").canonica).toBe("REMODELACIÓN");
  });
});

describe("resolverCategoria · el diccionario de equivalencias", () => {
  it("traduce las equivalencias decididas a mano", () => {
    expect(resolverCategoria("COCINA").canonica).toBe("VAJILLA");
    expect(resolverCategoria("FLETE").canonica).toBe("SS GENERALES");
    expect(resolverCategoria("PRODUCTOS").canonica).toBe("PRODUCTOS ATELIER");
    expect(resolverCategoria("UTILES ESCRITORIO").canonica).toBe("OFICINA");
    expect(resolverCategoria("SUNAT").canonica).toBe("IMPUESTOS");
  });

  it("manda los pagos de préstamos a FINANCIAMIENTO", () => {
    for (const n of ["PRESTAMO", "PRESTAMOS", "Préstamos"]) {
      const r = resolverCategoria(n);
      expect(r.canonica).toBe("FINANCIAMIENTO");
      expect(r.grupo).toBe("financiamiento");
    }
  });

  it("NO confunde el préstamo entre sedes con financiamiento", () => {
    // "PRESTAMO A ATELIER" desde Fonavi/Centro es una sede prestándole a
    // otra: plata que vuelve, no una obligación con un banco.
    const r = resolverCategoria("PRESTAMO ATELIER");
    expect(r.canonica).toBe("PRESTAMO ATELIER");
    expect(r.grupo).toBe("fuera");
  });

  it("una fila sin categoría cae en OTROS, no queda vacía", () => {
    for (const n of ["", "   ", null, undefined]) {
      const r = resolverCategoria(n);
      expect(r.canonica).toBe("OTROS");
      expect(r.grupo).toBe("variable");
    }
  });
});

describe("resolverCategoria · errores de tipeo que nadie anotó", () => {
  it("corrige typos que NO están en el diccionario", () => {
    // Ninguno de estos está en el mapa de alias: los atrapa el parecido.
    expect(resolverCategoria("INSUMSO").canonica).toBe("INSUMOS");
    expect(resolverCategoria("PLANILA").canonica).toBe("PLANILLA");
    expect(resolverCategoria("ALQUILE").canonica).toBe("ALQUILER");
    expect(resolverCategoria("LIMPIEZ").canonica).toBe("LIMPIEZA");
  });

  it("marca la corrección por parecido como tal, no como certeza", () => {
    const r = resolverCategoria("INSUMSO");
    expect(r.confianza).toBe("parecido");
    expect(r.motivo).toContain("tipeo");
  });

  it("corrige singulares y plurales", () => {
    expect(resolverCategoria("MANTENIMIENTOS").canonica).toBe("MANTENIMIENTO");
    expect(resolverCategoria("EQUIPO").canonica).toBe("EQUIPOS");
    expect(resolverCategoria("AHORROS").canonica).toBe("AHORRO");
  });
});

describe("resolverCategoria · lo que NO se debe adivinar", () => {
  // Estos son los casos reales de Fonavi (ago-2026). El nombre no dice
  // nada; solo el concepto de la fila lo aclara, y eso no lo puede leer
  // ningún parecido de texto. Tienen que llegarle a dirección.
  it("deja pendientes las categorías genuinamente nuevas", () => {
    for (const n of ["PENDIENTE", "FALTA RENDIR", "DEUDA"]) {
      const r = resolverCategoria(n);
      expect(r.confianza).toBe("desconocida");
      expect(r.grupo).toBeNull();
      expect(r.canonica).toBe(n);
    }
  });

  it("nunca corrige nombres cortos por parecido", () => {
    // "G" era la letra de la columna Ing./Gsto. colándose en el Excel;
    // se resuelve por diccionario, no por parecido. Pero un nombre corto
    // que NO esté en el diccionario no se toca jamás: con dos letras
    // cualquier cosa se parece a cualquier cosa.
    for (const n of ["SIS", "OK", "XY", "AFP"]) {
      expect(resolverCategoria(n).confianza).toBe("desconocida");
    }
  });

  it("descarta cuando hay empate entre dos candidatos", () => {
    // Si dos categorías del catálogo están a la misma distancia, elegir
    // una sería tirar una moneda. Se prefiere preguntar.
    const r = resolverCategoria("SS XXXXXXX");
    expect(r.confianza).toBe("desconocida");
  });

  it("no se come una categoría más específica que empieza igual", () => {
    // Caso real: Atelier tenía "PRESTAMO VEHICULAR". Si el parecido se
    // midiera solo en letras cambiadas, un nombre largo y específico
    // terminaría colapsado dentro del corto del catálogo. El candado de
    // proporción lo impide.
    const r = resolverCategoria("ALQUILER VEHICULAR");
    expect(r.confianza).toBe("desconocida");
    expect(r.canonica).toBe("ALQUILER VEHICULAR");
  });
});

describe("categoriasQueNecesitanDecision", () => {
  it("devuelve solo las desconocidas, sin repetir", () => {
    const pendientes = categoriasQueNecesitanDecision([
      "INSUMOS",      // exacta
      "COCINA",       // alias
      "INSUMSO",      // parecido
      "PENDIENTE",    // desconocida
      "PENDIENTE",    // repetida
      "FALTA RENDIR", // desconocida
    ]);
    expect(pendientes.map((p) => p.canonica)).toEqual(["PENDIENTE", "FALTA RENDIR"]);
  });

  it("no pide decisión cuando el Excel viene limpio", () => {
    expect(categoriasQueNecesitanDecision(["INSUMOS", "PLANILLA", "ALQUILER"])).toEqual([]);
  });
});

describe("el catálogo en sí", () => {
  it("no tiene nombres repetidos", () => {
    expect(new Set(NOMBRES_CANONICOS).size).toBe(NOMBRES_CANONICOS.length);
  });

  it("cada nombre del catálogo se resuelve a sí mismo", () => {
    // Si una entrada del catálogo no sobrevive su propio resolvedor,
    // el import la renombraría a otra cosa y se perdería sola.
    for (const c of CATALOGO) {
      const r = resolverCategoria(c.nombre);
      expect(r.canonica, `${c.nombre} se resolvió a ${r.canonica}`).toBe(c.nombre);
      expect(r.grupo).toBe(c.grupo);
    }
  });

  it("resolver dos veces da lo mismo que resolver una", () => {
    // Sin esto, un re-import podría ir moviendo la categoría de a poco.
    for (const n of ["Insumos", "COCINA", "INSUMSO", "PENDIENTE", "DECORACIÒN", "PRESTAMOS"]) {
      const una = resolverCategoria(n).canonica;
      const dos = resolverCategoria(una).canonica;
      expect(dos, `${n} → ${una} → ${dos}`).toBe(una);
    }
  });

  it("traduce cada grupo a las dos columnas de la base de datos", () => {
    expect(grupoAColumnas("fijo")).toEqual({ costGroup: "fijo", excludeFromEbitda: false });
    expect(grupoAColumnas("variable")).toEqual({ costGroup: "variable", excludeFromEbitda: false });
    // Financiamiento se excluye del EBITDA (la "I" es Interest) pero
    // guarda nombre propio para poder verlo aparte del ahorro y las
    // utilidades, que son otra cosa.
    expect(grupoAColumnas("financiamiento")).toEqual({
      costGroup: "financiamiento",
      excludeFromEbitda: true,
    });
    expect(grupoAColumnas("fuera")).toEqual({ costGroup: null, excludeFromEbitda: true });
  });
});
