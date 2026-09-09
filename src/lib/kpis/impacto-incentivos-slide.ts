/**
 * La lámina que responde a Kelly: ¿el bono por ticket se paga solo?
 *
 * Pedido de Jahnn (9-sep-2026) tras la reunión semanal: "Kelly duda que
 * funcione la metodología de los bonos por ticket promedio… quisiera
 * que en el deck se explique la influencia y los beneficios de nuestra
 * política de incentivos".
 *
 * ─── Cómo se lee, de arriba abajo ───
 *
 *  1. El TITULAR con el veredicto, citando el peor supuesto de margen.
 *  2. La cadena del cálculo: ticket antes → ticket después → gente
 *     atendida → venta nueva. Cuatro números y dos flechas: si alguien
 *     discute, discute un número concreto y no "la metodología".
 *  3. La PRUEBA de que fue upselling y no precios: ítems por persona.
 *  4. La tabla de escenarios de margen, terminando en el más
 *     conservador — el que zanja la discusión.
 *
 * ─── Por qué el pie dice lo que no sabemos ───
 *
 * Una lámina que solo defiende el programa no sobrevive a la segunda
 * reunión. El pie declara que no hay grupo de control y que la
 * correlación no es causalidad. Eso es lo que la vuelve creíble: quien
 * la lee ve que el sistema no está vendiéndole nada.
 */

import type PptxGenJS from "pptxgenjs";
import type { ImpactoIncentivos } from "@/lib/incentives/impacto";
import { monthLabel } from "@/lib/utils";

type SlideFactory = (title: string, sub: string) => PptxGenJS.Slide;

const MX = 0.5;
const CONTENT_W = 9.0;
const BODY_Y = 1.45;

const INK = "111827";
const GRAY = "6B7280";
const VERDE = "0F8A5F";
const AMBAR = "C48A16";
const ROJO = "B91C1C";

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;
const soles2 = (n: number) => `S/${n.toFixed(2)}`;

const COLOR_VEREDICTO: Record<ImpactoIncentivos["veredicto"], string> = {
  se_paga_solo: VERDE,
  // Sin bono no hay nada que justificar: la sede no llegó, no se pagó, y
  // lo que se muestra es cuánto mejoró igual. Va en azul de dato, no en
  // rojo de alarma.
  sin_bono: "1D4ED8",
  ajustado: AMBAR,
  no_se_paga: ROJO,
  sin_datos: GRAY,
};

export function impactoIncentivosSlide(
  nueva: SlideFactory,
  sub: string,
  impactos: ImpactoIncentivos[],
) {
  for (const im of impactos) {
    if (im.veredicto === "sin_datos") continue;
    const s = nueva(
      `¿El bono por ticket se paga solo? · ${im.sede}`,
      `${monthLabel(im.mesActual)} vs ${monthLabel(im.mesBase)} · ${sub}`,
    );
    const color = COLOR_VEREDICTO[im.veredicto];

    // 1 · El titular. Es la frase que se lee en voz alta.
    s.addShape("roundRect", {
      x: MX, y: BODY_Y - 0.15, w: CONTENT_W, h: 0.72,
      fill: {
        color:
          color === VERDE ? "ECFDF5"
          : color === AMBAR ? "FFFBEB"
          : color === ROJO ? "FEF2F2"
          : "EFF6FF",
      },
      line: { color, pt: 1 }, rectRadius: 0.06,
    });
    s.addText(im.titular, {
      x: MX + 0.15, y: BODY_Y - 0.1, w: CONTENT_W - 0.3, h: 0.62,
      fontSize: 11.5, bold: true, color, valign: "middle",
    });

    // 2 · La cadena del cálculo: cuatro cajas y tres flechas.
    const cajaY = BODY_Y + 0.78;
    const cajaW = 1.95;
    const gap = (CONTENT_W - cajaW * 4) / 3;
    const pasos: { arriba: string; grande: string; abajo: string }[] = [
      {
        arriba: `Ticket ${monthLabel(im.mesBase)}`,
        grande: soles2(im.ticketBase),
        abajo: "lo que se gastaba antes",
      },
      {
        arriba: `Ticket ${monthLabel(im.mesActual)}`,
        grande: soles2(im.ticketActual),
        abajo: `${im.deltaTicketPct >= 0 ? "+" : ""}${im.deltaTicketPct.toFixed(1)}% por persona`,
      },
      {
        arriba: "Personas atendidas",
        grande: im.personasActual.toLocaleString("es-PE"),
        abajo:
          im.personasDiaBase !== null && im.personasDiaActual !== null
            ? `${im.personasDiaActual.toFixed(1)}/día vs ${im.personasDiaBase.toFixed(1)} antes`
            : "en el mes",
      },
      {
        arriba: "VENTA NUEVA",
        grande: soles(im.ventaExtra),
        abajo: "que no existía antes",
      },
    ];
    pasos.forEach((p, i) => {
      const x = MX + i * (cajaW + gap);
      const esUltima = i === pasos.length - 1;
      s.addShape("roundRect", {
        x, y: cajaY, w: cajaW, h: 1.0,
        fill: { color: esUltima ? "F0FDF4" : "F8FAFC" },
        line: { color: esUltima ? VERDE : "E5E7EB", pt: esUltima ? 1.25 : 0.75 },
        rectRadius: 0.05,
      });
      s.addText(p.arriba, {
        x: x + 0.06, y: cajaY + 0.06, w: cajaW - 0.12, h: 0.22,
        fontSize: 7.5, color: GRAY, align: "center",
      });
      s.addText(p.grande, {
        x: x + 0.06, y: cajaY + 0.27, w: cajaW - 0.12, h: 0.42,
        fontSize: 17, bold: true, color: esUltima ? VERDE : INK, align: "center",
      });
      s.addText(p.abajo, {
        x: x + 0.06, y: cajaY + 0.7, w: cajaW - 0.12, h: 0.24,
        fontSize: 7, color: GRAY, align: "center",
      });
      if (i < pasos.length - 1) {
        s.addText("→", {
          x: x + cajaW, y: cajaY + 0.3, w: gap, h: 0.4,
          fontSize: 15, color: "9CA3AF", align: "center",
        });
      }
    });

    // 3 · La prueba de que fue upselling: ítems por persona.
    const pruebaY = cajaY + 1.15;
    if (im.itemsPorPersonaBase !== null && im.itemsPorPersonaActual !== null) {
      s.addText("¿Fue upselling o fueron los precios?", {
        x: MX, y: pruebaY, w: CONTENT_W, h: 0.24, fontSize: 10, bold: true, color: INK,
      });
      const subieron = im.itemsPorPersonaActual > im.itemsPorPersonaBase;
      s.addText(
        `Ítems por persona: ${im.itemsPorPersonaBase.toFixed(2)} → ${im.itemsPorPersonaActual.toFixed(2)}` +
          (im.aporteVolumenPct !== null
            ? `   ·   ${Math.min(100, Math.round(im.aporteVolumenPct))}% del alza del ticket viene de VENDER MÁS UNIDADES, no de subir precios` +
              (im.aporteVolumenPct > 100 ? " (el precio por ítem incluso bajó)" : "")
            : ""),
        {
          x: MX, y: pruebaY + 0.24, w: CONTENT_W, h: 0.26,
          fontSize: 9.5, color: subieron ? VERDE : ROJO,
        },
      );
    }

    // 4 · Los escenarios de margen. Termina en el más conservador.
    const tablaY = pruebaY + 0.62;
    s.addText("La utilidad extra contra el bono, con cada supuesto de margen", {
      x: MX, y: tablaY, w: CONTENT_W, h: 0.24, fontSize: 10, bold: true, color: INK,
    });
    const filas: PptxGenJS.TableRow[] = [
      [
        { text: "Supuesto de margen", options: { bold: true, fontSize: 8.5, color: GRAY } },
        { text: "Margen", options: { bold: true, fontSize: 8.5, color: GRAY, align: "right" } },
        { text: "Utilidad extra", options: { bold: true, fontSize: 8.5, color: GRAY, align: "right" } },
        { text: "Bono pagado", options: { bold: true, fontSize: 8.5, color: GRAY, align: "right" } },
        { text: "Alcanza", options: { bold: true, fontSize: 8.5, color: GRAY, align: "right" } },
      ],
      ...im.escenarios.map((e, i): PptxGenJS.TableRow => {
        const ultimo = i === im.escenarios.length - 1;
        const op = { fontSize: 9, bold: ultimo, color: ultimo ? INK : GRAY };
        return [
          { text: e.etiqueta + (ultimo ? "  ← el que manda" : ""), options: op },
          { text: `${(e.margen * 100).toFixed(1)}%`, options: { ...op, align: "right" } },
          { text: soles(e.utilidadExtra), options: { ...op, align: "right" } },
          { text: im.bonoPagado > 0 ? soles(im.bonoPagado) : "—", options: { ...op, align: "right" } },
          {
            // Sin bono pagado no hay múltiplo que mostrar: un "0.0×" se
            // lee como fracaso cuando en realidad no hubo nada que pagar.
            text: im.bonoPagado > 0 ? `${e.veces.toFixed(1)}×` : "sin bono",
            options: {
              ...op, align: "right", bold: true,
              color: im.bonoPagado <= 0 ? GRAY : e.veces >= 1 ? VERDE : ROJO,
            },
          },
        ];
      }),
    ];
    s.addTable(filas, {
      x: MX, y: tablaY + 0.28, w: CONTENT_W,
      colW: [3.6, 1.0, 1.5, 1.4, 1.5],
      border: { pt: 0.5, color: "E5E7EB" }, autoPage: false,
    });

    // 5 · Lo que la lámina NO prueba. Es lo que la hace creíble.
    s.addText(
      "El bono NO sale de la utilidad del mes: sale de la venta que el mejor ticket creó. " +
        "Lo que estos números NO prueban: que el programa haya CAUSADO la subida — no hay grupo de control. " +
        "Lo que sí muestran: que el ticket subió vendiendo más unidades por persona, que es el mecanismo que el programa premia.",
      { x: MX, y: 5.0, w: CONTENT_W, h: 0.45, fontSize: 7.5, italic: true, color: GRAY },
    );
  }
}
