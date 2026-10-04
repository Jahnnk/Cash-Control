/**
 * Diapositiva 9 de la Reunión Semanal: de la venta a la ganancia (pedido de
 * Jahnn, 3-oct-2026, idea de un libro: facturación, efectivo y beneficio son
 * tres números distintos). Tres barras por sede, último mes cerrado:
 *
 *   1 · Vendido  → 2 · Cobrado  → 3 · Ganancia real
 *
 * Mismos datos que Grupo → Reportes → "De la venta a la ganancia"
 * (lib/venta-a-ganancia.ts sobre getSeisCifras): el deck no contradice a la
 * pantalla. Barras dibujadas con formas (Quick Look no dibuja gráficos nativos).
 */

import type { SeisCifras } from "@/app/actions/seis-cifras";
import { barrasDelMes } from "@/lib/venta-a-ganancia";
import {
  C, MX, ANCHO, SUAVE, Y0, YMAX,
  diapositiva, cajaFecha, tarjeta, texto, icono, circulo, pastilla, lineasEstimadas, solesDeck0,
} from "./deck-diseno";
import type { Ctx } from "./deck-semanal";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];
const mesLargo = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const dd = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const BARRAS = [
  { clave: "vendido", nombre: "Vendido", color: C.oscuro },
  { clave: "cobrado", nombre: "Cobrado", color: C.verde },
  { clave: "ganancia", nombre: "Ganancia real", color: C.ambar },
] as const;

function cortar(t: string, fontSize: number, ancho: number, lineas: number): string {
  const a = ancho * 0.95;
  if (lineasEstimadas(t, fontSize, a) <= lineas) return t;
  let s = t;
  while (s.length > 4 && lineasEstimadas(`${s}…`, fontSize, a) > lineas) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

export function delaVentaALaGanancia(ctx: Ctx, cifras: SeisCifras) {
  const s = diapositiva(ctx.pptx, {
    titulo: "De la venta a la ganancia",
    subtitulo: "Vendido (Byte) → cobrado (lo que entró, según el Excel) → ganancia real (tras costos, gastos e impuestos).",
    periodo: ctx.periodo, derecha: "Resultados",
  });
  cajaFecha(s, mesLargo(cifras.mes), "Último mes cerrado");

  const lista = barrasDelMes(cifras.sedes);
  const gap = 0.2;
  const w = (ANCHO - gap * (lista.length - 1)) / lista.length;
  const h = YMAX - Y0;

  lista.forEach((b, i) => {
    const x = MX + i * (w + gap);
    tarjeta(s, x, Y0, w, h, { cabecera: { alto: 0.46, color: SUAVE.verde } });
    icono(s, b.sede.includes("Atelier") ? "fabrica" : "tienda", "oscuro", x + 0.14, Y0 + 0.1, 0.26);
    texto(s, b.sede.toUpperCase(), { x: x + 0.5, y: Y0 + 0.06, w: w - 0.6, h: 0.2, fontSize: 11, bold: true, color: C.tinta });
    texto(s, b.corte ? `Datos hasta el ${dd(b.corte)}` : "Sin Excel de este mes", { x: x + 0.5, y: Y0 + 0.26, w: w - 0.6, h: 0.15, fontSize: 7.5, color: C.gris });

    const cx = x + 0.18, cw = w - 0.36;
    if (!b.conBarras) {
      texto(s, b.vendido === null || b.vendido <= 0 ? "Sin ventas cargadas." : "Sin Excel de este mes.", { x: cx, y: Y0 + 1.4, w: cw, h: 0.3, fontSize: 10, color: C.grisClaro, align: "center" });
      return;
    }

    const valores = { vendido: b.vendido, cobrado: b.cobrado, ganancia: b.ganancia };
    const tope = Math.max(b.vendido ?? 0, b.cobrado ?? 0, b.ganancia ?? 0, 1);
    const altoMax = 1.7;
    const base = Y0 + 0.75 + 0.3 + altoMax;
    const slot = cw / 3;
    const bw = slot - 0.22;

    BARRAS.forEach((p, k) => {
      const v = valores[p.clave];
      const bx = cx + k * slot + (slot - bw) / 2;
      const negativa = v !== null && v < 0;
      const alto = v === null ? 0.3 : Math.max((Math.max(v, 0) / tope) * altoMax, v !== 0 ? 0.03 : 0);
      if (v === null) {
        s.addShape("rect", { x: bx, y: base - alto, w: bw, h: alto, fill: { color: C.blanco }, line: { color: C.borde, width: 1, dashType: "dash" } });
      } else {
        s.addShape("rect", { x: bx, y: base - alto, w: bw, h: alto, fill: { color: p.color }, line: { color: p.color, type: "none" } });
      }
      const etiqueta = v === null ? "—" : `${negativa ? "−" : ""}${solesDeck0(Math.abs(v))}`;
      texto(s, etiqueta, {
        x: bx - 0.14, y: base - alto - 0.24, w: bw + 0.28, h: 0.2, fontSize: 10.5, bold: true,
        color: negativa ? C.rojo : p.clave === "ganancia" ? C.ambarTexto : p.color, align: "center",
      });
      circulo(s, bx + bw / 2 - 0.11, base + 0.1, 0.22, String(k + 1), p.clave === "vendido" ? "verde" : p.clave === "cobrado" ? "verde" : "ambar");
      texto(s, p.nombre, { x: cx + k * slot, y: base + 0.36, w: slot, h: 0.16, fontSize: 7.5, bold: true, color: C.tinta, align: "center" });
    });
    s.addShape("line", { x: cx, y: base, w: cw, h: 0, line: { color: C.tinta, width: 1 } });

    const py = base + 0.64;
    pastilla(s, cx, py, cw, 0.3,
      b.gananciaPct !== null ? `${b.gananciaPct.toLocaleString("es-PE", { maximumFractionDigits: 1 })}% de lo vendido es ganancia` : `Sin ganancia: ${(b.sinGananciaPorque ?? "faltan datos").toLowerCase()}`,
      b.gananciaPct === null ? "gris" : b.gananciaPct < 0 ? "rojo" : "gris", { tam: 8 });
    if (b.nota) texto(s, cortar(b.nota, 7, cw, 3), { x: cx, y: py + 0.38, w: cw, h: 0.4, fontSize: 7, color: C.gris, valign: "top" });
  });
}
