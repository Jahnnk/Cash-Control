/**
 * Vales de consumo digitales — «Primer cliente» (22-nov-2026).
 *
 * Jahnn entrega un vale a un familiar o amigo de un administrador o socio
 * para que pruebe la sede y evalúe producto, tiempos y servicio. Antes era
 * un papelito; ahora es un código único que se canjea UNA sola vez.
 *
 * Acá va la lógica pura (códigos, estado, validación). Sin base de datos,
 * para poder probar cada regla suelta.
 */

/**
 * Sin I, O, 0 ni 1: son los que se confunden al leer un código en voz alta
 * o en una pantalla chica. 32 símbolos x 8 posiciones = más de un billón de
 * códigos, así que nadie adivina uno.
 */
export const ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LARGO_CODIGO = 8;

export const MAX_ITEMS = 6;
export const MAX_CANTIDAD = 5;
export const MAX_PARA = 60;
/** Cuántos días de vigencia propone la pantalla por defecto. */
export const DIAS_VIGENCIA_DEFECTO = 30;
export const MAX_DIAS_VIGENCIA = 180;

/**
 * Dominio donde vive la app de verdad. El link del vale SIEMPRE apunta acá,
 * aunque Jahnn lo emita desde staging: un link de preview puede pedir login
 * de Vercel y el invitado no lo vería.
 */
export const DOMINIO_VALES = "https://cash-control-delta.vercel.app";

export function linkVale(codigo: string): string {
  return `${DOMINIO_VALES}/vale/${codigo}`;
}

export type ItemVale = {
  /** ID del producto en la carta (CF-011, AT-046…). */
  ref: string;
  /** Nombre congelado al emitir: si la carta cambia, el vale no. */
  nombre: string;
  cantidad: number;
  /** Precio de carta al emitir (para medir cuánto cuesta la cortesía). */
  precio: number;
};

export type EstadoGuardado = "emitido" | "canjeado" | "anulado";
export type EstadoVale = EstadoGuardado | "vencido";

/**
 * Un código de 8 símbolos al azar, con guion al medio para leerlo fácil
 * («7K3Q-M2PA»). `azar` se puede inyectar para probar sin depender del
 * reloj; en producción usa crypto (no Math.random).
 */
export function generarCodigo(azar: (n: number) => Uint8Array = bytesAlAzar): string {
  const letras: string[] = [];
  // Se descartan los bytes >= 224 (múltiplo de 32) para que ningún símbolo
  // salga más seguido que otro.
  while (letras.length < LARGO_CODIGO) {
    for (const b of azar(16)) {
      if (b >= 224) continue;
      letras.push(ALFABETO_CODIGO[b % ALFABETO_CODIGO.length]);
      if (letras.length === LARGO_CODIGO) break;
    }
  }
  return `${letras.slice(0, 4).join("")}-${letras.slice(4).join("")}`;
}

function bytesAlAzar(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

/**
 * Lo que escribe o pega la persona → el código tal como se guarda.
 * Tolera minúsculas, espacios, guion o no, y que peguen el link completo
 * (`.../vale/7K3Q-M2PA`). Devuelve null si no tiene la forma de un código.
 */
export function normalizarCodigo(entrada: string): string | null {
  let t = (entrada ?? "").trim();
  const barra = t.lastIndexOf("/");
  if (barra >= 0) t = t.slice(barra + 1);
  t = t.split(/[?#]/)[0].toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (t.length !== LARGO_CODIGO) return null;
  for (const c of t) if (!ALFABETO_CODIGO.includes(c)) return null;
  return `${t.slice(0, 4)}-${t.slice(4)}`;
}

/**
 * El estado que se MUESTRA. «Vencido» no se guarda: es (emitido + la fecha
 * de vencimiento ya pasó). Guardarlo obligaría a un proceso que barra la
 * tabla cada noche; deducirlo no puede desincronizarse. Mismo criterio que
 * las propuestas de Highlight. El vale vale HASTA el día de vencimiento
 * inclusive.
 */
export function estadoEfectivo(v: { estado: EstadoGuardado; venceEl: string }, hoy: string): EstadoVale {
  if (v.estado === "emitido" && v.venceEl < hoy) return "vencido";
  return v.estado;
}

export const ETIQUETA_ESTADO: Record<EstadoVale, string> = {
  emitido: "Vigente",
  canjeado: "Ya canjeado",
  anulado: "Anulado",
  vencido: "Vencido",
};

/** Suma de lo que costaría en carta lo que cubre el vale (2 decimales exactos). */
export function valorCarta(items: Pick<ItemVale, "cantidad" | "precio">[]): number {
  const centimos = items.reduce((s, i) => s + Math.round(i.precio * 100) * i.cantidad, 0);
  return centimos / 100;
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** ¿Se puede emitir con estos datos? Devuelve los items ya limpios. */
export function validarEmision(input: {
  items: { ref: string; nombre: string; cantidad: number; precio: number }[];
  para?: string | null;
  venceEl: string;
  hoy: string;
}): { ok: true; items: ItemVale[]; para: string | null } | { ok: false; error: string } {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, error: "Elige al menos un producto." };
  }
  if (input.items.length > MAX_ITEMS) {
    return { ok: false, error: `Un vale cubre máximo ${MAX_ITEMS} productos distintos.` };
  }
  const vistos = new Set<string>();
  const items: ItemVale[] = [];
  for (const i of input.items) {
    if (!i.ref || !i.nombre?.trim()) return { ok: false, error: "Hay un producto sin nombre." };
    if (vistos.has(i.ref)) return { ok: false, error: `«${i.nombre}» está repetido.` };
    vistos.add(i.ref);
    if (!Number.isInteger(i.cantidad) || i.cantidad < 1 || i.cantidad > MAX_CANTIDAD) {
      return { ok: false, error: `La cantidad de «${i.nombre}» debe ser de 1 a ${MAX_CANTIDAD}.` };
    }
    const precio = Number.isFinite(i.precio) && i.precio >= 0 ? i.precio : 0;
    items.push({ ref: i.ref, nombre: i.nombre.trim(), cantidad: i.cantidad, precio });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.venceEl)) {
    return { ok: false, error: "Elige hasta qué día vale." };
  }
  if (input.venceEl < input.hoy) {
    return { ok: false, error: "La fecha de vencimiento ya pasó." };
  }
  if (input.venceEl > sumarDias(input.hoy, MAX_DIAS_VIGENCIA)) {
    return { ok: false, error: `El vale no puede durar más de ${MAX_DIAS_VIGENCIA} días.` };
  }

  const para = (input.para ?? "").trim();
  if (para.length > MAX_PARA) {
    return { ok: false, error: `El nombre no debe pasar de ${MAX_PARA} caracteres.` };
  }
  return { ok: true, items, para: para === "" ? null : para };
}

/** «1 Cappuccino + 2 Croissant» — para mostrar y para decirle a caja qué cobrar. */
export function resumenItems(items: Pick<ItemVale, "cantidad" | "nombre">[]): string {
  return items.map((i) => `${i.cantidad} ${i.nombre}`).join(" + ");
}

/** El mensaje que Jahnn pega en WhatsApp al entregar el vale. */
export function mensajeWhatsApp(args: { link: string; sede: string; items: ItemVale[]; venceEl: string; para?: string | null }): string {
  const [a, m, d] = args.venceEl.split("-");
  return [
    "¡Tienes un vale de consumo en Yayi's! 🎁",
    ...(args.para ? [`Para: ${args.para}`] : []),
    `Sede: ${args.sede}`,
    `Cubre: ${resumenItems(args.items)}`,
    `Válido hasta el ${d}/${m}/${a}. Se usa una sola vez.`,
    "Muéstralo al llegar:",
    args.link,
  ].join("\n");
}

/** Todos los links de una tanda, listos para pegar en un solo mensaje. */
export function textoTodosLosVales(
  vales: { codigo: string; sede: string; items: ItemVale[]; venceEl: string; para: string | null }[],
): string {
  const bloques = vales.map((v, i) => {
    const [a, m, d] = v.venceEl.split("-");
    const quien = v.para ? `${v.para} · ` : "";
    return `${i + 1}) ${quien}${v.sede}: ${resumenItems(v.items)} (hasta el ${d}/${m}/${a})\n${linkVale(v.codigo)}`;
  });
  return ["Vales de consumo Yayi's", "", ...bloques].join("\n\n");
}

// ───────────────────────── Sorteo entre socios y administradores ─────────────────────────

/** Quiénes participan por defecto en el sorteo de los martes. Se pueden quitar o agregar nombres en la pantalla. */
export const PARTICIPANTES_SORTEO = ["Luis", "Chari", "Sol", "Kelly", "Juani", "Jahnn"] as const;

export const MAX_PREMIOS_SORTEO = 12;

function uint32AlAzar(): number {
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
}

/**
 * Un entero al azar en [0, maxExclusivo) SIN sesgo: se descartan los valores de 32 bits que harían que unos
 * números salgan más seguido que otros (el «sesgo del módulo»). `azar` se inyecta solo para probar.
 */
export function enteroAlAzar(maxExclusivo: number, azar: () => number = uint32AlAzar): number {
  if (!Number.isInteger(maxExclusivo) || maxExclusivo < 1 || maxExclusivo > 2 ** 32) {
    throw new Error("enteroAlAzar: el máximo debe ser un entero entre 1 y 2^32");
  }
  const limite = 2 ** 32 - (2 ** 32 % maxExclusivo);
  let n = azar();
  while (n >= limite) n = azar();
  return n % maxExclusivo;
}

/** Baraja una lista (Fisher-Yates): todas las ordenaciones posibles tienen la misma probabilidad. No toca la original. */
export function barajar<T>(lista: readonly T[], azar: () => number = uint32AlAzar): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = enteroAlAzar(i + 1, azar);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type ResultadoSorteo<P> =
  | { ok: true; ganadores: { persona: string; premio: P }[]; sinPremio: string[] }
  | { ok: false; error: string };

/**
 * Reparte los premios entre las personas al azar, uno por persona. Si hay menos premios que personas, ganan
 * solo algunas (también al azar). Los premios salen en el mismo orden en que se armaron; lo que se sortea es
 * QUIÉN se lleva cada uno. Nunca hay más premios que personas.
 */
export function sortear<P>(personas: readonly string[], premios: readonly P[], azar: () => number = uint32AlAzar): ResultadoSorteo<P> {
  const nombres = personas.map((n) => n.trim()).filter((n) => n !== "");
  const unicos = new Set(nombres.map((n) => n.toLowerCase()));
  if (unicos.size !== nombres.length) return { ok: false, error: "Hay un nombre repetido entre los participantes." };
  if (nombres.length === 0) return { ok: false, error: "Elige al menos un participante." };
  if (premios.length === 0) return { ok: false, error: "Arma al menos un premio." };
  if (premios.length > MAX_PREMIOS_SORTEO) return { ok: false, error: `Máximo ${MAX_PREMIOS_SORTEO} premios por sorteo.` };
  if (premios.length > nombres.length) {
    return { ok: false, error: `Hay ${premios.length} premios y solo ${nombres.length} participantes. Quita premios o agrega participantes.` };
  }
  const mezclados = barajar(nombres, azar);
  return {
    ok: true,
    ganadores: premios.map((premio, i) => ({ persona: mezclados[i], premio })),
    sinPremio: mezclados.slice(premios.length),
  };
}
