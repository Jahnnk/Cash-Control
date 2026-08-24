"use server";

/**
 * Estado de llenado de los reportes diarios de las 3 sedes.
 *
 * Todo lo que llenan los administradores cada día (venta, personas,
 * NPS, mermas, tiempos) vive en `upselling_daily`, una fila por sede y
 * día — incluido Atelier, aunque a él le llega desde el reporte de Byte
 * en vez de tecleado. Por eso basta una consulta.
 *
 * La lógica de qué cuenta como falta está en src/lib/kpis/llenado.ts,
 * separada y con tests: acá solo se trae el dato.
 */

import { neon } from "@neondatabase/serverless";
import { getSessionRole } from "@/lib/session-access";
import { activeBusinessId } from "@/lib/active-business";
import { getToday } from "@/lib/utils";
import {
  claveDesdeNota, evaluarReportesSemanales, type CargaRegistrada,
} from "@/lib/incentivos/reportes-semanales";
import {
  evaluarCumplimiento, type SedeCumplimiento, type ControlCumplimiento,
} from "@/lib/control-cumplimiento";
import {
  evaluarLlenado, diasDeLaSemana, restarDias, rachaDeRegistro, TODA_LA_SEMANA, LUNES_A_SABADO,
  type EstadoLlenado, type DiaLlenado, type FilaDia, type SedeInfo, type ModoRegistro,
} from "@/lib/kpis/llenado";
import { getTodosLosDiasPausados } from "./dias-no-operativos";

const sql = neon(process.env.DATABASE_URL!);

/** Atelier (1) es producción: no lleva NPS ni tiempos de salón. */
const ES_CAFETERIA: Record<number, boolean> = { 1: false, 2: true, 3: true };

/**
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  QUÉ DÍAS SE ESPERA QUE REPORTE CADA SEDE                       │
 * │                                                                 │
 * │  Para que Atelier vuelva a reportar los domingos, cambia su     │
 * │  línea a TODA_LA_SEMANA. No hay que tocar nada más.             │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Atelier libra los domingos (día libre de su administrador, decisión
 * de Jahnn del 16-ago-2026): reclamárselo cada semana sería ruido fijo,
 * y una alerta que siempre está encendida deja de leerse.
 *
 * Si un domingo IGUAL registran, se muestra como cualquier día lleno:
 * el dato real siempre gana sobre lo esperado.
 */
/**
 * Los días que dirección marcó como no operativos, agrupados por sede.
 * Se le pasan a `evaluarLlenado` para que no los reclame en rojo: no es
 * que se les haya olvidado registrar, es que no hubo qué registrar.
 */
async function pausadosPorSede(desde: string): Promise<Record<number, string[]>> {
  const dias = await getTodosLosDiasPausados(desde);
  const porSede: Record<number, string[]> = {};
  for (const d of dias) (porSede[d.businessId] ??= []).push(d.fecha);
  return porSede;
}

const DIAS_ESPERADOS: Record<number, number[]> = {
  1: LUNES_A_SABADO,   // Atelier
  2: TODA_LA_SEMANA,   // Fonavi
  3: TODA_LA_SEMANA,   // Centro
};

/**
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  DE DÓNDE SALE EL DATO DE CADA SEDE                             │
 * │                                                                 │
 * │  Cambia la línea de una sede a "manual" y su aviso pasa a       │
 * │  hablar de teclear el día, no de subir el reporte.              │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Atelier va como "importado" porque su día normal llega con el
 * reporte de Byte — pero su panel YA tiene formulario manual, y por
 * eso el aviso menciona los dos caminos. Esto solo cambia las
 * palabras: el día falta igual, venga de donde venga.
 */
const MODO_REGISTRO: Record<number, ModoRegistro> = {
  1: "importado",  // Atelier
  2: "manual",     // Fonavi
  3: "manual",     // Centro
};

const VACIO = (weekStart: string, hoy: string): EstadoLlenado => ({
  weekStart, hoy, sedes: [], alDia: true,
  totalFaltan: 0, totalIncompletos: 0, pendientesHoy: [],
});

export async function getLlenadoReportes(weekStart: string): Promise<EstadoLlenado> {
  const hoy = getToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return VACIO(hoy, hoy);

  // Solo dirección: es una vista de control de las 3 sedes.
  const role = await getSessionRole();
  if (role?.kind !== "full") return VACIO(weekStart, hoy);

  try {
    const fechas = diasDeLaSemana(weekStart);
    const desde = fechas[0];
    const hasta = fechas[fechas.length - 1];

    const negocios = (await sql`
      SELECT id, name, system_start_date::text AS desde
      FROM businesses ORDER BY id
    `) as { id: number; name: string; desde: string | null }[];

    const filasDb = (await sql`
      SELECT business_id, date::text AS fecha,
             revenue::float AS revenue, nps::float AS nps, mermas_soles::float AS mermas
      FROM upselling_daily
      WHERE date >= ${desde} AND date <= ${hasta}
    `) as { business_id: number; fecha: string; revenue: number | null; nps: number | null; mermas: number | null }[];

    const pausados = await pausadosPorSede(desde);
    const sedes: SedeInfo[] = negocios.map((n) => ({
      businessId: n.id,
      // "Yayi's Fonavi" → "Fonavi": en una tabla de 3 columnas el
      // prefijo repetido solo estorba.
      sede: n.name.replace(/^Yayi'?s\s+/i, ""),
      desde: n.desde,
      esCafeteria: ES_CAFETERIA[n.id] ?? true,
      diasPausados: pausados[n.id] ?? [],
      diasEsperados: DIAS_ESPERADOS[n.id] ?? TODA_LA_SEMANA,
    }));

    const filas: FilaDia[] = filasDb.map((f) => ({
      businessId: f.business_id,
      fecha: f.fecha,
      revenue: f.revenue,
      nps: f.nps,
      mermas: f.mermas,
    }));

    return evaluarLlenado({ weekStart, hoy, sedes, filas });
  } catch (e) {
    console.error("[getLlenadoReportes] failed:", e);
    return VACIO(weekStart, hoy);
  }
}

/* ─────────────────────────────────────────────────────────────────────
 * El mismo estado, pero visto desde el panel de UNA sede.
 *
 * Pedido de Jahnn (16-ago-2026): "que no se les pase ingresar estos
 * datos a mis administradores". El admin ve en su propio panel si el
 * día ya quedó registrado, igual que ve su Highlight.
 *
 * Corre sobre la MISMA función que el cuadro de Grupo a propósito. Si
 * cada pantalla contara los días por su cuenta, tarde o temprano Jahnn
 * vería "falta" y Raúl vería "al día" — y ahí se acaba la confianza en
 * el semáforo. Un solo cerebro, dos vistas.
 *
 * Diferencia con Grupo: la ventana son los ÚLTIMOS 7 DÍAS corridos, no
 * la semana de domingo a sábado. Al administrador le importa lo que se
 * le está pasando; un lunes, la semana del calendario le escondería
 * todo lo que dejó pendiente la semana anterior.
 * ───────────────────────────────────────────────────────────────────── */

export type EstadoKpisSede = {
  /** false = sin permiso o sin sede activa: la tarjeta no se pinta. */
  visible: boolean;
  hoy: string;
  /** Los últimos 7 días, del más antiguo al de hoy. */
  dias: DiaLlenado[];
  /** Días seguidos registrados hasta ayer: el hábito, no la deuda. */
  racha: number;
  /** Cómo llena sus días esta sede: solo cambia el texto del aviso. */
  modo: ModoRegistro;
};

const SIN_ACCESO = (hoy: string): EstadoKpisSede => ({
  visible: false, hoy, dias: [], racha: 0, modo: "manual",
});

export async function getEstadoKpisSede(): Promise<EstadoKpisSede> {
  const hoy = getToday();

  const role = await getSessionRole();
  if (!role) return SIN_ACCESO(hoy);

  // La sede sale de la RUTA, no del rol: así Jahnn entrando a
  // /fonavi/panel ve exactamente lo que ve Raúl.
  let bId: number;
  try {
    bId = await activeBusinessId();
  } catch (e) {
    console.error("[getEstadoKpisSede] activeBusinessId:", e);
    return SIN_ACCESO(hoy);
  }

  const puedeVer = role.kind === "full" || (role.kind === "admin" && role.sede === bId);
  if (!puedeVer) return SIN_ACCESO(hoy);

  try {
    // Ventana móvil: hoy y los 6 días anteriores.
    const desde = restarDias(hoy, 6);

    const negocios = (await sql`
      SELECT id, name, system_start_date::text AS desde
      FROM businesses WHERE id = ${bId}
    `) as { id: number; name: string; desde: string | null }[];
    if (negocios.length === 0) return SIN_ACCESO(hoy);

    const filasDb = (await sql`
      SELECT business_id, date::text AS fecha,
             revenue::float AS revenue, nps::float AS nps, mermas_soles::float AS mermas
      FROM upselling_daily
      WHERE business_id = ${bId} AND date >= ${desde} AND date <= ${hoy}
    `) as { business_id: number; fecha: string; revenue: number | null; nps: number | null; mermas: number | null }[];

    const sede: SedeInfo = {
      businessId: negocios[0].id,
      sede: negocios[0].name.replace(/^Yayi'?s\s+/i, ""),
      desde: negocios[0].desde,
      esCafeteria: ES_CAFETERIA[bId] ?? true,
      diasPausados: (await pausadosPorSede(desde))[bId] ?? [],
      diasEsperados: DIAS_ESPERADOS[bId] ?? TODA_LA_SEMANA,
    };

    const filas: FilaDia[] = filasDb.map((f) => ({
      businessId: f.business_id, fecha: f.fecha,
      revenue: f.revenue, nps: f.nps, mermas: f.mermas,
    }));

    // evaluarLlenado arma 7 días corridos desde la fecha que se le dé:
    // no exige que sea domingo, así que sirve igual para esta ventana.
    const evaluado = evaluarLlenado({ weekStart: desde, hoy, sedes: [sede], filas });
    const dias = evaluado.sedes[0]?.dias ?? [];

    // Qué mensaje mostrar lo decide mensajeEstadoKpis() en la librería,
    // con los mismos días que se devuelven acá.
    return {
      visible: true, hoy, dias,
      racha: rachaDeRegistro(dias, hoy),
      modo: MODO_REGISTRO[bId] ?? "manual",
    };
  } catch (e) {
    console.error("[getEstadoKpisSede] failed:", e);
    return SIN_ACCESO(hoy);
  }
}

/* ─────────────────────────────────────────────────────────────────────
 * Control de cumplimiento de dirección: KPIs diarios + los 4 archivos
 * del sábado, las 3 sedes en una sola respuesta.
 *
 * Pedido de Jahnn (19-ago-2026): "para mí es muy importante corroborar
 * que los administradores están al día".
 *
 * Las dos mitades ya existían pero repartidas: los KPIs se veían en
 * Grupo → Reportes y los archivos solo en el panel de cada admin (y de
 * los cuatro, a dirección le llegaba uno). Había que entrar a tres
 * paneles y cruzarlo de memoria.
 *
 * Se reusa `evaluarLlenado` — el MISMO cerebro del cuadro semanal — para
 * que dirección y administradores no puedan ver cosas distintas.
 * ───────────────────────────────────────────────────────────────────── */

export type EstadoCumplimiento = {
  esDireccion: boolean;
  hoy: string;
  control: ControlCumplimiento | null;
};

export async function getCumplimientoEquipo(): Promise<EstadoCumplimiento> {
  const hoy = getToday();
  const role = await getSessionRole();
  // Vista de control de las 3 sedes: solo dirección.
  if (role?.kind !== "full") return { esDireccion: false, hoy, control: null };

  try {
    // ── 1. KPIs diarios: ventana móvil de los últimos 7 días ──────────
    // La misma que ve el administrador en su panel, para que no haya dos
    // verdades. La semana del calendario escondería, un lunes, todo lo
    // que quedó debiendo la semana anterior.
    const desde = restarDias(hoy, 6);

    const negocios = (await sql`
      SELECT id, name, system_start_date::text AS desde
      FROM businesses ORDER BY id
    `) as { id: number; name: string; desde: string | null }[];

    const filasDb = (await sql`
      SELECT business_id, date::text AS fecha,
             revenue::float AS revenue, nps::float AS nps, mermas_soles::float AS mermas
      FROM upselling_daily
      WHERE date >= ${desde} AND date <= ${hoy}
    `) as { business_id: number; fecha: string; revenue: number | null; nps: number | null; mermas: number | null }[];

    const pausados = await pausadosPorSede(desde);
    const sedes: SedeInfo[] = negocios.map((n) => ({
      businessId: n.id,
      sede: n.name.replace(/^Yayi'?s\s+/i, ""),
      desde: n.desde,
      esCafeteria: ES_CAFETERIA[n.id] ?? true,
      diasPausados: pausados[n.id] ?? [],
      diasEsperados: DIAS_ESPERADOS[n.id] ?? TODA_LA_SEMANA,
    }));

    const filas: FilaDia[] = filasDb.map((f) => ({
      businessId: f.business_id, fecha: f.fecha,
      revenue: f.revenue, nps: f.nps, mermas: f.mermas,
    }));

    const llenado = evaluarLlenado({ weekStart: desde, hoy, sedes, filas });

    // ── 2. Los 4 archivos del sábado, por sede ────────────────────────
    // De import_batches y no de los datos: Cortesías y Cambios de Precio
    // pueden venir legítimamente vacíos, y "no hubo" no es lo mismo que
    // "no lo subiste".
    const subidas = (await sql`
      SELECT business_id, notes,
             (imported_at AT TIME ZONE 'America/Lima')::date::text AS fecha
      FROM import_batches
      WHERE notes IS NOT NULL AND imported_at >= (${desde}::date - INTERVAL '60 days')
      ORDER BY imported_at DESC
      LIMIT 600
    `) as { business_id: number; notes: string | null; fecha: string }[];

    const porSede = new Map<number, CargaRegistrada[]>();
    for (const s of subidas) {
      const clave = claveDesdeNota(s.notes);
      if (!clave) continue;
      const lista = porSede.get(s.business_id) ?? [];
      lista.push({ clave, fecha: s.fecha });
      porSede.set(s.business_id, lista);
    }

    // ── 3. Juntar ─────────────────────────────────────────────────────
    const entrada: SedeCumplimiento[] = llenado.sedes.map((s) => ({
      businessId: s.businessId,
      sede: s.sede,
      diasKpiFaltantes: s.dias.filter((d) => d.estado === "falta").map((d) => d.fecha),
      semanal: evaluarReportesSemanales(porSede.get(s.businessId) ?? [], hoy, s.businessId),
    }));

    return { esDireccion: true, hoy, control: evaluarCumplimiento(entrada) };
  } catch (e) {
    console.error("[getCumplimientoEquipo] failed:", e);
    return { esDireccion: true, hoy, control: null };
  }
}
