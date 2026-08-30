/**
 * EL RESOLVEDOR — de lo que escribió Kelly a una categoría del catálogo.
 *
 * Pedido de Jahnn (30-ago-2026): "que el sistema recategorice, elimine,
 * una y corrija cada categoría y no deje ningún egreso suelto", sin que
 * Kelly tenga que cambiar su Excel.
 *
 * Trabaja en cuatro pasadas, de la más segura a la más arriesgada, y se
 * detiene en la primera que acierta:
 *
 *   1. EXACTA     · el nombre ya es del catálogo (ignorando tildes y
 *                   MAYÚSCULAS). "Insumos" → INSUMOS.
 *   2. ALIAS      · está en el diccionario de equivalencias decididas a
 *                   mano. "COCINA" → VAJILLA, "FLETE" → SS GENERALES.
 *   3. PARECIDO   · se parece tanto a un nombre del catálogo que solo
 *                   puede ser un error de tipeo. "MANTENIENTO" →
 *                   MANTENIMIENTO. Esta pasada atrapa los typos que
 *                   nadie escribió todavía en el diccionario.
 *   4. DESCONOCIDA· no se parece a nada. NO se inventa nada: se devuelve
 *                   tal cual para que dirección la clasifique al importar.
 *
 * ─── Por qué la pasada 3 es tan desconfiada ───
 *
 * Corregir por parecido es útil para los typos y peligroso para todo lo
 * demás. Si el sistema mete una categoría genuinamente nueva dentro de la
 * más parecida, el gasto termina en el lugar equivocado y nadie se entera
 * nunca — que es bastante peor que verlo suelto.
 *
 * El caso real que fijó las reglas (Fonavi, ago-2026): la categoría se
 * llamaba "PENDIENTE" y el concepto decía "SIS – Joseph & Luana", o sea
 * seguro de salud, o sea planilla. Ningún parecido de NOMBRE lleva de
 * "PENDIENTE" a "PLANILLA". Ese caso tiene que llegarle a Jahnn, no
 * resolverse solo.
 *
 * De ahí los tres candados: nombres cortos no se corrigen nunca, la
 * diferencia tiene que ser mínima en términos absolutos Y relativos, y si
 * hay empate entre dos candidatos se descarta por ambiguo.
 */

import {
  NOMBRES_CANONICOS,
  categoriaDelCatalogo,
  type GrupoCategoria,
} from "./catalogo-categorias";
import { categoriaCanonica, esVarianteConocida } from "./categoria-alias";

export type ConfianzaCategoria = "exacta" | "alias" | "parecido" | "desconocida";

export type ResolucionCategoria = {
  /** Lo que vino en el Excel, sin tocar. */
  entrada: string;
  /** El nombre con el que se va a guardar. */
  canonica: string;
  /** Grupo del catálogo, o null si es desconocida (dirección decide). */
  grupo: GrupoCategoria | null;
  confianza: ConfianzaCategoria;
  /** Por qué se resolvió así, en una línea, para mostrarlo al importar. */
  motivo: string;
};

/** Sin tildes, sin espacios de sobra, en MAYÚSCULA. */
function normalizar(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/**
 * Distancia de edición (Levenshtein): cuántas letras hay que cambiar,
 * agregar o borrar para pasar de una palabra a la otra.
 * "MANTENIENTO" → "MANTENIMIENTO" son 2.
 */
function distancia(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const siguiente = [i];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      siguiente[j] = Math.min(
        fila[j] + 1,        // borrar
        siguiente[j - 1] + 1, // insertar
        fila[j - 1] + costo,  // sustituir
      );
    }
    fila = siguiente;
  }
  return fila[b.length];
}

/**
 * Los candados de la corrección por parecido. Cambiar estos números
 * cambia cuántos typos se atrapan y cuántas categorías legítimas se
 * comen por error — mover con cuidado y con los tests delante.
 */
const MIN_LARGO = 5;        // "G", "OK", "SIS" nunca se corrigen por parecido
const MAX_DISTANCIA = 2;    // hasta dos letras de diferencia
const MAX_PROPORCION = 0.34; // …y nunca más de un tercio de la palabra

/**
 * El nombre del catálogo más parecido, o null si ninguno pasa los
 * candados o si hay empate (ambiguo = no se toca).
 */
function masParecida(nombreNormalizado: string): string | null {
  if (nombreNormalizado.length < MIN_LARGO) return null;

  let mejor: string | null = null;
  let mejorDist = Infinity;
  let empatada = false;

  for (const canonica of NOMBRES_CANONICOS) {
    const d = distancia(nombreNormalizado, normalizar(canonica));
    if (d < mejorDist) {
      mejorDist = d;
      mejor = canonica;
      empatada = false;
    } else if (d === mejorDist) {
      empatada = true;
    }
  }

  if (mejor === null || empatada) return null;
  if (mejorDist > MAX_DISTANCIA) return null;

  const largoMayor = Math.max(nombreNormalizado.length, normalizar(mejor).length);
  if (mejorDist / largoMayor > MAX_PROPORCION) return null;

  return mejor;
}

/** El nombre del catálogo que coincide exacto ignorando tildes y caso. */
function coincidenciaExacta(nombreNormalizado: string): string | null {
  for (const canonica of NOMBRES_CANONICOS) {
    if (normalizar(canonica) === nombreNormalizado) return canonica;
  }
  return null;
}

/**
 * Resuelve una categoría cruda del Excel.
 *
 * Nunca devuelve vacío: si no reconoce nada, devuelve el nombre limpio
 * con `grupo: null` y confianza "desconocida" — la señal de que hay que
 * preguntarle a dirección antes de guardar.
 */
export function resolverCategoria(nombre: string | null | undefined): ResolucionCategoria {
  const entrada = String(nombre ?? "").trim();

  if (!entrada) {
    const cat = categoriaDelCatalogo("OTROS");
    return {
      entrada,
      canonica: "OTROS",
      grupo: cat?.grupo ?? "variable",
      confianza: "alias",
      motivo: "La fila vino sin categoría — va a OTROS.",
    };
  }

  const norm = normalizar(entrada);

  // 1 · Exacta (ignorando tildes y MAYÚSCULAS).
  const exacta = coincidenciaExacta(norm);
  if (exacta) {
    return {
      entrada,
      canonica: exacta,
      grupo: categoriaDelCatalogo(exacta)!.grupo,
      confianza: "exacta",
      motivo: "Ya es una categoría del catálogo.",
    };
  }

  // 2 · Diccionario de equivalencias decididas a mano.
  if (esVarianteConocida(entrada)) {
    const traducida = categoriaCanonica(entrada);
    const cat = categoriaDelCatalogo(traducida);
    if (cat) {
      return {
        entrada,
        canonica: cat.nombre,
        grupo: cat.grupo,
        confianza: "alias",
        motivo: `Equivalencia conocida: "${entrada}" es ${cat.nombre}.`,
      };
    }
  }

  // 3 · Parecido tipográfico (los typos que nadie anotó todavía).
  const parecida = masParecida(norm);
  if (parecida) {
    return {
      entrada,
      canonica: parecida,
      grupo: categoriaDelCatalogo(parecida)!.grupo,
      confianza: "parecido",
      motivo: `Parece un error de tipeo de ${parecida}.`,
    };
  }

  // 4 · Desconocida. No se inventa: se pregunta.
  return {
    entrada,
    canonica: entrada,
    grupo: null,
    confianza: "desconocida",
    motivo: "No se parece a ninguna categoría conocida — hay que clasificarla.",
  };
}

/** Resuelve una lista y devuelve solo las que necesitan decisión humana. */
export function categoriasQueNecesitanDecision(
  nombres: string[],
): ResolucionCategoria[] {
  const vistas = new Set<string>();
  const pendientes: ResolucionCategoria[] = [];
  for (const n of nombres) {
    const r = resolverCategoria(n);
    if (r.confianza !== "desconocida") continue;
    const clave = normalizar(r.canonica);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    pendientes.push(r);
  }
  return pendientes;
}
