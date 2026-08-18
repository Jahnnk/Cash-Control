/**
 * ¿Está al día la carga del reporte de productos?
 *
 * Pedido de Jahnn (18-ago-2026): "el sistema deberá reportarme los días
 * de subida de este informe, que idealmente son todos los sábados. Así
 * yo estoy seguro que se sube el reporte siempre y estoy al día".
 *
 * ─── Una aclaración que salió al revisar esto ───
 *
 * El reporte que alimenta Inteligencia Comercial ("Productos con mayor
 * rotación" de Byte) NO lo suben los administradores: sus sesiones están
 * encerradas en `/{sede}/panel` y no pueden entrar a Productos. Lo sube
 * dirección (Jahnn o Kelly). Lo que los administradores sí suben cada
 * semana desde su panel es otra cosa: las Ventas de Byte y los reportes
 * de control.
 *
 * ─── Dos preguntas distintas ───
 *
 * "¿Se subió?" y "¿se subió COMPLETO?" no son lo mismo, y confundirlas
 * deja pasar el caso peor: una carga a tiempo pero truncada. Pasó de
 * verdad — Centro subió agosto con 10 productos cuando sus meses traen
 * entre 99 y 113. Era un export del "Top 10" de Byte, no el reporte
 * entero. Por eso acá se miran las dos cosas.
 */

/** Sábado más reciente (hoy mismo si hoy es sábado), en ISO. */
export function ultimoSabado(hoy: string): string {
  const [y, m, d] = hoy.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  const retroceso = (f.getUTCDay() - 6 + 7) % 7;
  const s = new Date(Date.UTC(y, m - 1, d - retroceso));
  return s.toISOString().slice(0, 10);
}

/** Días enteros entre dos fechas ISO. */
export function diasEntre(desde: string, hasta: string): number {
  const p = (f: string) => {
    const [y, m, d] = f.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((p(hasta) - p(desde)) / 86_400_000);
}

export type CargaSede = {
  businessId: number;
  sede: string;
  /** Fecha (Lima, ISO) de la última carga. null = nunca se subió. */
  ultimaCarga: string | null;
  /** Mes que trajo esa carga ("2026-08"). */
  ultimoMes: string | null;
  /** Cuántos productos trajo la última carga. */
  productosUltimaCarga: number;
  /** Mediana de productos de las cargas anteriores, para comparar. */
  productosHabitual: number | null;
};

export type EstadoCarga = {
  businessId: number;
  sede: string;
  ultimaCarga: string | null;
  ultimoMes: string | null;
  /** Días desde la última carga. null si nunca se subió. */
  diasSinSubir: number | null;
  estado: "al-dia" | "atrasado" | "nunca" | "incompleto";
  /** Frase lista para mostrar. */
  detalle: string;
  productosUltimaCarga: number;
  productosHabitual: number | null;
};

/**
 * Umbral de "carga truncada": menos de la mitad de lo habitual.
 * La mitad es holgado a propósito — un mes flojo puede traer menos
 * productos, pero caer al 10% (el caso de Centro) no es un mes flojo.
 */
const FRACCION_SOSPECHOSA = 0.5;

export function evaluarCarga(c: CargaSede, hoy: string): EstadoCarga {
  const base = {
    businessId: c.businessId,
    sede: c.sede,
    ultimaCarga: c.ultimaCarga,
    ultimoMes: c.ultimoMes,
    productosUltimaCarga: c.productosUltimaCarga,
    productosHabitual: c.productosHabitual,
  };

  if (!c.ultimaCarga) {
    return {
      ...base,
      diasSinSubir: null,
      estado: "nunca",
      detalle: "Nunca se ha subido el reporte de productos de esta sede.",
    };
  }

  const dias = diasEntre(c.ultimaCarga, hoy);
  const sabado = ultimoSabado(hoy);
  const alDia = c.ultimaCarga >= sabado;

  // Una carga truncada pesa MÁS que la puntualidad: llegó a tiempo pero
  // los datos no sirven, y en la pantalla se vería todo en verde.
  if (
    c.productosHabitual !== null &&
    c.productosUltimaCarga < c.productosHabitual * FRACCION_SOSPECHOSA
  ) {
    return {
      ...base,
      diasSinSubir: dias,
      estado: "incompleto",
      detalle:
        `La última carga trajo solo ${c.productosUltimaCarga} productos, ` +
        `cuando lo normal en esta sede son ~${c.productosHabitual}. ` +
        `Parece un export recortado de Byte (el "Top 10"), no el reporte completo.`,
    };
  }

  if (alDia) {
    return {
      ...base,
      diasSinSubir: dias,
      estado: "al-dia",
      detalle:
        dias === 0
          ? "Subido hoy."
          : `Subido hace ${dias} ${dias === 1 ? "día" : "días"}, dentro de la semana en curso.`,
    };
  }

  const semanas = Math.floor(dias / 7);
  return {
    ...base,
    diasSinSubir: dias,
    estado: "atrasado",
    detalle:
      semanas >= 1
        ? `${dias} días sin subir — se saltaron ${semanas} ${semanas === 1 ? "sábado" : "sábados"}.`
        : `${dias} días sin subir: el sábado pasado no se cargó.`,
  };
}

export type ResumenCargas = {
  sedes: EstadoCarga[];
  /** true si ninguna sede está atrasada, incompleta ni sin cargar. */
  todoAlDia: boolean;
  /** Las que piden acción, primero lo más viejo. */
  pendientes: EstadoCarga[];
};

export function evaluarCargas(cargas: CargaSede[], hoy: string): ResumenCargas {
  const sedes = cargas.map((c) => evaluarCarga(c, hoy));
  const pendientes = sedes
    .filter((s) => s.estado !== "al-dia")
    .sort((a, b) => (b.diasSinSubir ?? 99_999) - (a.diasSinSubir ?? 99_999));
  return { sedes, todoAlDia: pendientes.length === 0, pendientes };
}

/** "Atelier (46 días) · Centro (carga incompleta)" */
export function resumenPendientes(r: ResumenCargas): string {
  return r.pendientes
    .map((p) => {
      if (p.estado === "nunca") return `${p.sede} (nunca)`;
      if (p.estado === "incompleto") return `${p.sede} (carga incompleta)`;
      return `${p.sede} (${p.diasSinSubir} días)`;
    })
    .join(" · ");
}
