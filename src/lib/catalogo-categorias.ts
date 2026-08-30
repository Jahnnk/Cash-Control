/**
 * EL CATÁLOGO — la lista única de categorías de gasto de Yayi's.
 *
 * Una sola lista para las tres sedes. Antes cada sede tenía su propio
 * catálogo en la base de datos y se contradecían entre ellas:
 * MANTENIMIENTO era fijo en Centro y variable en Fonavi, OFICINA fijo en
 * Atelier y variable en Fonavi. Comparar sedes con criterios distintos no
 * compara nada. Jahnn aprobó unificar bajo la lista de Centro
 * (30-ago-2026) y este archivo es esa lista.
 *
 * ─── Los cuatro grupos ───
 *
 *   fijo          No cambia aunque vendas más o menos: sueldos, alquiler,
 *                 luz. Es el numerador del punto de equilibrio.
 *   variable      Sube y baja con la venta: insumos, empaques, mercadería.
 *                 Define el margen de contribución.
 *   financiamiento  Cómo se financia el negocio, no cuánto cuesta operarlo:
 *                 cuotas de préstamos y tarjetas. Decisión de Jahnn
 *                 (30-ago-2026) y además es el estándar contable — la "I"
 *                 de EBITDA es Interest, que se excluye por definición.
 *   fuera         No es gasto del negocio: ahorro, utilidades a los socios,
 *                 inversión en el local, préstamos entre sedes.
 *
 * Solo `fijo` y `variable` entran al punto de equilibrio. Los otros dos se
 * ven en los reportes pero no ensucian el número.
 *
 * ─── Por qué vive en el código y no en la base de datos ───
 *
 * Porque es una DECISIÓN de dirección, no un dato. Si vive en la BD, cada
 * import puede crear una categoría suelta y el criterio se desarma solo —
 * que es exactamente lo que venía pasando. Acá está versionado, se revisa
 * en un diff y las tres sedes arrancan del mismo lado.
 *
 * Una sede PUEDE tener una categoría propia que no esté acá (se crea al
 * importar, se clasifica una vez y se respeta). Lo que no puede es
 * contradecir el catálogo en una categoría que sí está.
 */

export type GrupoCategoria = "fijo" | "variable" | "financiamiento" | "fuera";

export type CategoriaCanonica = {
  nombre: string;
  grupo: GrupoCategoria;
  /** Qué entra ahí, en una línea. Se muestra en Configuración y al importar. */
  descripcion: string;
};

export const CATALOGO: CategoriaCanonica[] = [
  // ─── FIJOS ────────────────────────────────────────────────────────
  { nombre: "PLANILLA", grupo: "fijo", descripcion: "Sueldos, bonos, gratificaciones y seguros del equipo" },
  { nombre: "ALQUILER", grupo: "fijo", descripcion: "Alquiler del local" },
  { nombre: "SERVICIOS", grupo: "fijo", descripcion: "Luz, agua, internet, teléfono" },
  { nombre: "CONTABILIDAD", grupo: "fijo", descripcion: "Honorarios del contador" },
  { nombre: "MARKETING", grupo: "fijo", descripcion: "Publicidad y material gráfico (presupuesto mensual)" },
  { nombre: "MANTENIMIENTO", grupo: "fijo", descripcion: "Reparaciones del local y de los equipos" },
  { nombre: "EQUIPOS", grupo: "fijo", descripcion: "Compra de equipos y herramientas" },
  { nombre: "VAJILLA", grupo: "fijo", descripcion: "Platos, vasos, utensilios, enseres de cocina" },
  { nombre: "OFICINA", grupo: "fijo", descripcion: "Útiles de escritorio, papel de contómetro" },
  { nombre: "PERSONAL", grupo: "fijo", descripcion: "Capacitaciones y bienestar del equipo (no sueldos)" },
  { nombre: "SS GENERALES", grupo: "fijo", descripcion: "Uniformes, cartas, señalética, fletes" },
  { nombre: "AUSPICIOS", grupo: "fijo", descripcion: "Auspicios y patrocinios" },
  { nombre: "DECORACIÓN", grupo: "fijo", descripcion: "Decoración del local" },
  { nombre: "CONSULTORÍA", grupo: "fijo", descripcion: "Consultorías y asesorías externas" },
  { nombre: "SS CONTABLES", grupo: "fijo", descripcion: "Servicios contables adicionales" },
  { nombre: "SEGUROS", grupo: "fijo", descripcion: "Pólizas del local y de los equipos" },
  { nombre: "SOFTWARE", grupo: "fijo", descripcion: "Suscripciones y licencias de software" },

  // ─── VARIABLES ────────────────────────────────────────────────────
  { nombre: "PRODUCTOS ATELIER", grupo: "variable", descripcion: "Mercadería comprada a Atelier" },
  { nombre: "INSUMOS", grupo: "variable", descripcion: "Insumos de cocina y barra" },
  { nombre: "PACKAGING", grupo: "variable", descripcion: "Empaques, bolsas, vasos descartables" },
  { nombre: "DELIVERY", grupo: "variable", descripcion: "Movilidad de compras y repartos" },
  { nombre: "CAJA CHICA", grupo: "variable", descripcion: "Gastos menores del día a día" },
  { nombre: "LIMPIEZA", grupo: "variable", descripcion: "Productos e implementos de limpieza" },
  { nombre: "IMPUESTOS", grupo: "variable", descripcion: "Tributos y pagos a SUNAT" },
  { nombre: "SS BANCARIOS", grupo: "variable", descripcion: "Comisiones bancarias e ITF" },
  { nombre: "OTROS", grupo: "variable", descripcion: "Lo que no encaja en ninguna otra" },

  // ─── FINANCIAMIENTO ───────────────────────────────────────────────
  { nombre: "FINANCIAMIENTO", grupo: "financiamiento", descripcion: "Cuotas de préstamos y tarjetas de crédito" },

  // ─── FUERA DEL RESULTADO OPERATIVO ────────────────────────────────
  { nombre: "AHORRO", grupo: "fuera", descripcion: "Traslados a fondos de ahorro — no es gasto" },
  { nombre: "UTILIDADES", grupo: "fuera", descripcion: "Reparto y adelantos de utilidades a los socios" },
  { nombre: "PRESTAMO ATELIER", grupo: "fuera", descripcion: "Préstamos entre sedes — plata que se devuelve" },
  { nombre: "REMODELACIÓN", grupo: "fuera", descripcion: "Obras y mejoras del local — es inversión" },
  { nombre: "VUELTOS Y DEVOLUCIONES", grupo: "fuera", descripcion: "Devoluciones y ajustes de vuelto" },
  // Estas dos ya tienen su propio mecanismo en el sistema (is_special_loan
  // y is_internal_transfer) y por eso nunca entraron al punto de
  // equilibrio. Están acá para que el catálogo diga lo mismo que los
  // flags, en vez de dejarlas apareciendo como "sin clasificar".
  { nombre: "PRESTAMOS SOCIO", grupo: "fuera", descripcion: "Gastos pagados por el socio — tienen su propio módulo" },
  { nombre: "TRANSFERENCIA INTERNA", grupo: "fuera", descripcion: "Plata moviéndose entre cuentas propias" },
];

/** Índice por nombre exacto, para no recorrer la lista en cada consulta. */
const PORNOMBRE = new Map(CATALOGO.map((c) => [c.nombre, c]));

export function esCategoriaDelCatalogo(nombre: string): boolean {
  return PORNOMBRE.has(nombre);
}

export function grupoDelCatalogo(nombre: string): GrupoCategoria | null {
  return PORNOMBRE.get(nombre)?.grupo ?? null;
}

export function categoriaDelCatalogo(nombre: string): CategoriaCanonica | null {
  return PORNOMBRE.get(nombre) ?? null;
}

/** Los nombres canónicos, para el buscador por parecido. */
export const NOMBRES_CANONICOS: string[] = CATALOGO.map((c) => c.nombre);

/**
 * Cómo se guarda un grupo en la base de datos.
 *
 * `expense_categories` tiene dos columnas y no una: `cost_group`
 * ('fijo' | 'variable' | 'financiamiento' | NULL) y el flag canónico
 * `exclude_from_ebitda`. El grupo `fuera` es justamente ese flag sin
 * cost_group; `financiamiento` también se excluye del EBITDA (la "I" de
 * Interest) pero se guarda con nombre propio para poder verlo aparte.
 */
export function grupoAColumnas(grupo: GrupoCategoria): {
  costGroup: string | null;
  excludeFromEbitda: boolean;
} {
  switch (grupo) {
    case "fijo":
      return { costGroup: "fijo", excludeFromEbitda: false };
    case "variable":
      return { costGroup: "variable", excludeFromEbitda: false };
    case "financiamiento":
      return { costGroup: "financiamiento", excludeFromEbitda: true };
    case "fuera":
      return { costGroup: null, excludeFromEbitda: true };
  }
}
