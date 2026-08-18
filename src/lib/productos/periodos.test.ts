/**
 * Tests de los períodos de rotación.
 *
 * La regla que se clava: nunca contar dos veces. Es el riesgo real de
 * acumular semanas — si Raúl sube el mes entero encima de tres semanas
 * ya cargadas, sumar todo inflaría las ventas al doble.
 */
import { describe, it, expect } from "vitest";
import {
  seSolapan, periodosQueReemplaza, semanaQueToca, limitesDelMes,
  coberturaDelMes, describirPeriodo, describirHuecos, cruzaDeMes, sumarDias,
} from "./periodos";

const p = (inicio: string, fin: string) => ({ inicio, fin });

describe("semanaQueToca", () => {
  it("el sábado 22 toca la semana del 15 al 21 (el ejemplo de Jahnn)", () => {
    expect(semanaQueToca("2026-08-22")).toEqual(p("2026-08-15", "2026-08-21"));
  });

  it("son siempre 7 días y terminan el día antes del sábado", () => {
    const s = semanaQueToca("2026-09-05");
    expect(s).toEqual(p("2026-08-29", "2026-09-04"));
  });
});

describe("solapamientos", () => {
  it("dos semanas seguidas NO se pisan", () => {
    expect(seSolapan(p("2026-08-01", "2026-08-07"), p("2026-08-08", "2026-08-14"))).toBe(false);
  });

  it("compartir un solo día ya es pisarse", () => {
    expect(seSolapan(p("2026-08-01", "2026-08-07"), p("2026-08-07", "2026-08-13"))).toBe(true);
  });

  it("el mes entero pisa a todas las semanas de adentro", () => {
    const semanas = [
      p("2026-08-01", "2026-08-07"),
      p("2026-08-08", "2026-08-14"),
      p("2026-08-15", "2026-08-21"),
    ];
    expect(periodosQueReemplaza(semanas, p("2026-08-01", "2026-08-31"))).toHaveLength(3);
  });

  it("subir el mes entero NO duplica: reemplaza en vez de sumar", () => {
    // El caso que Jahnn planteó. Si esto fallara, agosto valdría el doble.
    const guardadas = [p("2026-08-01", "2026-08-07"), p("2026-08-08", "2026-08-14")];
    const mes = p("2026-08-01", "2026-08-31");
    const reemplaza = periodosQueReemplaza(guardadas, mes);
    const quedan = guardadas.filter((g) => !reemplaza.includes(g));
    expect(quedan).toEqual([]);   // no sobrevive ninguna → sin doble conteo
  });

  it("re-subir la misma semana la actualiza, no la duplica", () => {
    const guardadas = [p("2026-08-15", "2026-08-21")];
    expect(periodosQueReemplaza(guardadas, p("2026-08-15", "2026-08-21"))).toHaveLength(1);
  });

  it("una semana nueva no toca a las anteriores", () => {
    const guardadas = [p("2026-08-01", "2026-08-07"), p("2026-08-08", "2026-08-14")];
    expect(periodosQueReemplaza(guardadas, p("2026-08-15", "2026-08-21"))).toEqual([]);
  });
});

describe("cobertura del mes", () => {
  it("tres semanas seguidas cubren del 1 al 21", () => {
    const c = coberturaDelMes(
      [p("2026-08-01", "2026-08-07"), p("2026-08-08", "2026-08-14"), p("2026-08-15", "2026-08-21")],
      "2026-08", "2026-08-21",
    );
    expect(c.diasCubiertos).toBe(21);
    expect(c.completa).toBe(true);
    expect(c.huecos).toEqual([]);
  });

  it("detecta la semana que falta en el medio", () => {
    const c = coberturaDelMes(
      [p("2026-08-01", "2026-08-07"), p("2026-08-15", "2026-08-21")],
      "2026-08", "2026-08-21",
    );
    expect(c.completa).toBe(false);
    expect(c.huecos).toEqual([p("2026-08-08", "2026-08-14")]);
  });

  it("no reclama días que todavía no pasaron", () => {
    // Un 18 de agosto no se puede exigir el día 30.
    const c = coberturaDelMes([p("2026-08-01", "2026-08-18")], "2026-08", "2026-08-18");
    expect(c.completa).toBe(true);
    expect(c.diasEsperados).toBe(18);
  });

  it("sin ninguna carga, todo el mes transcurrido es un hueco", () => {
    const c = coberturaDelMes([], "2026-08", "2026-08-18");
    expect(c.diasCubiertos).toBe(0);
    expect(c.huecos).toEqual([p("2026-08-01", "2026-08-18")]);
  });

  it("períodos que se pisan no inflan el conteo de días", () => {
    const c = coberturaDelMes(
      [p("2026-08-01", "2026-08-10"), p("2026-08-05", "2026-08-15")],
      "2026-08", "2026-08-15",
    );
    expect(c.diasCubiertos).toBe(15);   // no 21
  });

  it("un mes futuro no genera alarma", () => {
    const c = coberturaDelMes([], "2026-09", "2026-08-18");
    expect(c.completa).toBe(true);
    expect(c.huecos).toEqual([]);
  });
});

describe("semanas que cruzan de mes", () => {
  it("detecta el cruce y propone los dos archivos", () => {
    // No se puede repartir: el reporte no trae días. Hay que pedir dos.
    const r = cruzaDeMes(p("2026-08-29", "2026-09-04"));
    expect(r.cruza).toBe(true);
    if (r.cruza) {
      expect(r.corte[0]).toEqual(p("2026-08-29", "2026-08-31"));
      expect(r.corte[1]).toEqual(p("2026-09-01", "2026-09-04"));
    }
  });

  it("una semana dentro del mismo mes no cruza", () => {
    expect(cruzaDeMes(p("2026-08-15", "2026-08-21")).cruza).toBe(false);
  });
});

describe("cómo se le dice al administrador", () => {
  it("describe un rango del mismo mes", () => {
    expect(describirPeriodo(p("2026-08-15", "2026-08-21"))).toBe("del 15 al 21 de agosto");
  });

  it("describe un solo día", () => {
    expect(describirPeriodo(p("2026-08-15", "2026-08-15"))).toBe("el 15 de agosto");
  });

  it("junta varios huecos en una frase", () => {
    expect(describirHuecos([p("2026-08-08", "2026-08-14"), p("2026-08-20", "2026-08-20")]))
      .toBe("del 8 al 14 de agosto y el 20 de agosto");
  });
});

describe("utilidades de fecha", () => {
  it("limitesDelMes conoce los meses cortos", () => {
    expect(limitesDelMes("2026-02")).toEqual(p("2026-02-01", "2026-02-28"));
    expect(limitesDelMes("2026-08")).toEqual(p("2026-08-01", "2026-08-31"));
  });

  it("sumarDias cruza el cambio de mes", () => {
    expect(sumarDias("2026-08-31", 1)).toBe("2026-09-01");
    expect(sumarDias("2026-09-01", -1)).toBe("2026-08-31");
  });
});
