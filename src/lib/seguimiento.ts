/**
 * Rastreador de la semana de cada puesto, al estilo de un pedido de delivery
 * (Rappi / PedidosYa: recibido → en preparación → en camino → entregado).
 *
 * Pedido de Jahnn (11-oct-2026): que cada puesto sepa exactamente qué le
 * toca, qué subir y cuándo, y que el sistema le muestre en todo momento en
 * qué paso va ("visibilidad del estado del sistema", Nielsen).
 *
 * Tres recorridos, con reglas a la vista para poder explicarlas:
 *
 *   ADMINISTRADOR (semana de lunes a domingo)
 *     Highlight recibido (lunes) → Registro diario (cada día) →
 *     Reportes de Byte (sábado) → Semana cerrada (Reflect del Highlight)
 *
 *   CEO · SEMANA
 *     Revisión del lunes → Highlight asignado (lunes) →
 *     Pendientes respondidos (en la semana) → Sedes al día (sábado)
 *
 *   CEO · MES
 *     Presupuesto del mes (antes del 1) → Cierre del mes anterior (1 al 10) →
 *     Menor rotación del mes anterior → Presupuesto del mes siguiente (antes del 1)
 *
 * Lógica pura: los datos los trae actions/seguimiento.ts de las MISMAS
 * funciones que ya usan el panel y Grupo (un solo cerebro).
 */

import { lunesDe, sumarDias } from "./highlight";

export type EstadoPaso = "hecho" | "actual" | "pendiente";
export type Tono = "normal" | "alerta" | "listo";

/** Lo que el botón del paso actual hace: abrir algo en la misma pantalla o ir a otra. */
export type AccionPaso =
  | { tipo: "evento"; evento: "registrar" | "subir" | "highlight"; texto: string; /** El día a registrar. */ fecha?: string }
  | { tipo: "ir"; href: string; texto: string };

export type PasoSeguimiento = {
  /** Identifica el paso (y su icono). */
  clave: string;
  titulo: string;
  /** Cuándo toca: «Lunes», «Cada día», «Sáb 17». */
  cuando: string;
  estado: EstadoPaso;
  /** Dato corto debajo del paso: «al día», «2 de 4». */
  detalle: string | null;
  /** El paso está vencido o con algo pendiente que ya debió hacerse. */
  alerta: boolean;
  accion: AccionPaso | null;
};

export type Seguimiento = {
  titulo: string;
  pasos: PasoSeguimiento[];
  /** Una frase: qué está pasando y qué sigue. */
  mensaje: string;
  tono: Tono;
  /** 0 a 1, para la barra (va del centro del primer punto al del último). */
  avance: number;
  /** El primer paso sin terminar; igual a la cantidad de pasos si todo terminó. */
  indiceActual: number;
};

type PasoEntrada = Omit<PasoSeguimiento, "estado"> & { hecho: boolean };

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

/** «jue 8». */
export function diaCorto(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`;
}
const nombreMes = (mes: string) => MESES_LARGOS[Number(mes.slice(5, 7)) - 1];
const mesCorto = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1];
const mesMas = (mes: string, n: number) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
const ultimoDia = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const enumerar = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/** Arma el seguimiento: el primer paso sin hacer es el actual; `fraccion` es cuánto lleva ese paso (0 a 1). */
export function armar(titulo: string, pasos: PasoEntrada[], mensaje: string, tono: Tono, fraccion = 0): Seguimiento {
  const n = pasos.length;
  let indiceActual = pasos.findIndex((p) => !p.hecho);
  if (indiceActual < 0) indiceActual = n;
  const conEstado: PasoSeguimiento[] = pasos.map(({ hecho, ...p }, i) => ({
    ...p,
    estado: hecho ? "hecho" : i === indiceActual ? "actual" : "pendiente",
    // La acción solo se ofrece en el paso actual: un botón por pantalla.
    accion: i === indiceActual ? p.accion : null,
  }));
  const avance = indiceActual >= n ? 1 : n <= 1 ? 0 : Math.min(1, (indiceActual + Math.max(0, Math.min(1, fraccion)) * 0.5) / (n - 1));
  return { titulo, pasos: conEstado, mensaje, tono: indiceActual >= n ? "listo" : tono, avance, indiceActual };
}

// ─────────────────────────────────────────────────────────────────
// Administrador
// ─────────────────────────────────────────────────────────────────

export type EntradaSemanaSede = {
  hoy: string;
  /** El Highlight de esta semana (null = dirección no asignó). */
  highlight: { texto: string; estado: "pendiente" | "logrado" | "no_logrado" } | null;
  /** Días ya vencidos sin registrar (ventana de 7 días, la misma del panel). */
  faltan: string[];
  /** Días registrados a los que les falta un dato. */
  incompletos: string[];
  /** Los reportes de Byte que le tocan a esta sede y la última vez que se subió cada uno. */
  reportes: { nombre: string; ultimaCarga: string | null }[];
  /** "importado" = el día llega con el reporte de Byte (Atelier). */
  modo: "manual" | "importado";
};

export function seguimientoAdministrador(e: EntradaSemanaSede): Seguimiento {
  const lunes = lunesDe(e.hoy);
  const sabado = sumarDias(lunes, 5);
  const domingo = sumarDias(lunes, 6);
  const total = e.reportes.length;
  const faltanReportes = e.reportes.filter((r) => !r.ultimaCarga || r.ultimaCarga < sabado);
  const subidos = total - faltanReportes.length;
  const reportesListos = faltanReportes.length === 0;
  const registroAlDia = e.faltan.length === 0;
  const hl = e.highlight;
  const hlAbierto = hl?.estado === "pendiente";
  const nombresFaltan = enumerar(faltanReportes.map((r) => r.nombre));

  const pasos: PasoEntrada[] = [
    {
      clave: "highlight", titulo: "Highlight recibido", cuando: "Lunes", hecho: true, alerta: false,
      detalle: hl ? "tu prioridad" : "sin Highlight", accion: null,
    },
    {
      clave: "registro", titulo: "Registro diario", cuando: "Cada día", hecho: registroAlDia, alerta: !registroAlDia,
      detalle: !registroAlDia
        ? (e.faltan.length === 1 ? `falta ${diaCorto(e.faltan[0])}` : `faltan ${e.faltan.length} días`)
        : e.incompletos.length > 0 ? "falta un dato" : "al día",
      accion: { tipo: "evento", evento: "registrar", texto: e.faltan.length > 0 ? `Registrar el ${diaCorto(e.faltan[0])}` : "Registrar el día", fecha: e.faltan[0] ?? e.hoy },
    },
    {
      clave: "reportes", titulo: "Reportes de Byte", cuando: diaCorto(sabado).replace(/^./, (c) => c.toUpperCase()),
      hecho: reportesListos, alerta: !reportesListos && e.hoy > sabado,
      detalle: reportesListos ? `${total} de ${total}` : e.hoy < sabado ? "toca el sábado" : `${subidos} de ${total}`,
      accion: { tipo: "evento", evento: "subir", texto: "Subir reportes de Byte" },
    },
    {
      clave: "cierre", titulo: "Semana cerrada", cuando: "Domingo",
      hecho: !hlAbierto && registroAlDia && reportesListos, alerta: false,
      detalle: hlAbierto ? "cierra tu Highlight" : registroAlDia && reportesListos ? "entregada" : null,
      accion: hlAbierto ? { tipo: "evento", evento: "highlight", texto: "Cerrar mi Highlight" } : null,
    },
  ];

  let mensaje: string;
  let tono: Tono = "normal";
  if (!registroAlDia) {
    tono = "alerta";
    const dias = enumerar(e.faltan.map(diaCorto));
    mensaje = `Falta registrar ${e.faltan.length === 1 ? "el" : "los días"} ${dias}. ` +
      (e.modo === "importado" ? "Llega con el Reporte de Ventas de Byte, o regístralo a mano." : "Hazlo hoy: sin eso no corren tus KPIs, la meta ni el bono.");
  } else if (!reportesListos && e.hoy >= sabado) {
    tono = e.hoy > sabado ? "alerta" : "normal";
    mensaje = `${e.hoy === sabado ? "Hoy toca" : "Ayer tocaba"} subir los reportes de Byte: ${subidos === 0 ? `los ${total}` : `falta${faltanReportes.length === 1 ? "" : "n"} ${nombresFaltan}`}. Del 1 del mes a hoy, todos juntos.`;
  } else if (hlAbierto && e.hoy >= sabado) {
    mensaje = "Solo falta cerrar tu Highlight con el Reflect: es lo último de la semana.";
  } else if (registroAlDia && reportesListos && !hlAbierto) {
    mensaje = `Semana entregada. El lunes ${Number(sumarDias(domingo, 1).slice(8, 10))} llega tu próximo Highlight.`;
  } else {
    mensaje = `Vas al día.${hl && hlAbierto ? ` Tu prioridad de la semana: «${hl.texto}».` : ""} El sábado ${Number(sabado.slice(8, 10))} subes los ${total} reportes de Byte.`;
  }

  // Cuánto lleva el paso actual: del registro, los días al día; de los reportes, los subidos.
  const fraccion = !registroAlDia ? 0 : !reportesListos && total > 0 ? subidos / total : 0;
  return armar("Tu semana", pasos, mensaje, tono, fraccion);
}

// ─────────────────────────────────────────────────────────────────
// CEO · semana
// ─────────────────────────────────────────────────────────────────

export type EntradaSemanaCeo = {
  hoy: string;
  /** La semana que se revisa este lunes (la última completa). */
  semanaRevision: { desde: string; hasta: string };
  revisada: boolean;
  /** Sedes con Highlight asignado esta semana. */
  highlights: { sede: string; asignado: boolean }[];
  porDefinir: number;
  propuestas: number;
  /** El seguimiento de cada sede (el mismo que ve su administrador). */
  sedes: { sede: string; seguimiento: Seguimiento }[];
};

const rango = (r: { desde: string; hasta: string }) => {
  const [a, b] = [r.desde, r.hasta];
  return a.slice(5, 7) === b.slice(5, 7)
    ? `${Number(a.slice(8, 10))} al ${Number(b.slice(8, 10))} ${mesCorto(b)}`
    : `${Number(a.slice(8, 10))} ${mesCorto(a)} al ${Number(b.slice(8, 10))} ${mesCorto(b)}`;
};

/** ¿La sede está al día? Registro sin huecos y, desde el sábado, los reportes subidos. */
function sedeAlDia(s: Seguimiento, hoy: string): boolean {
  const reg = s.pasos.find((p) => p.clave === "registro");
  const rep = s.pasos.find((p) => p.clave === "reportes");
  const sabado = sumarDias(lunesDe(hoy), 5);
  return reg?.estado === "hecho" && (hoy < sabado || rep?.estado === "hecho");
}

export function seguimientoCeoSemana(e: EntradaSemanaCeo): Seguimiento {
  const lunes = lunesDe(e.hoy);
  const sabado = sumarDias(lunes, 5);
  const yaPasoLunes = e.hoy > lunes;
  const sinHl = e.highlights.filter((h) => !h.asignado).map((h) => h.sede);
  const pendientes = e.porDefinir + e.propuestas;
  const alDia = e.sedes.filter((s) => sedeAlDia(s.seguimiento, e.hoy));
  const atrasadas = e.sedes.filter((s) => !sedeAlDia(s.seguimiento, e.hoy));
  const equipoListo = atrasadas.length === 0 && e.hoy >= sabado;

  const pasos: PasoEntrada[] = [
    {
      clave: "revision", titulo: "Revisión del lunes", cuando: "Lunes", hecho: e.revisada, alerta: !e.revisada && yaPasoLunes,
      detalle: e.revisada ? "hecha" : `sem. ${rango(e.semanaRevision)}`,
      accion: { tipo: "ir", href: "/grupo/direccion?vista=control", texto: "Hacer la revisión" },
    },
    {
      clave: "highlight", titulo: "Highlight asignado", cuando: "Lunes", hecho: sinHl.length === 0, alerta: sinHl.length > 0 && yaPasoLunes,
      detalle: `${e.highlights.length - sinHl.length} de ${e.highlights.length}`,
      accion: { tipo: "ir", href: "/grupo/highlight", texto: "Asignar Highlight" },
    },
    {
      clave: "bandeja", titulo: "Pendientes respondidos", cuando: "En la semana", hecho: pendientes === 0, alerta: false,
      detalle: pendientes === 0 ? "nada pendiente" : [e.porDefinir > 0 ? `${e.porDefinir} por definir` : "", e.propuestas > 0 ? `${e.propuestas} propuesta${e.propuestas === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · "),
      accion: e.porDefinir > 0
        ? { tipo: "ir", href: "/grupo/por-definir", texto: "Responder Por definir" }
        : { tipo: "ir", href: "/grupo/highlight", texto: "Responder propuestas" },
    },
    {
      clave: "equipo", titulo: "Sedes al día", cuando: diaCorto(sabado).replace(/^./, (c) => c.toUpperCase()),
      hecho: equipoListo, alerta: atrasadas.length > 0,
      detalle: atrasadas.length > 0 ? `${alDia.length} de ${e.sedes.length}` : e.hoy < sabado ? "suben el sábado" : "todas",
      accion: { tipo: "ir", href: "/grupo/dashboard?pestana=equipo", texto: "Ver el equipo" },
    },
  ];

  let mensaje: string;
  let tono: Tono = "normal";
  if (!e.revisada && yaPasoLunes) {
    tono = "alerta";
    mensaje = `Te falta la revisión de la semana del ${rango(e.semanaRevision)}: son 4 tarjetas, toma 10 minutos.`;
  } else if (sinHl.length > 0 && yaPasoLunes) {
    tono = "alerta";
    mensaje = `${enumerar(sinHl)} ${sinHl.length === 1 ? "no tiene" : "no tienen"} Highlight esta semana: asígnalo para que sepan cuál es su prioridad.`;
  } else if (!e.revisada || sinHl.length > 0) {
    mensaje = `Hoy es lunes: revisa la semana del ${rango(e.semanaRevision)} y deja el Highlight de cada sede.`;
  } else if (atrasadas.length > 0) {
    tono = "alerta";
    mensaje = `${enumerar(atrasadas.map((s) => s.sede))} ${atrasadas.length === 1 ? "está" : "están"} atrasad${atrasadas.length === 1 ? "a" : "as"}: ${atrasadas.map((s) => `${s.sede}, ${s.seguimiento.pasos.find((p) => p.alerta)?.detalle ?? "pendiente"}`).join(" · ")}.`;
  } else if (pendientes > 0) {
    mensaje = `Tienes ${pasos[2].detalle} esperando tu respuesta.`;
  } else if (!equipoListo) {
    mensaje = `Todo en orden. El sábado ${Number(sabado.slice(8, 10))} las sedes suben sus reportes de Byte.`;
  } else {
    mensaje = "Semana en orden: revisada, con Highlight y el equipo al día.";
  }
  return armar("Tu semana", pasos, mensaje, tono, e.sedes.length ? alDia.length / e.sedes.length : 0);
}

// ─────────────────────────────────────────────────────────────────
// CEO · mes
// ─────────────────────────────────────────────────────────────────

export type EntradaMesCeo = {
  hoy: string;
  totalSedes: number;
  /** Sedes con el presupuesto aprobado de este mes y del siguiente. */
  presupuestoMes: number;
  presupuestoSiguiente: number;
  /** Puntos marcados del cierre del mes anterior (de 12). */
  cierreMarcados: number;
  cierreTotal: number;
  /** Sedes con la menor rotación del mes anterior completa. */
  menorAnterior: number;
};

/** Hasta qué día del mes se espera el cierre del anterior. */
export const DIA_LIMITE_CIERRE = 10;
/** Cuántos días antes de fin de mes avisa que falta aprobar el presupuesto siguiente. */
export const DIAS_AVISO_PRESUPUESTO = 5;

export function seguimientoCeoMes(e: EntradaMesCeo): Seguimiento {
  const mes = e.hoy.slice(0, 7);
  const anterior = mesMas(mes, -1);
  const siguiente = mesMas(mes, 1);
  const dia = Number(e.hoy.slice(8, 10));
  const n = e.totalSedes;
  const cierreListo = e.cierreMarcados >= e.cierreTotal;
  const cierreVencido = !cierreListo && dia > DIA_LIMITE_CIERRE;
  const avisoSiguiente = dia > ultimoDia(mes) - DIAS_AVISO_PRESUPUESTO;

  const pasos: PasoEntrada[] = [
    {
      clave: "presupuesto", titulo: `Presupuesto de ${mesCorto(mes)}`, cuando: "Antes del 1",
      hecho: e.presupuestoMes >= n, alerta: e.presupuestoMes < n, detalle: `${e.presupuestoMes} de ${n} sedes`,
      accion: { tipo: "ir", href: "/grupo/presupuesto", texto: `Aprobar el de ${nombreMes(mes)}` },
    },
    {
      clave: "cierre", titulo: `Cierre de ${mesCorto(anterior)}`, cuando: `Del 1 al ${DIA_LIMITE_CIERRE}`,
      hecho: cierreListo, alerta: cierreVencido, detalle: `${e.cierreMarcados} de ${e.cierreTotal}`,
      accion: { tipo: "ir", href: "/grupo/direccion?vista=control", texto: `Cerrar ${nombreMes(anterior)}` },
    },
    {
      clave: "menor", titulo: "Menor rotación", cuando: `De ${mesCorto(anterior)}`,
      hecho: e.menorAnterior >= n, alerta: e.menorAnterior < n && dia > DIA_LIMITE_CIERRE, detalle: `${e.menorAnterior} de ${n} sedes`,
      accion: { tipo: "ir", href: "/grupo/productos", texto: "Subir menor rotación" },
    },
    {
      clave: "siguiente", titulo: `Presupuesto de ${mesCorto(siguiente)}`, cuando: `Antes del 1 ${mesCorto(siguiente)}`,
      hecho: e.presupuestoSiguiente >= n, alerta: e.presupuestoSiguiente < n && avisoSiguiente, detalle: `${e.presupuestoSiguiente} de ${n} sedes`,
      accion: { tipo: "ir", href: "/grupo/presupuesto", texto: `Armar el de ${nombreMes(siguiente)}` },
    },
  ];

  let mensaje: string;
  let tono: Tono = "normal";
  if (e.presupuestoMes < n) {
    tono = "alerta";
    mensaje = `${nombreMes(mes).replace(/^./, (c) => c.toUpperCase())} ya empezó y ${n - e.presupuestoMes === 1 ? "una sede no tiene" : `${n - e.presupuestoMes} sedes no tienen`} presupuesto aprobado: sin él, el control del mes no tiene contra qué comparar.`;
  } else if (!cierreListo) {
    tono = cierreVencido ? "alerta" : "normal";
    mensaje = cierreVencido
      ? `El cierre de ${nombreMes(anterior)} se pasó del día ${DIA_LIMITE_CIERRE}: van ${e.cierreMarcados} de ${e.cierreTotal} puntos.`
      : `Toca cerrar ${nombreMes(anterior)}: van ${e.cierreMarcados} de ${e.cierreTotal} puntos. Lo ideal, antes del día ${DIA_LIMITE_CIERRE}.`;
  } else if (e.menorAnterior < n) {
    mensaje = `Sube la menor rotación de ${nombreMes(anterior)} (${e.menorAnterior} de ${n} sedes): con ella se decide qué sale de la carta.`;
  } else if (e.presupuestoSiguiente < n) {
    tono = avisoSiguiente ? "alerta" : "normal";
    mensaje = avisoSiguiente
      ? `Faltan pocos días para ${nombreMes(siguiente)} y el presupuesto no está aprobado (${e.presupuestoSiguiente} de ${n} sedes).`
      : `Mes en marcha. Antes del 1 de ${nombreMes(siguiente)} aprueba su presupuesto.`;
  } else {
    mensaje = `Mes en orden: ${nombreMes(anterior)} cerrado y ${nombreMes(siguiente)} ya presupuestado.`;
  }
  const actual = pasos.find((p) => !p.hecho);
  const fraccion = actual?.clave === "cierre" ? e.cierreMarcados / Math.max(1, e.cierreTotal) : 0;
  return armar("Tu mes", pasos, mensaje, tono, fraccion);
}
