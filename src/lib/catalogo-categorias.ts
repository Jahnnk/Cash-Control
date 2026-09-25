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

import { CATEGORIAS_GASTO, type TipoCategoria } from "./reglas-gasto";

export type GrupoCategoria = "fijo" | "variable" | "financiamiento" | "fuera";

export type CategoriaCanonica = {
  nombre: string;
  grupo: GrupoCategoria;
  /** Qué entra ahí, en una línea. Se muestra en Configuración y al importar. */
  descripcion: string;
};

/**
 * Desde el 19-sep-2026 la lista vive en lib/reglas-gasto.ts (la misma que
 * la pestaña CATÁLOGO del Excel de Kelly): acá solo se traduce su Tipo a
 * los cuatro grupos del sistema. Inversión y "No es gasto" van a `fuera`:
 * ninguno de los dos es costo de operar el mes.
 *
 * Cambios contra la lista anterior (aprobados por Jahnn el 19-sep-2026):
 *   · VAJILLA + COCINA + UTENSILIOS → MENAJE Y UTENSILIOS (fijo).
 *   · AUSPICIOS, PUBLICIDAD y DECORACIÓN → MARKETING.
 *   · OFICINA + SOFTWARE → OFICINA Y SISTEMAS.
 *   · CONTABILIDAD + SS CONTABLES + CONSULTORÍA → CONTABILIDAD Y ASESORÍAS.
 *   · FINANCIAMIENTO → PRÉSTAMOS Y TARJETAS; UTILIDADES → UTILIDADES A
 *     SOCIOS; PRESTAMO ATELIER → PRÉSTAMOS ENTRE SEDES; VUELTOS Y
 *     DEVOLUCIONES → DEVOLUCIONES.
 *   · CAJA CHICA y LIMPIEZA pasan a fijo; IMPUESTOS sigue variable (el IR
 *     mensual de la MYPE es un % de las ventas).
 *   · OTROS y SS GENERALES desaparecen: eran bolsones. Lo que ninguna
 *     regla reconoce queda POR ACLARAR (fuera del punto de equilibrio).
 */
const GRUPO_POR_TIPO: Record<TipoCategoria, GrupoCategoria> = {
  Fijo: "fijo", Variable: "variable", Financiamiento: "financiamiento", "Inversión": "fuera", "No es gasto": "fuera",
  // En la base queda fuera del EBITDA; el punto de equilibrio lo cuenta como fijo (lib/fixed-variable.ts).
  Desconocido: "fuera",
};

export const CATALOGO: CategoriaCanonica[] = [
  ...CATEGORIAS_GASTO.map((c) => ({ nombre: c.nombre, grupo: GRUPO_POR_TIPO[c.tipo], descripcion: c.descripcion })),
  // Solo del sistema: tienen su propio mecanismo (is_special_loan e
  // is_internal_transfer) y nunca entran al punto de equilibrio. No van en
  // el Excel de Kelly.
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
