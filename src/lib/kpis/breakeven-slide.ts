/**
 * La lámina del PUNTO DE EQUILIBRIO por sede, para el Deck.
 *
 * Pedido de Jahnn (26-ago-2026): "que en una diapositiva me muestre el
 * punto de equilibrio en cada sede de manera muy gráfica y que sea muy
 * fácil de entender".
 *
 * ─── Qué es, en una frase ───
 *
 * Cuánto tiene que vender la sede en el mes para no perder plata. Por
 * debajo de esa línea el mes cierra en rojo; por encima, cada sol que
 * entra ya es ganancia.
 *
 * ─── Cómo se dibuja, y por qué así ───
 *
 * Una BARRA POR SEDE, con una línea vertical marcando la meta. La barra
 * es lo vendido; la línea es el punto de equilibrio. Se entiende sin
 * leer un solo número: ¿la barra pasó la línea o no?
 *
 * Tres cosas deliberadas:
 *
 *  · La barra se pinta en DOS TRAMOS: lo ya cubierto y lo que falta.
 *    Así "me falta poco" y "me falta muchísimo" se distinguen de lejos,
 *    que es como se mira una diapositiva en una reunión.
 *  · Todas las sedes usan LA MISMA ESCALA relativa a SU propia meta
 *    (100% = su punto de equilibrio), no soles absolutos. Las sedes
 *    tienen tamaños muy distintos: en soles absolutos, la barra de la
 *    más chica casi no se vería y la comparación terminaría siendo
 *    sobre tamaño, no sobre salud — que es lo que se quiere discutir.
 *  · Se dice el DÍA en que se cruza al ritmo actual. Un porcentaje se
 *    discute; una fecha se agenda.
 *
 * ─── Lo que NO se hace ───
 *
 * Si una sede no tiene los datos (sin costos fijos clasificados, o sin
 * un mes cerrado de referencia), su barra no se dibuja: se escribe qué
 * falta para poder calcularla. Una barra inventada en una reunión de
 * directorio es peor que un espacio en blanco.
 */

import type PptxGenJS from "pptxgenjs";
import type { GroupBreakeven } from "@/app/actions/breakeven";
import type { BreakevenEstado, BreakevenResult } from "@/lib/breakeven";
import { monthLabel } from "@/lib/utils";

type SlideFactory = (title: string, sub: string) => PptxGenJS.Slide;

const MX = 0.5;
const CONTENT_W = 9.0;
const BODY_Y = 1.45;

const VERDE = "0F8A5F";
const AMBAR = "C48A16";
const ROJO = "B91C1C";
const GRIS = "9CA3AF";

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

/** "18 ago" — para decir hasta cuándo miden las ventas de una sede. */
export function diaCorto(iso: string | null): string {
  if (!iso) return "";
  const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","set","oct","nov","dic"];
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1] ?? ""}`;
}

/** El color del estado. Gris = no se pudo calcular, no "va mal". */
const COLOR_ESTADO: Record<BreakevenEstado, string> = {
  superado: VERDE,
  en_camino: AMBAR,
  en_riesgo: ROJO,
  sin_datos: GRIS,
};

/** Qué significa cada estado, dicho como se diría en voz alta. */
const FRASE_ESTADO: Record<BreakevenEstado, string> = {
  superado: "Ya cubrió sus costos",
  en_camino: "Va a cubrirlos al ritmo actual",
  en_riesgo: "No llega al ritmo actual",
  sin_datos: "Faltan datos para calcularlo",
};

/**
 * Hasta dónde llega la barra de una sede, en fracción de su ancho.
 *
 * La meta (el punto de equilibrio) se dibuja siempre al 70% del ancho,
 * y lo vendido se escala contra ella. Así la línea de meta queda
 * ALINEADA entre todas las sedes y el ojo compara de un vistazo quién
 * la pasó — que es la única pregunta de esta lámina.
 *
 * Un mes muy superado se recorta al 100% del ancho (143% de la meta) y
 * el número exacto se escribe al lado: la barra no puede crecer fuera
 * de la diapositiva.
 */
export const POS_META = 0.7;

export function anchoBarra(avancePct: number | null): number {
  if (avancePct === null || avancePct <= 0) return 0;
  return Math.min(1, (avancePct / 100) * POS_META);
}

/** Lo que falta para llegar, en soles. null si no se puede calcular. */
export function faltaParaEquilibrio(r: BreakevenResult): number | null {
  if (r.breakEven === null) return null;
  return Math.max(0, Math.round((r.breakEven - r.ventas) * 100) / 100);
}

export function breakevenSlide(nueva: SlideFactory, sub: string, be: GroupBreakeven) {
  const s = nueva("Punto de equilibrio del mes por sede", sub);

  s.addText(
    `${monthLabel(be.month)}${be.isCurrent ? " (mes en curso)" : ""} · La línea es lo que hay que vender para no perder plata. ` +
    `Pasar la línea = a partir de ahí, todo es ganancia.`,
    { x: MX, y: BODY_Y - 0.32, w: CONTENT_W, h: 0.26, fontSize: 9.5, italic: true, color: "6B7280" },
  );

  // 0.92 por fila: con 3 sedes, el consolidado y su aviso al pie caben
  // dentro de la diapositiva (verificado midiendo el borde más bajo).
  const filaH = 0.92;
  const barraX = MX + 1.25;
  const barraW = CONTENT_W - 1.25 - 1.9;   // deja sitio al nombre y a la cifra
  const barraH = 0.34;

  be.sedes.forEach((sd, i) => {
    const y = BODY_Y + 0.1 + i * filaH;
    const r = sd.result;
    const color = COLOR_ESTADO[r.estado];

    // Nombre de la sede.
    s.addText(sd.name, {
      x: MX, y: y + 0.02, w: 1.2, h: 0.3, fontSize: 12, bold: true, color: "111827",
    });
    s.addText(FRASE_ESTADO[r.estado], {
      x: MX, y: y + 0.29, w: 1.2, h: 0.2, fontSize: 7.5, color,
    });
    // Hasta cuándo miden sus ventas. Sin esto, una sede con el reporte
    // de Byte atrasado se ve "en riesgo" por días sin cargar, no por
    // vender poco — y en la reunión se le reclama al administrador
    // equivocado.
    if (sd.ventasHasta) {
      s.addText(`ventas al ${diaCorto(sd.ventasHasta)}`, {
        x: MX, y: y + 0.47, w: 1.2, h: 0.2, fontSize: 6.5, italic: true, color: "9CA3AF",
      });
    }

    // Carril de fondo: todo lo que la barra PODRÍA llegar a ser.
    s.addShape("roundRect", {
      x: barraX, y, w: barraW, h: barraH,
      fill: { color: "F1F5F4" }, line: { color: "E5E7EB" }, rectRadius: 0.02,
    });

    if (r.breakEven === null) {
      // Sin datos no se dibuja barra: se dice qué falta para tenerla.
      s.addText(
        r.warnings[0] ?? "Sin costos fijos clasificados: no hay punto de equilibrio que calcular.",
        { x: barraX + 0.1, y: y + 0.02, w: barraW - 0.2, h: barraH, fontSize: 8, color: GRIS, valign: "middle" },
      );
    } else {
      const frac = anchoBarra(r.avancePct);
      if (frac > 0) {
        s.addShape("roundRect", {
          x: barraX, y, w: barraW * frac, h: barraH,
          fill: { color }, line: { color }, rectRadius: 0.02,
        });
      }
      // Lo vendido, escrito DENTRO de la barra cuando cabe.
      const dentro = frac >= 0.22;
      s.addText(soles(r.ventas), {
        x: dentro ? barraX + 0.08 : barraX + barraW * frac + 0.08,
        y, w: 1.3, h: barraH,
        fontSize: 9.5, bold: true, color: dentro ? "FFFFFF" : "111827", valign: "middle",
      });

      // La LÍNEA DE META. Es el elemento central de la lámina.
      const mx = barraX + barraW * POS_META;
      s.addShape("rect", { x: mx - 0.012, y: y - 0.09, w: 0.024, h: barraH + 0.18, fill: { color: "111827" } });
      s.addText(soles(r.breakEven), {
        x: mx - 0.75, y: y + barraH + 0.09, w: 1.5, h: 0.22,
        fontSize: 7.5, bold: true, color: "111827", align: "center",
      });
    }

    // A la derecha: el porcentaje y el dato accionable de cada estado.
    s.addText(r.avancePct !== null ? `${Math.round(r.avancePct)}%` : "—", {
      x: MX + CONTENT_W - 1.85, y: y - 0.02, w: 1.85, h: 0.34,
      fontSize: 17, bold: true, color, align: "right", valign: "middle",
    });

    let pie: string;
    const falta = faltaParaEquilibrio(r);
    if (r.estado === "sin_datos") pie = "";
    else if (r.estado === "superado") pie = "meta cubierta";
    else if (r.diaEstimadoCruce !== null) pie = `cruza el día ${r.diaEstimadoCruce}`;
    else if (falta !== null) pie = `faltan ${soles(falta)}`;
    else pie = "";
    s.addText(pie, {
      x: MX + CONTENT_W - 1.85, y: y + 0.33, w: 1.85, h: 0.24,
      fontSize: 8, color: "6B7280", align: "right",
    });
  });

  // Pie: el consolidado y los avisos de calidad del dato.
  const py = BODY_Y + 0.1 + be.sedes.length * filaH + 0.1;
  const g = be.grupo;
  s.addShape("roundRect", {
    x: MX, y: py, w: CONTENT_W, h: 0.62,
    fill: { color: "F8FAF9" }, line: { color: "E5E7EB" }, rectRadius: 0.04,
  });
  s.addText(
    g.breakEven !== null
      ? `Grupo: vendido ${soles(g.ventas)} de ${soles(g.breakEven)} necesarios · ${Math.round(g.avancePct ?? 0)}%` +
        (g.contributionMargin !== null
          ? ` · de cada S/100 que entran, quedan S/${Math.round(g.contributionMargin * 100)} para pagar los costos fijos`
          : "")
      : "Grupo: aún no se puede calcular el punto de equilibrio consolidado.",
    {
      x: MX + 0.15, y: py + 0.04, w: CONTENT_W - 0.3, h: 0.54,
      fontSize: 10.5, bold: true, color: COLOR_ESTADO[g.estado], valign: "middle",
    },
  );

  // Los avisos van SIEMPRE que existan: un punto de equilibrio calculado
  // con la mitad de los gastos sin clasificar no es un punto de
  // equilibrio, y quien mira la lámina tiene que saberlo acá, no después.
  const avisos = [...new Set([...g.warnings, ...be.sedes.flatMap((x) => x.result.warnings)])];
  if (avisos.length > 0) {
    s.addText(`⚠ ${avisos[0]}`, {
      x: MX, y: py + 0.66, w: CONTENT_W, h: 0.34, fontSize: 7.5, color: "92400E",
    });
  }
}
