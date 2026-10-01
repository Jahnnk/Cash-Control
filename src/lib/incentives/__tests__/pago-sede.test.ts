import { describe, it, expect } from "vitest";
import { pagoDePrueba } from "./fixtures-reporte";
import { conPremio } from "../reporte-bonos";

describe("armarPagoSede", () => {
  const { pago } = pagoDePrueba();

  it("une cada línea con su DNI y el desglose de horas de Planilla", () => {
    const teresa = pago.lines.find((l) => l.name === "Teresa")!;
    expect(teresa).toMatchObject({ dni: "72678416", origenHoras: "horario", horasBase: 94, horasMas: 1.67, horasMes: 95.67 });
    const diego = pago.lines.find((l) => l.name === "Diego")!;
    expect(diego).toMatchObject({ origenHoras: "registrada", horasMenos: 2, horasMes: 50 });
  });

  it("Nivel 2: horas × (48 ÷ 94) para los salones y 179 fijo para la administradora", () => {
    expect(pago.nivel).toBe("Nivel 2");
    expect(pago.lines.find((l) => l.name === "Teresa")!.bono).toBe(Math.round((95.67 * 48) / 94)); // 49
    expect(pago.lines.find((l) => l.name === "Diego")!.bono).toBe(Math.round((50 * 48) / 94)); // 26
    expect(pago.lines.find((l) => l.name === "Chari")!.bono).toBe(179);
  });

  it("la tarifa por hora lleva cuatro decimales (con dos, 94 h no darían el bono)", () => {
    expect(pago.tarifaHora).toBe(0.5106);
  });

  it("el total es la suma de lo que se transfiere y el premio solo suma si se elige a alguien", () => {
    const sinPremio = pago.lines.reduce((t, l) => t + l.total, 0);
    expect(pago.totalBonos).toBe(sinPremio);
    expect(pago.mejorVendedor).toMatchObject({ usado: null, premio: 0, sugeridoEquipo: "Teresa" });
    const conTeresa = conPremio(pago, "Teresa");
    expect(conTeresa.totalBonos).toBe(sinPremio + 134);
    expect(conTeresa.lines.find((l) => l.name === "Teresa")!.total).toBe(49 + 134);
  });

  it("sin nivel no hay bono ni tarifa, y se avisa con el motivo", () => {
    const sin = pagoDePrueba({ conNivel: false }).pago;
    expect(sin.nivel).toBeNull();
    expect(sin.totalBonos).toBe(0);
    expect(sin.tarifaHora).toBeNull();
    expect(sin.lines.every((l) => l.total === 0)).toBe(true);
  });

  it("un mes cerrado queda como acta", () => {
    expect(pago.fuente).toBe("vista-previa");
  });
});
