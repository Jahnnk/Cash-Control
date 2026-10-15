/**
 * Rastreador de la semana de cada puesto, al estilo de un pedido de delivery
 * (Rappi / PedidosYa: recibido → en preparación → en camino → entregado).
 *
 * Pedido de Jahnn (11-oct-2026): que cada puesto sepa exactamente qué le
 * toca, qué subir y cuándo, y que el sistema le muestre en todo momento en
 * qué paso va ("visibilidad del estado del sistema", Nielsen).
 *
 * Un recorrido, con reglas a la vista para poder explicarlas:
 *
 *   ADMINISTRADOR (semana de lunes a domingo)
 *     Highlight recibido (lunes) → Registro diario (cada día) →
 *     Reportes de Byte (sábado) → Semana cerrada (Reflect del Highlight)
 *
 * Había también «Tu semana» y «Tu mes» del CEO (11-oct-2026); salieron el
 * 15-oct-2026: Jahnn marcaba «por marcar» y una lista que uno mismo marca no
 * mide nada. Lo que sí comprueba el sistema (Highlight sin asignar, presupuesto
 * sin aprobar) va ahora en «Necesita tu atención» (lib/grupo/atencion.ts).
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

/** «jue 8». */
export function diaCorto(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`;
}
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
