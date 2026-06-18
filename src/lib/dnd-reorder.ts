/**
 * Lógica pura de reordenamiento para el drag & drop de "Movimientos
 * diarios". Separada de la UI para poder testearla sin DOM ni dnd-kit.
 *
 * Modelo: cada columna-día (p. ej. "ingresos del 16-jun") es una lista
 * ordenada de ids. Al soltar un movimiento se recalcula el orden COMPLETO
 * de la columna destino (incluidos los items ocultos por el filtro
 * "Ocultar verificados"), porque al persistir se reasigna sort_order = índice
 * a cada id de esa lista.
 */

/**
 * Inserta `activeId` dentro de `fullIds` en la posición de `overId`.
 *
 * - `fullIds`: orden completo actual de la columna DESTINO (sin importar
 *   qué esté oculto). Si el movimiento viene de otro día, `activeId` aún
 *   no está aquí; si es reordenamiento dentro del mismo día, sí está.
 * - `overId`: el id sobre el que se soltó. Si es `null` (se soltó en el
 *   área vacía de la columna), `activeId` va al final.
 *
 * Devuelve el nuevo orden completo de la columna destino. `activeId`
 * aparece exactamente una vez.
 */
export function reorderColumn(
  fullIds: string[],
  activeId: string,
  overId: string | null,
): string[] {
  if (overId === activeId) return [...fullIds]; // soltó sobre sí mismo: sin cambios
  if (overId == null) {
    // soltó en el área vacía de la columna → al final
    return [...fullIds.filter((id) => id !== activeId), activeId];
  }
  const overIdx = fullIds.indexOf(overId);
  if (overIdx === -1) {
    // overId no pertenece a esta columna (caso raro) → al final
    return [...fullIds.filter((id) => id !== activeId), activeId];
  }
  const from = fullIds.indexOf(activeId);
  const copy = [...fullIds];
  if (from === -1) {
    // viene de OTRO día: se inserta en la posición del 'over'
    copy.splice(overIdx, 0, activeId);
  } else {
    // mismo día: arrayMove(from → overIdx) — al bajar queda DESPUÉS del 'over'
    const [item] = copy.splice(from, 1);
    copy.splice(overIdx, 0, item);
  }
  return copy;
}
