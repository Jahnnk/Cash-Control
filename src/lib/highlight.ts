/**
 * Highlight diario — metodología "Make Time" (Jake Knapp / John Zeratsky).
 *
 * "No se trata de hacer más cosas; se trata de asegurarte de hacer las
 * cosas que más importan."
 *
 * Acá vive la lógica pura: textos de la guía, las preguntas del Reflect
 * y los cálculos de racha y cumplimiento. La pantalla solo pinta y las
 * actions solo leen y escriben (convención del repo).
 */

export type EstadoHighlight = "pendiente" | "logrado" | "no_logrado";

export type HighlightDia = {
  fecha: string; // YYYY-MM-DD
  estado: EstadoHighlight;
};

// ─────────────────────────────────────────────────────────────────
// Textos de la metodología (los mismos que ve el admin en la guía)
// ─────────────────────────────────────────────────────────────────

export const GUIA_HIGHLIGHT = [
  {
    titulo: "¿Qué es un Highlight?",
    cuerpo:
      "Cada día se te asigna una única actividad para priorizar y proteger en tu calendario. " +
      "Por supuesto, tu Highlight no será lo único que hagas durante el día, pero sí será tu prioridad.",
  },
  {
    titulo: "Protégelo en tu día",
    cuerpo:
      "Elige a qué hora lo vas a hacer y resérvale ese espacio. Un Highlight sin hora " +
      "termina siendo lo que se hace “si sobra tiempo”, y nunca sobra.",
  },
  {
    titulo: "Uno solo, de verdad",
    cuerpo:
      "Si todo es prioridad, nada lo es. Cuando aparezcan urgencias, el Highlight es lo " +
      "que NO se negocia; lo demás se acomoda alrededor.",
  },
  {
    titulo: "Reflect: mejora continua",
    cuerpo:
      "Al cerrar el día respondes tres preguntas cortas. No existe un sistema perfecto: " +
      "lo importante es experimentar continuamente y quedarte con lo que a ti te funciona.",
  },
] as const;

export const PREGUNTAS_REFLECT = {
  logrado: "¿Logré mi Highlight?",
  ayudo: "¿Qué me ayudó?",
  distrajo: "¿Qué me distrajo?",
  manana: "¿Qué puedo probar mañana?",
} as const;

export const CIERRE_REFLECT =
  "No existe un sistema perfecto. Lo importante es experimentar continuamente.";

/** Tope de caracteres del Highlight: si no entra acá, no es UNA cosa. */
export const MAX_TEXTO = 140;
export const MAX_POR_QUE = 300;
export const MAX_REFLECT = 500;

// ─────────────────────────────────────────────────────────────────
// Cálculos
// ─────────────────────────────────────────────────────────────────

/**
 * Racha de días cumplidos, contando desde el más reciente hacia atrás.
 *
 * Solo cuentan los días que TUVIERON Highlight: si un sábado no se
 * asignó nada, no es culpa del administrador y no debe cortarle la
 * racha. Un `no_logrado` sí la corta; un `pendiente` también (aún no
 * está cerrado, así que no se puede afirmar que se cumplió).
 */
export function calcularRacha(dias: HighlightDia[]): number {
  const ordenados = [...dias].sort((a, b) => b.fecha.localeCompare(a.fecha));
  let racha = 0;
  for (const d of ordenados) {
    if (d.estado === "logrado") racha++;
    else break;
  }
  return racha;
}

export type Cumplimiento = {
  /** Días que ya se cerraron (logrado o no_logrado). */
  cerrados: number;
  logrados: number;
  pendientes: number;
  /** % sobre los CERRADOS, no sobre el total: lo aún pendiente no es un fallo. */
  pct: number | null;
};

export function calcularCumplimiento(dias: HighlightDia[]): Cumplimiento {
  const logrados = dias.filter((d) => d.estado === "logrado").length;
  const noLogrados = dias.filter((d) => d.estado === "no_logrado").length;
  const pendientes = dias.filter((d) => d.estado === "pendiente").length;
  const cerrados = logrados + noLogrados;
  return {
    cerrados,
    logrados,
    pendientes,
    pct: cerrados > 0 ? Math.round((logrados / cerrados) * 1000) / 10 : null,
  };
}

/** Etiqueta corta del estado, para chips y tablas. */
export function etiquetaEstado(estado: EstadoHighlight): string {
  return estado === "logrado"
    ? "Logrado"
    : estado === "no_logrado"
      ? "No se logró"
      : "Pendiente";
}

/**
 * ¿Está completo el Reflect? Basta UNA respuesta: obligar a las tres
 * haría que se llene con relleno, y una respuesta honesta vale más que
 * tres inventadas.
 */
export function tieneReflect(r: {
  ayudo?: string | null;
  distrajo?: string | null;
  manana?: string | null;
}): boolean {
  return Boolean(r.ayudo?.trim() || r.distrajo?.trim() || r.manana?.trim());
}

/** Valida el texto que escribe Jahnn antes de guardar. */
export function validarTexto(texto: string): { ok: true; texto: string } | { ok: false; error: string } {
  const t = (texto ?? "").trim().replace(/\s+/g, " ");
  if (!t) return { ok: false, error: "Escribe cuál es lo más importante del día." };
  if (t.length > MAX_TEXTO) {
    return {
      ok: false,
      error: `El Highlight debe caber en ${MAX_TEXTO} caracteres — si no entra, probablemente son varias cosas.`,
    };
  }
  return { ok: true, texto: t };
}
