"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";

export type Align = "left" | "center" | "right";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  align?: Align;
  /** Tailwind class para ancho de la columna (ej: "w-10", "w-32"). */
  width?: string;
  /** Render personalizado de la celda. Si se omite, usa row[key] como string. */
  render?: (row: T, index: number) => ReactNode;
  /** Habilita ordenamiento por esta columna. Si no se pasa `sortValue`, se usa row[key]. */
  sortable?: boolean;
  /** Función opcional que devuelve el valor a ordenar (string|number). */
  sortValue?: (row: T) => string | number;
  /** Clases extra para <td>. */
  cellClassName?: string;
  /** Clases extra para <th>. */
  headerClassName?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  /** Texto a mostrar cuando data está vacío. */
  emptyMessage?: string;
  isLoading?: boolean;
  loadingMessage?: string;
  onRowClick?: (row: T, index: number) => void;
  /** Clases condicionales para destacar filas (ej: bg-amber-50/50 para diferencia). */
  rowClassName?: (row: T, index: number) => string | undefined;
  /** Footer manual (totales, agregaciones). Renderizado tal cual dentro de <tfoot>. */
  footer?: ReactNode;
  /** Tamaño de la tabla — compact reduce padding. */
  size?: "default" | "compact";
  /** Wrap la tabla en una "card" (rounded + border). Default true. */
  withCard?: boolean;
  /** Paginación opcional. */
  pagination?: { pageSize: number };
  /** Mostrar header sticky. Útil en tablas largas. */
  stickyHeader?: boolean;
  /** Función para extraer la key estable de cada fila. */
  rowKey: (row: T, index: number) => string | number;
}

export function DataTable<T>({
  columns,
  data,
  emptyMessage = "No hay datos para mostrar.",
  isLoading = false,
  loadingMessage = "Cargando...",
  onRowClick,
  rowClassName,
  footer,
  size = "default",
  withCard = true,
  pagination,
  stickyHeader = false,
  rowKey,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return data;
    const getValue = (row: T) =>
      col.sortValue ? col.sortValue(row) : ((row as Record<string, unknown>)[sortKey] as string | number);
    const arr = [...data].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (va == null && vb == null) return 0;
      if (va == null) return -1;
      if (vb == null) return 1;
      if (typeof va === "number" && typeof vb === "number") return va - vb;
      return String(va).localeCompare(String(vb), "es");
    });
    return sortDir === "asc" ? arr : arr.reverse();
  }, [data, columns, sortKey, sortDir]);

  const pagedData = useMemo(() => {
    if (!pagination) return sortedData;
    const start = (page - 1) * pagination.pageSize;
    return sortedData.slice(start, start + pagination.pageSize);
  }, [sortedData, pagination, page]);

  const totalPages = pagination ? Math.max(1, Math.ceil(sortedData.length / pagination.pageSize)) : 1;

  function toggleSort(col: DataTableColumn<T>) {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
  }

  const padX = size === "compact" ? "px-3" : "px-4";
  const padY = size === "compact" ? "py-2" : "py-3";

  const tableMarkup = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className={stickyHeader ? "sticky top-0 z-10" : ""}>
          <tr className="bg-gray-50 text-gray-600 text-left">
            {columns.map((col) => {
              const alignClass =
                col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left";
              const isSorted = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  className={`${padX} ${padY} font-medium ${alignClass} ${col.width ?? ""} ${col.headerClassName ?? ""} ${
                    col.sortable ? "cursor-pointer select-none hover:text-gray-900" : ""
                  }`}
                  onClick={col.sortable ? () => toggleSort(col) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable &&
                      (isSorted ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="w-3 h-3 opacity-40" />
                      ))}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {pagedData.map((row, i) => {
            const idx = pagination ? (page - 1) * pagination.pageSize + i : i;
            const customClass = rowClassName?.(row, idx) ?? "";
            const baseClass = customClass.includes("bg-") ? customClass : `${customClass} hover:bg-gray-50`;
            return (
              <tr
                key={rowKey(row, idx)}
                className={`${baseClass} ${onRowClick ? "cursor-pointer" : ""}`.trim()}
                onClick={onRowClick ? () => onRowClick(row, idx) : undefined}
              >
                {columns.map((col) => {
                  const alignClass =
                    col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "";
                  const value = col.render
                    ? col.render(row, idx)
                    : ((row as Record<string, unknown>)[col.key] as ReactNode);
                  return (
                    <td
                      key={col.key}
                      className={`${padX} ${padY} ${alignClass} ${col.cellClassName ?? ""}`.trim()}
                    >
                      {value as ReactNode}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );

  const wrapperClass = withCard ? "bg-white rounded-xl border border-gray-200 overflow-hidden" : "";

  if (isLoading) {
    return (
      <div className={wrapperClass}>
        <div className="p-8 text-center text-gray-500 text-sm">{loadingMessage}</div>
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className={wrapperClass}>
        <div className="p-8 text-center text-gray-500 text-sm">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      {tableMarkup}
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-xs text-gray-600">
          <div>
            Página {page} de {totalPages} · {sortedData.length} filas
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
