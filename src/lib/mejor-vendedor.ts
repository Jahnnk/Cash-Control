/**
 * Mejor vendedor por FRANJA HORARIA (hándicap) · lógica PURA.
 *
 * La idea, en una frase: no gana quien tiene el ticket más alto en bruto,
 * gana quien más levanta su ticket sobre lo NORMAL de SU franja. Así las
 * horas bajas nunca son una desventaja — cada quien compite contra lo que
 * normalmente se vende en SU horario, no contra las horas pico.
 *
 *   levantamiento (lift) = ticket por persona del vendedor en la franja
 *                          − "lo normal" de esa franja
 *   score del vendedor    = promedio de sus lifts ponderado por sus clientes
 *   gana el mayor score, entre los que cumplen el mínimo de clientes del mes.
 *
 * "Lo normal de la franja" (baseline) puede venir de dos formas:
 *   1. FIJADO por la dirección (expectedByFranja) — recomendado: estable,
 *      auditable, no se diluye. Es como fijar la meta de cada franja.
 *   2. EMPÍRICO — promedio ponderado real de la franja ese mes (fallback
 *      si no se fijó). Aviso: cuando un vendedor es casi todo el volumen de
 *      su franja, el promedio se le "pega" a su propio número y su lift se
 *      diluye; por eso preferimos el baseline fijado.
 *
 * Este motor NO decide pagos por sí solo: es la medición transparente que
 * reemplazará la elección manual del mejor vendedor cuando exista el dato
 * de ventas por vendedor y franja.
 */

export type SellerFranjaRecord = {
  seller: string;
  /** Etiqueta de la franja (ej. "pico", "valle", "mañana") — libre. */
  franja: string;
  /** Ticket promedio POR PERSONA del vendedor en esa franja. */
  ticketPersona: number;
  /** Clientes atendidos por el vendedor en esa franja (el mes). */
  clientes: number;
};

export type MejorVendedorInput = {
  records: SellerFranjaRecord[];
  /** Mínimo de clientes del mes para calificar (política ≈ 60). */
  minClientes: number;
  /** Baseline por franja fijado por la dirección. Si falta una franja,
   *  se calcula el promedio empírico de esa franja. */
  expectedByFranja?: Record<string, number> | null;
};

export type SellerFranjaScore = {
  franja: string;
  ticketPersona: number;
  clientes: number;
  baseline: number | null;   // null = no se pudo establecer (franja de 1 solo, sin fijar)
  lift: number | null;       // ticketPersona − baseline
};

export type SellerScore = {
  seller: string;
  totalClientes: number;
  /** Ticket por persona global del vendedor (para mostrar el contraste
   *  con el bruto: el de mayor ticket bruto NO siempre gana). */
  ticketGlobal: number | null;
  /** Levantamiento promedio (S/ por cliente por encima de lo normal). */
  liftPromedio: number | null;
  elegible: boolean;
  porFranja: SellerFranjaScore[];
  notas: string[];
};

export type MejorVendedorResult = {
  ranking: SellerScore[];                    // elegibles por lift desc; no elegibles al final
  ganador: string | null;
  /** "Lo normal" de cada franja usado para mostrar (promedio ponderado). */
  baselineByFranja: Record<string, number>;
  /** true si algún baseline salió del promedio empírico (no fijado). */
  usoEmpirico: boolean;
  minClientes: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Promedio ponderado de ticket por clientes; null si no hay clientes. */
function weightedTicket(rows: { ticketPersona: number; clientes: number }[]): number | null {
  const c = rows.reduce((s, r) => s + r.clientes, 0);
  if (c <= 0) return null;
  return rows.reduce((s, r) => s + r.ticketPersona * r.clientes, 0) / c;
}

export function computeMejorVendedor(input: MejorVendedorInput): MejorVendedorResult {
  const { records, minClientes } = input;
  const fixed = input.expectedByFranja ?? {};

  // Franjas presentes.
  const franjas = [...new Set(records.map((r) => r.franja))];

  // "Lo normal" para mostrar: promedio ponderado real de cada franja.
  const baselineByFranja: Record<string, number> = {};
  for (const f of franjas) {
    const rows = records.filter((r) => r.franja === f);
    const fixedVal = fixed[f];
    const empVal = weightedTicket(rows);
    const val = fixedVal !== undefined ? fixedVal : empVal;
    if (val !== null && val !== undefined) baselineByFranja[f] = r2(val);
  }
  let usoEmpirico = false;

  const sellers = [...new Set(records.map((r) => r.seller))];
  const scores: SellerScore[] = sellers.map((seller) => {
    const mine = records.filter((r) => r.seller === seller && r.clientes > 0);
    const totalClientes = mine.reduce((s, r) => s + r.clientes, 0);
    const ticketGlobal = weightedTicket(mine);
    const notas: string[] = [];

    const porFranja: SellerFranjaScore[] = mine.map((r) => {
      let baseline: number | null;
      if (fixed[r.franja] !== undefined) {
        baseline = fixed[r.franja];
      } else {
        // Empírico: promedio de la franja SIN este vendedor (evita que se
        // compare contra sí mismo). Si es el único, no hay baseline.
        const others = records.filter((x) => x.franja === r.franja && x.seller !== seller && x.clientes > 0);
        const b = weightedTicket(others);
        baseline = b;
        usoEmpirico = true;
        if (b === null) notas.push(`En "${r.franja}" no hay con quién comparar (fue el único) — esa franja no puntúa.`);
      }
      const lift = baseline !== null ? r2(r.ticketPersona - baseline) : null;
      return { franja: r.franja, ticketPersona: r2(r.ticketPersona), clientes: r.clientes, baseline: baseline !== null ? r2(baseline) : null, lift };
    });

    // Lift promedio ponderado por clientes, solo sobre franjas con baseline.
    const scored = porFranja.filter((p) => p.lift !== null);
    const cScored = scored.reduce((s, p) => s + p.clientes, 0);
    const liftPromedio = cScored > 0
      ? r2(scored.reduce((s, p) => s + (p.lift ?? 0) * p.clientes, 0) / cScored)
      : null;

    const elegible = totalClientes >= minClientes && liftPromedio !== null;
    if (totalClientes < minClientes) {
      notas.push(`No califica: ${totalClientes} clientes en el mes (mínimo ${minClientes}).`);
    }

    return {
      seller,
      totalClientes,
      ticketGlobal: ticketGlobal !== null ? r2(ticketGlobal) : null,
      liftPromedio,
      elegible,
      porFranja,
      notas,
    };
  });

  // Ranking: elegibles por lift desc; los no elegibles al final.
  scores.sort((a, b) => {
    if (a.elegible !== b.elegible) return a.elegible ? -1 : 1;
    return (b.liftPromedio ?? -Infinity) - (a.liftPromedio ?? -Infinity);
  });

  const ganador = scores.find((s) => s.elegible)?.seller ?? null;

  return { ranking: scores, ganador, baselineByFranja, usoEmpirico, minClientes };
}
