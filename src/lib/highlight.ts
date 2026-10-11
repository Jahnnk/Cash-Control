/**
 * Highlight semanal — metodología "Make Time" (Jake Knapp / John Zeratsky).
 *
 * Era DIARIO hasta el 10-oct-2026. La auditoría de fricción (El Algoritmo:
 * cuestionar cada requisito) mostró que no se sostenía: el sistema esperaba
 * 21 asignaciones por semana y en Fonavi y Centro no hubo ninguna desde
 * agosto. Jahnn decidió UNO POR SEMANA por sede, asignado en la revisión
 * del lunes. Se guarda en la misma tabla, con la fecha del LUNES de su
 * semana (ver `lunesDe`): la regla "uno por sede y fecha" pasa a ser "uno
 * por sede y semana" sin tocar la base. Los Highlights diarios viejos
 * quedan como historia.
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
  fecha: string; // YYYY-MM-DD (el lunes de su semana; los viejos, su día)
  estado: EstadoHighlight;
};

// ─────────────────────────────────────────────────────────────────
// Textos de la metodología (los mismos que ve el admin en la guía)
// ─────────────────────────────────────────────────────────────────

export const GUIA_HIGHLIGHT = [
  {
    titulo: "¿Qué es un Highlight?",
    cuerpo:
      "Cada semana se te asigna una única actividad para priorizar y proteger en tu calendario. " +
      "Por supuesto, tu Highlight no será lo único que hagas en la semana, pero sí será tu prioridad.",
  },
  {
    titulo: "Protégelo en tu semana",
    cuerpo:
      "Elige qué día y a qué hora lo vas a hacer y resérvale ese espacio. Un Highlight sin hora " +
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
      "Al cerrar la semana respondes tres preguntas cortas. No existe un sistema perfecto: " +
      "lo importante es experimentar continuamente y quedarte con lo que a ti te funciona.",
  },
] as const;

export const PREGUNTAS_REFLECT = {
  logrado: "¿Logré mi Highlight?",
  ayudo: "¿Qué me ayudó?",
  distrajo: "¿Qué me distrajo?",
  manana: "¿Qué puedo probar la próxima semana?",
} as const;

export const CIERRE_REFLECT =
  "No existe un sistema perfecto. Lo importante es experimentar continuamente.";

/** Tope de caracteres del Highlight: si no entra acá, no es UNA cosa. */
export const MAX_TEXTO = 140;
export const MAX_POR_QUE = 300;
export const MAX_REFLECT = 500;

// ─────────────────────────────────────────────────────────────────
// La semana (desde el 10-oct-2026 el Highlight es semanal)
// ─────────────────────────────────────────────────────────────────

/** Suma (o resta) días a una fecha YYYY-MM-DD, sin husos horarios de por medio. */
export function sumarDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** El lunes de la semana de una fecha: con esa fecha se guarda el Highlight. */
export function lunesDe(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return sumarDias(fecha, dow === 0 ? -6 : 1 - dow);
}

/** Primera semana con Highlight semanal. Lo anterior era diario. */
export const INICIO_SEMANAL = "2026-10-05";

/** ¿Es un Highlight semanal (fecha = su lunes, desde INICIO_SEMANAL) o uno diario viejo? */
export function esSemanal(fecha: string): boolean {
  return fecha >= INICIO_SEMANAL && fecha === lunesDe(fecha);
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

/** «del 12 al 18 oct» · «del 28 set al 4 oct». */
export function etiquetaSemana(fecha: string): string {
  const ini = lunesDe(fecha);
  const fin = sumarDias(ini, 6);
  const mi = MESES_CORTOS[Number(ini.slice(5, 7)) - 1];
  const mf = MESES_CORTOS[Number(fin.slice(5, 7)) - 1];
  return mi === mf
    ? `del ${Number(ini.slice(8, 10))} al ${Number(fin.slice(8, 10))} ${mf}`
    : `del ${Number(ini.slice(8, 10))} ${mi} al ${Number(fin.slice(8, 10))} ${mf}`;
}

// ─────────────────────────────────────────────────────────────────
// Cálculos
// ─────────────────────────────────────────────────────────────────

/**
 * Racha de Highlights cumplidos (semanas; antes del 10-oct-2026, días),
 * contando desde el más reciente hacia atrás.
 *
 * Solo cuentan las semanas que TUVIERON Highlight: si una semana no se
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
  if (!t) return { ok: false, error: "Escribe cuál es lo más importante de la semana." };
  if (t.length > MAX_TEXTO) {
    return {
      ok: false,
      error: `El Highlight debe caber en ${MAX_TEXTO} caracteres — si no entra, probablemente son varias cosas.`,
    };
  }
  return { ok: true, texto: t };
}
