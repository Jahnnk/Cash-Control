/**
 * Proyección del presupuesto con la regla 33-33-33 y Profit First · MOTOR (puro).
 *
 * Pedido de Jahnn (15-oct-2026), de la asesoría con su coach de negocios: «al proyectar los
 * ingresos mensuales, los recursos se asignan proporcionalmente según esta regla». Con una venta
 * esperada de S/57,000: S/19,000 a costo de insumos, S/19,000 a costos fijos y S/19,000 de EBITDA;
 * de ese EBITDA, el 25% de la venta se aparta primero para utilidades (Profit First) y lo que
 * queda va a impuestos y reinversión.
 *
 * Aquí se compara esa regla con LO QUE EL PLAN ASIGNA de verdad (las líneas del presupuesto):
 *
 *   · Costos variables del plan = las categorías que suben con la venta (en %, sobre la venta esperada).
 *   · Costos fijos del plan     = las categorías fijas (planilla, alquiler, servicios…).
 *   · EBITDA del plan           = venta esperada − costos − fijos (antes de impuestos), como en la regla.
 *   · Fuera de la regla: impuestos (se miran aparte), deudas, inversión y ahorro (no son costo del negocio).
 *
 * También dice: si la operación cabe en el 75% (lo que queda tras apartar la utilidad), si la planilla
 * está en su rango sano y cuál sería el piso diario con estos números (lib/equilibrio.ts).
 */

import { montoDe, type Linea } from "./presupuesto";
import { rubroDe } from "./seis-cifras";
import { bloquesDeLaRegla, estadoPlanilla, CONFIG_PROFIT_FIRST, type ConfigProfitFirst, type EstadoPlanilla, type Bloque as BloqueRegla, type Termometro } from "./regla-33";
import { pisoDiario, type Piso } from "./equilibrio";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type ProyeccionPlan = {
  venta: number;
  costos: BloqueRegla;
  fijos: BloqueRegla;
  ebitda: BloqueRegla;
  termometro: Termometro;
  planilla: { monto: number; pct: number; estado: EstadoPlanilla };
  /** Lo que el plan asigna a impuestos (aparte del EBITDA). */
  impuestos: number;
  /** Deudas, inversión y ahorro del plan: salen de la caja pero no son costo del negocio. */
  fueraDeLaRegla: number;
  profitFirst: {
    utilidadPct: number;
    /** El % de la venta que se aparta PRIMERO para utilidades. */
    utilidad: number;
    /** Lo que queda del EBITDA objetivo para impuestos y reinversión. */
    resto: number;
    restoPct: number;
    /** Lo que la operación puede gastar: la venta menos la utilidad. */
    limiteOperacion: number;
    /** Lo que el plan gasta en operar (costos + fijos). */
    operacionPlan: number;
    cabe: boolean;
    /** Cuánto se pasa (0 si cabe). */
    exceso: number;
  };
  /** El piso diario con los números del plan (fijos + food cost del plan, ÷ 30). */
  piso: Piso | null;
  /** Lo que el plan tendría que cambiar para llegar a la regla: bajar costos / fijos (S/), 0 si ya llega. */
  ajuste: { costos: number; fijos: number };
};

/**
 * @param sueldoSocios el sueldo de los socios dentro de los fijos del plan, para sacarlo si el CEO
 *   lo pasó a «se paga de la utilidad».
 */
export function proyectarPlan(input: { venta: number | null; lineas: Linea[]; config?: ConfigProfitFirst; sueldoSocios?: number }): ProyeccionPlan | null {
  const cfg = input.config ?? CONFIG_PROFIT_FIRST;
  const venta = input.venta;
  if (!venta || venta <= 0 || input.lineas.length === 0) return null;

  let costos = 0, fijos = 0, impuestos = 0, fuera = 0, planilla = 0;
  for (const l of input.lineas) {
    const monto = montoDe(l, venta) ?? 0;
    switch (rubroDe(l.categoria)) {
      case "costos": costos += monto; break;
      case "gastos": fijos += monto; if (l.categoria === "PLANILLA") planilla += monto; break;
      case "impuestos": impuestos += monto; break;
      case "deudas": case "inversion": fuera += monto; break;
      default: if (l.categoria === "AHORRO" || l.categoria === "UTILIDADES A SOCIOS") fuera += monto;
    }
  }
  const quita = cfg.sociosDeUtilidad ? Math.min(Math.max(0, input.sueldoSocios ?? 0), fijos) : 0;
  const fijosCuentan = fijos - quita;
  const planillaCuenta = planilla - quita;
  if (costos + fijosCuentan <= 0) return null;

  const bloques = bloquesDeLaRegla(venta, costos, fijosCuentan, planillaCuenta, cfg);
  const utilidad = r2(venta * (cfg.utilidadPct / 100));
  const limite = r2(venta - utilidad);
  const operacionPlan = r2(costos + fijosCuentan);
  return {
    venta: r2(venta),
    costos: bloques.costos, fijos: bloques.fijos, ebitda: bloques.ebitda, termometro: bloques.termometro,
    planilla: { monto: bloques.planilla.monto, pct: bloques.planilla.pct, estado: estadoPlanilla(bloques.planilla.pct) },
    impuestos: r2(impuestos), fueraDeLaRegla: r2(fuera),
    profitFirst: {
      utilidadPct: cfg.utilidadPct, utilidad,
      resto: r2(venta * ((cfg.ebitdaPct - cfg.utilidadPct) / 100)), restoPct: r2(cfg.ebitdaPct - cfg.utilidadPct),
      limiteOperacion: limite, operacionPlan, cabe: operacionPlan <= limite, exceso: r2(Math.max(0, operacionPlan - limite)),
    },
    piso: pisoDiario({ fijos, varRatio: costos / venta, ventasEsperadas: venta, sueldoSocios: input.sueldoSocios, sociosFuera: cfg.sociosDeUtilidad }),
    ajuste: { costos: r2(Math.max(0, bloques.costos.difMeta)), fijos: r2(Math.max(0, bloques.fijos.difMeta)) },
  };
}

/**
 * El Grupo: la suma de los planes de las sedes. Lo que Atelier le vende a las cafeterías se cuenta una
 * sola vez (sale de la venta esperada de Atelier y de los costos de las cafeterías), como en las seis cifras.
 */
export function proyectarGrupo(sedes: { businessId: number; venta: number | null; lineas: Linea[] }[], config?: ConfigProfitFirst, sueldoSocios?: number): ProyeccionPlan | null {
  const conPlan = sedes.filter((s) => s.venta && s.venta > 0 && s.lineas.length > 0);
  if (conPlan.length === 0) return null;
  const interno = conPlan.filter((s) => s.businessId !== 1).reduce((t, s) => {
    const l = s.lineas.find((x) => x.categoria === "PRODUCTOS ATELIER");
    return t + (l ? (montoDe(l, s.venta) ?? 0) : 0);
  }, 0);
  const venta = conPlan.reduce((t, s) => t + (s.venta ?? 0), 0) - (conPlan.some((s) => s.businessId === 1) ? interno : 0);
  // Se juntan las líneas en soles (un mes completo); los % ya vienen convertidos con la venta de cada sede.
  const lineas: Linea[] = conPlan.flatMap((s) => s.lineas.map((l) => ({ categoria: l.categoria, modo: "soles" as const, valor: montoDe(l, s.venta) ?? 0 })));
  const sinInterno = lineas.filter((l) => !(l.categoria === "PRODUCTOS ATELIER"));
  const internoLinea = lineas.filter((l) => l.categoria === "PRODUCTOS ATELIER").reduce((t, l) => t + l.valor, 0) - (conPlan.some((s) => s.businessId === 1) ? interno : 0);
  const todas = internoLinea > 0.005 ? [...sinInterno, { categoria: "PRODUCTOS ATELIER", modo: "soles" as const, valor: internoLinea }] : sinInterno;
  return proyectarPlan({ venta, lineas: todas, config, sueldoSocios });
}
