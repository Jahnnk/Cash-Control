import { describe, it, expect } from "vitest";
import { tonoDeFecha, fechaDelGrupo, sedesQueArrastran, diasDeRezago, ddmm, diasDeCierre, ventaCubiertaHasta } from "../frescura-importables";

const HOY = "2026-10-15";

describe("frescura de lo que sube Jahnn", () => {
  it("al día hasta 8 días; atrasado hasta 15; después, muy atrasado", () => {
    expect(tonoDeFecha("2026-10-14", HOY)).toBe("al-dia");
    expect(tonoDeFecha("2026-10-07", HOY)).toBe("al-dia");   // 8 días
    expect(tonoDeFecha("2026-10-06", HOY)).toBe("atrasado"); // 9 días
    expect(tonoDeFecha("2026-09-30", HOY)).toBe("atrasado"); // 15 días: la menor rotación de setiembre
    expect(tonoDeFecha("2026-09-29", HOY)).toBe("muy-atrasado");
    expect(tonoDeFecha(null, HOY)).toBe("sin-datos");
  });

  it("el grupo vale por su peor sede, y sin dato en una sede no hay dato del grupo", () => {
    expect(fechaDelGrupo(["2026-10-13", "2026-10-14", "2026-10-12"])).toBe("2026-10-12");
    expect(fechaDelGrupo(["2026-10-13", null, "2026-10-12"])).toBeNull();
    expect(fechaDelGrupo([])).toBeNull();
  });

  it("dice quién arrastra al grupo", () => {
    expect(sedesQueArrastran([{ nombre: "Fonavi", hasta: "2026-10-13" }, { nombre: "Centro", hasta: "2026-10-14" }, { nombre: "Atelier", hasta: "2026-10-12" }])).toEqual(["Atelier"]);
    expect(sedesQueArrastran([{ nombre: "Fonavi", hasta: "2026-10-13" }, { nombre: "Centro", hasta: null }])).toEqual(["Centro"]);
    expect(sedesQueArrastran([{ nombre: "Fonavi", hasta: "2026-10-12" }, { nombre: "Centro", hasta: "2026-10-12" }])).toEqual(["Fonavi", "Centro"]);
  });

  it("formatea y mide el rezago", () => {
    expect(ddmm("2026-10-05")).toBe("05/10");
    expect(ddmm(null)).toBe("—");
    expect(diasDeRezago("2026-10-10", HOY)).toBe(5);
    expect(diasDeRezago("2026-10-20", HOY)).toBe(0);
  });
});

describe("días de cierre: Atelier no vende los domingos y eso no es atraso (26-oct-2026)", () => {
  /** Todos los días entre dos fechas, menos los domingos (como Atelier). */
  const dias = (desde: string, hasta: string, sinDomingo: boolean) => {
    const out: string[] = [];
    for (let d = Date.parse(`${desde}T12:00:00Z`); d <= Date.parse(`${hasta}T12:00:00Z`); d += 86_400_000) {
      const f = new Date(d).toISOString().slice(0, 10);
      if (!(sinDomingo && new Date(`${f}T12:00:00Z`).getUTCDay() === 0)) out.push(f);
    }
    return out;
  };
  const HOY = "2026-10-26"; // lunes

  it("la sede que cierra los domingos queda cubierta al domingo 25, aunque su último día con venta sea el sábado 24", () => {
    const atelier = dias("2026-08-30", "2026-10-24", true);
    expect(diasDeCierre(atelier, HOY)).toEqual(new Set([0]));
    expect(ventaCubiertaHasta(atelier, HOY)).toBe("2026-10-25");
  });
  it("una sede que vende los domingos no cierra ningún día: llega hasta su último día", () => {
    const fonavi = dias("2026-08-30", "2026-10-25", false);
    expect(diasDeCierre(fonavi, HOY).size).toBe(0);
    expect(ventaCubiertaHasta(fonavi, HOY)).toBe("2026-10-25");
    // Si le falta el domingo, ese atraso sí se ve.
    expect(ventaCubiertaHasta(dias("2026-08-30", "2026-10-24", false), HOY)).toBe("2026-10-24");
  });
  it("hoy nunca cuenta: el día cerrado solo se suma hasta ayer", () => {
    const atelier = dias("2026-08-30", "2026-10-24", true);
    // Hoy domingo 25: ayer es el sábado 24, el domingo todavía no pasó.
    expect(ventaCubiertaHasta(atelier, "2026-10-25")).toBe("2026-10-24");
  });
  it("si faltan días laborales no se disimulan: un sábado sin subir sigue siendo atraso", () => {
    const atelier = dias("2026-08-30", "2026-10-23", true); // sin el sábado 24 ni el domingo 25
    expect(ventaCubiertaHasta(atelier, HOY)).toBe("2026-10-23");
  });
  it("una semana sin subir no cierra un día por error (hacen falta 5 repeticiones sin venta)", () => {
    const f = dias("2026-09-28", "2026-10-24", false).filter((x) => x < "2026-10-12" || x > "2026-10-18"); // falta la semana del 12 al 18
    expect(diasDeCierre(f, HOY).size).toBe(0);
  });
  it("sin ventas no hay fecha", () => {
    expect(ventaCubiertaHasta([], HOY)).toBeNull();
  });
});
