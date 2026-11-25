"use client";

/**
 * Filas de tabla que se ordenan arrastrando (pedido de Jahnn, 25-nov-2026: «coger y soltar para cambiar el orden
 * de los ingredientes»). Cada fila es un <tbody> propio (así puede llevar su fila de detalle debajo) y se arrastra
 * desde su asa (⋮⋮). En el celular, mantener apretada el asa un momento. Con teclado: Tab hasta el asa, espacio y
 * flechas.
 */

import type { CSSProperties, ReactNode } from "react";
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

/** Envuelve las filas: `ids` en el orden actual; `onMover` recibe la lista ya reordenada. */
export function TablaOrdenable<T>({ items, idDe, onMover, children }: {
  items: T[];
  idDe: (item: T) => string;
  onMover: (nuevos: T[]) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map(idDe);
  const alSoltar = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const de = ids.indexOf(String(e.active.id));
    const a = ids.indexOf(String(e.over.id));
    if (de < 0 || a < 0) return;
    onMover(arrayMove(items, de, a));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={alSoltar}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>{children}</SortableContext>
    </DndContext>
  );
}

/** Una fila ordenable (un <tbody>). `children` recibe el asa para ponerla donde se quiera. */
export function TbodyOrdenable({ id, children }: { id: string; children: (asa: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
    background: isDragging ? "white" : undefined,
    boxShadow: isDragging ? "0 4px 12px rgba(0,0,0,0.12)" : undefined,
  };
  const asa = (
    <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners}
      className="cursor-grab touch-none rounded p-0.5 text-gray-300 hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing"
      aria-label="Arrastrar para cambiar el orden" title="Arrastrar para cambiar el orden">
      <GripVertical className="h-4 w-4" />
    </button>
  );
  return <tbody ref={setNodeRef} style={style}>{children(asa)}</tbody>;
}
