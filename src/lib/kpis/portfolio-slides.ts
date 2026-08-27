/**
 * Las láminas de portafolio de productos del Deck de la reunión.
 *
 * Pedido de Jahnn (24-ago-2026): que el deck exponga el análisis por
 * rentabilidad × popularidad, con tendencia y proyección, para decidir
 * qué mantener, promocionar o reemplazar.
 *
 * Son tres láminas, en el orden en que se discuten:
 *
 *   1. La MATRIZ — los cuatro cuadrantes con nombre de decisión, no de
 *      libro de texto ("Promocionar", no "Puzzle").
 *   2. MOVIMIENTO — qué subió, qué cayó y a dónde va el mes que viene.
 *   3. DECISIONES — lo que hay que resolver en la reunión, con la línea
 *      en blanco para el responsable (igual que el resto del deck).
 *
 * ─── La advertencia de cobertura va en la PRIMERA lámina ───
 *
 * No en una nota al pie ni en la última. Si hoy la mitad de la venta no
 * tiene costo cargado, quien mira el cuadrante tiene que saberlo ANTES
 * de sacar una conclusión sobre la carta, no después de haberla sacado.
 */

import type PptxGenJS from "pptxgenjs";
import type { BoardPortfolio } from "@/lib/portfolio/board-view";
import { tituloDeAtencion } from "@/lib/portfolio/board-view";

type SlideFactory = (title: string, sub: string) => PptxGenJS.Slide;

const MX = 0.5;
const CONTENT_W = 9.0;
const BODY_Y = 1.45;

/** Color de cada cuadrante: verde = va bien, ámbar = revisar, rojo = sacar. */
const COLOR_CUADRANTE: Record<string, string> = {
  star: "0F8A5F",
  plow_horse: "C48A16",
  puzzle: "2563EB",
  dog: "B91C1C",
};

/**
 * Cuántos productos entran POR BLOQUE en la lámina.
 *
 * Pedido de Jahnn (27-ago-2026): "me gustaría que se vea el top 5 de
 * productos por categoría… actualmente solo se ven 3". Coincide con el
 * MAX_POR_CUADRANTE de board-view.ts — la capa de datos ya traía 5, lo
 * que faltaba era espacio en la lámina.
 *
 * Para que quepan se movió la frase de "qué mirar primero" (antes al
 * pie de la lámina) a la CABECERA, y se comprimió el encabezado de cada
 * bloque a una sola línea (título + regla juntos, en vez de dos). Con
 * eso los cuatro bloques caben con 5 productos cada uno sin salirse del
 * alto de la diapositiva — verificado con el arnés de medición que se
 * usa en todo este archivo (ningún elemento puede pasar de ~5.55").
 */
const EN_LAMINA = 5;

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

function pct(n: number | null): string {
  if (n === null) return "—";
  return `${n > 0 ? "+" : ""}${Math.round(n)}%`;
}

/**
 * Lámina 1 · La matriz. Cuatro bloques, uno por decisión.
 *
 * Cada bloque dice la REGLA que lo define. Sin eso, un cuadrante es una
 * caja negra: nadie discute un número que no sabe de dónde sale, solo
 * lo acepta o lo ignora — y las dos cosas son malas en una reunión.
 */
export function matrizSlide(nueva: SlideFactory, sub: string, bp: BoardPortfolio, sede: string) {
  const s = nueva(`${sede} — qué mantener, promocionar o reemplazar`, sub);

  // "Qué mirar primero" va ARRIBA, no al pie: con 5 productos por
  // cuadrante ya no queda una línea suelta debajo de la rejilla, y de
  // paso es mejor lectura — la conclusión antes que la evidencia.
  s.addText(`→ ${tituloDeAtencion(bp)}`, {
    x: MX, y: BODY_Y - 0.06, w: CONTENT_W, h: 0.34, fontSize: 10.5, bold: true, color: "111827",
  });
  s.addText(
    `${bp.mesLabel}${bp.mesEnCurso ? " (mes en curso)" : ""} · rentabilidad × popularidad, medido DENTRO de ${sede}`,
    { x: MX, y: BODY_Y + 0.28, w: CONTENT_W, h: 0.18, fontSize: 8, italic: true, color: "6B7280" },
  );

  // La advertencia de cobertura: roja si el análisis no debe dirigir.
  const alerta = bp.cobertura.insuficiente;
  const covY = BODY_Y + 0.5;
  s.addShape("roundRect", {
    x: MX, y: covY, w: CONTENT_W, h: 0.32,
    fill: { color: alerta ? "FEF2F2" : "F0FDF4" },
    line: { color: alerta ? "FECACA" : "BBF7D0" },
    rectRadius: 0.04,
  });
  s.addText(bp.cobertura.advertencia, {
    x: MX + 0.15, y: covY + 0.01, w: CONTENT_W - 0.3, h: 0.3,
    fontSize: 8.5, bold: alerta, color: alerta ? "B91C1C" : "166534", valign: "middle",
  });

  // Cuatro bloques en 2×2, cada uno con hasta 5 productos.
  const gy = covY + 0.32 + 0.12;
  const bw = (CONTENT_W - 0.25) / 2;
  const bh = 1.44;
  bp.cuadrantes.forEach((c, i) => {
    const x = MX + (i % 2) * (bw + 0.25);
    const y = gy + Math.floor(i / 2) * (bh + 0.1);
    const color = COLOR_CUADRANTE[c.q] ?? "6B7280";

    s.addShape("roundRect", { x, y, w: bw, h: bh, fill: { color: "FFFFFF" }, line: { color: "E5E7EB" }, rectRadius: 0.04 });
    s.addShape("rect", { x, y, w: bw, h: 0.05, fill: { color } });
    // Título + total + venta en una línea, la regla en la siguiente:
    // el mismo contenido de antes, en dos líneas más bajas en vez de
    // tres, para dejarle sitio a los 5 productos.
    s.addText(`${c.titulo}  ·  ${c.total} producto${c.total === 1 ? "" : "s"}  ·  ${soles(c.venta)}`, {
      x: x + 0.12, y: y + 0.07, w: bw - 0.24, h: 0.2, fontSize: 9.5, bold: true, color,
    });
    s.addText(c.regla, {
      x: x + 0.12, y: y + 0.26, w: bw - 0.24, h: 0.16, fontSize: 7, italic: true, color: "6B7280",
    });

    if (c.productos.length === 0) {
      s.addText("Ninguno este mes.", {
        x: x + 0.12, y: y + 0.48, w: bw - 0.24, h: 0.22, fontSize: 8.5, color: "9CA3AF",
      });
    } else {
      // El total ya salió en el encabezado ("19 productos"): si hay más
      // de 5, no hace falta una línea aparte diciéndolo otra vez.
      c.productos.slice(0, EN_LAMINA).forEach((p, j) => {
        const py = y + 0.45 + j * 0.192;
        s.addText(p.nombre, {
          x: x + 0.12, y: py, w: bw - 1.7, h: 0.19, fontSize: 7.8, color: "111827",
        });
        s.addText(`${Math.round(p.unidades)} und`, {
          x: x + bw - 1.55, y: py, w: 0.58, h: 0.19, fontSize: 7.3, color: "6B7280", align: "right",
        });
        s.addText(
          p.contribucionUnitaria !== null ? `S/${p.contribucionUnitaria.toFixed(2)}/und` : "—",
          { x: x + bw - 0.93, y: py, w: 0.81, h: 0.19, fontSize: 7.3, bold: true, color, align: "right" },
        );
      });
    }
  });
}

/**
 * Lámina 2 · Movimiento y proyección.
 *
 * Solo con meses CERRADOS: un mes a medias parece un derrumbe (la
 * lección de marzo). Si no hay historia suficiente se dice, no se
 * dibuja una tendencia inventada con dos puntos.
 */
export function movimientoSlide(nueva: SlideFactory, sub: string, bp: BoardPortfolio, sede: string) {
  const s = nueva(`${sede} — movimiento del portafolio y proyección`, sub);
  s.addText("Comparado entre meses CERRADOS: el mes en curso no entra (a medias parecería una caída).", {
    x: MX, y: BODY_Y - 0.32, w: CONTENT_W, h: 0.26, fontSize: 9, italic: true, color: "6B7280",
  });

  const halfW = (CONTENT_W - 0.3) / 2;
  s.addText("↑ Los que suben", { x: MX, y: BODY_Y, w: halfW, h: 0.3, fontSize: 13, bold: true, color: "0F8A5F" });
  s.addText("↓ Los que caen", { x: MX + halfW + 0.3, y: BODY_Y, w: halfW, h: 0.3, fontSize: 13, bold: true, color: "B91C1C" });

  const fila = (x: number, i: number, texto: string, valor: string, color: string) => {
    const y = BODY_Y + 0.4 + i * 0.3;
    s.addText(texto, { x, y, w: halfW - 1.0, h: 0.28, fontSize: 9.5, color: "111827" });
    s.addText(valor, { x: x + halfW - 1.0, y, w: 1.0, h: 0.28, fontSize: 9.5, bold: true, color, align: "right" });
  };

  if (bp.suben.length === 0) {
    s.addText("Sin subidas relevantes (o falta historia de meses cerrados).", {
      x: MX, y: BODY_Y + 0.4, w: halfW, h: 0.3, fontSize: 9, color: "9CA3AF",
    });
  } else {
    bp.suben.forEach((m, i) => fila(MX, i, m.name, pct(m.changePct), "0F8A5F"));
  }

  if (bp.bajan.length === 0) {
    s.addText("Sin caídas relevantes.", {
      x: MX + halfW + 0.3, y: BODY_Y + 0.4, w: halfW, h: 0.3, fontSize: 9, color: "9CA3AF",
    });
  } else {
    bp.bajan.forEach((m, i) => fila(MX + halfW + 0.3, i, m.name, pct(m.changePct), "B91C1C"));
  }

  // Proyección del próximo mes, con sus tres escenarios.
  const py = 3.25;
  s.addShape("roundRect", { x: MX, y: py, w: CONTENT_W, h: 1.5, fill: { color: "F8FAF9" }, line: { color: "E5E7EB" }, rectRadius: 0.05 });
  if (!bp.proyeccion) {
    s.addText("Proyección: aún no hay suficientes meses cerrados para proyectar con honestidad.", {
      x: MX + 0.2, y: py + 0.55, w: CONTENT_W - 0.4, h: 0.4, fontSize: 11, color: "6B7280",
    });
  } else {
    s.addText("Proyección del próximo mes (venta)", {
      x: MX + 0.2, y: py + 0.1, w: CONTENT_W - 0.4, h: 0.3, fontSize: 11, bold: true, color: "004C40",
    });
    const cw = (CONTENT_W - 0.4) / 3;
    bp.proyeccion.scenarios.forEach((e, i) => {
      const x = MX + 0.2 + i * cw;
      s.addText(e.scenario.toUpperCase(), { x, y: py + 0.45, w: cw - 0.1, h: 0.24, fontSize: 8.5, color: "6B7280" });
      s.addText(soles(e.revenue), { x, y: py + 0.68, w: cw - 0.1, h: 0.36, fontSize: 16, bold: true, color: "111827" });
    });
    s.addText(`Confianza ${bp.proyeccion.confidence} · ${bp.proyeccion.basis}`, {
      x: MX + 0.2, y: py + 1.1, w: CONTENT_W - 0.4, h: 0.3, fontSize: 8.5, italic: true, color: "6B7280",
    });
  }

  s.addText(
    `Salud del portafolio: ${bp.salud.total}/100 (${bp.salud.nivel}) · Los 3 productos más vendidos son el ${Math.round(bp.concentracion.top3Share * 100)}% de la venta (concentración ${bp.concentracion.severidad}).`,
    { x: MX, y: 4.95, w: CONTENT_W, h: 0.35, fontSize: 9.5, color: "111827" },
  );
}

/**
 * Lámina 3 · Qué se decide hoy.
 *
 * Las decisiones y preguntas las propone el mismo motor del PIC. Si no
 * hay ninguna, la lámina lo dice en vez de inventar una tarea: una
 * reunión con una acción falsa es peor que una reunión sin acciones.
 */
export function decisionesSlide(nueva: SlideFactory, sub: string, bp: BoardPortfolio, sede: string) {
  const s = nueva(`${sede} — decisiones de carta para hoy`, sub);
  let y = BODY_Y;

  if (bp.decisiones.length === 0) {
    s.addText("El análisis no propone decisiones de carta este mes.", {
      x: MX, y, w: CONTENT_W, h: 0.35, fontSize: 12, color: "6B7280",
    });
    y += 0.5;
  } else {
    bp.decisiones.forEach((d, i) => {
      s.addShape("roundRect", { x: MX, y, w: CONTENT_W, h: 0.62, fill: { color: "F8FAF9" }, line: { color: "E5E7EB" }, rectRadius: 0.04 });
      s.addText(`${i + 1}. ${d.decision}`, {
        x: MX + 0.15, y: y + 0.06, w: CONTENT_W - 1.9, h: 0.5, fontSize: 10, color: "111827", valign: "middle",
      });
      s.addText(d.impacto > 0 ? `${soles(d.impacto)}/mes` : "—", {
        x: MX + CONTENT_W - 1.75, y: y + 0.06, w: 1.6, h: 0.5,
        fontSize: 11, bold: true, color: "0F8A5F", align: "right", valign: "middle",
      });
      y += 0.72;
    });
  }

  if (bp.preguntas.length > 0) {
    s.addText("Para conversar", { x: MX, y: y + 0.05, w: CONTENT_W, h: 0.28, fontSize: 11, bold: true, color: "004C40" });
    y += 0.35;
    bp.preguntas.forEach((q) => {
      s.addText(`· ${q.pregunta}`, { x: MX, y, w: CONTENT_W, h: 0.26, fontSize: 9.5, color: "111827" });
      y += 0.28;
    });
  }

  // La tarea de datos: sin costos no hay decisión de carta que valga.
  //
  // Va donde termine el contenido de arriba, no en una Y fija: con 3
  // decisiones y 3 preguntas una caja anclada al pie se montaba encima
  // de la última pregunta. Si de plano no queda sitio se omite — la
  // cobertura ya viaja en la primera lámina, así que no se pierde el
  // aviso, solo el detalle.
  const cajaY = Math.max(4.28, y + 0.12);
  if (bp.cobertura.faltantes.length > 0 && cajaY + 1.02 <= 5.4) {
    s.addShape("roundRect", { x: MX, y: cajaY, w: CONTENT_W, h: 1.02, fill: { color: "FFFBEB" }, line: { color: "FDE68A" }, rectRadius: 0.04 });
    s.addText("Pendiente de datos: estos productos venden y no tienen costo cargado", {
      x: MX + 0.15, y: cajaY + 0.06, w: CONTENT_W - 0.3, h: 0.26, fontSize: 9.5, bold: true, color: "92400E",
    });
    s.addText(
      bp.cobertura.faltantes.slice(0, 4).map((f) => `${f.nombre} (${soles(f.venta)})`).join("  ·  "),
      { x: MX + 0.15, y: cajaY + 0.34, w: CONTENT_W - 0.3, h: 0.6, fontSize: 8.5, color: "92400E" },
    );
  }
}

/**
 * Las láminas de portafolio de TODAS las sedes.
 *
 * Se agrupan POR SEDE, no por tipo de lámina: las tres de Fonavi
 * seguidas, después las tres de Centro. En la reunión se habla de una
 * sede a la vez, con su administrador — saltar entre "las matrices de
 * las tres" y luego "los movimientos de las tres" obligaría a volver
 * atrás cada vez.
 *
 * Una sede con muy pocos productos costeados no genera las tres: la de
 * movimiento y la de decisiones solo salen si tienen algo que decir. Una
 * lámina vacía se lleva un turno de la reunión sin dar nada.
 */
export function portfolioSlides(
  nueva: SlideFactory,
  sub: string,
  sedes: { sede: string; portafolio: BoardPortfolio }[],
) {
  for (const { sede, portafolio: bp } of sedes) {
    matrizSlide(nueva, sub, bp, sede);
    if (bp.suben.length > 0 || bp.bajan.length > 0 || bp.proyeccion) {
      movimientoSlide(nueva, sub, bp, sede);
    }
    if (bp.decisiones.length > 0 || bp.preguntas.length > 0) {
      decisionesSlide(nueva, sub, bp, sede);
    }
  }
}
