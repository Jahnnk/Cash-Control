/**
 * Loading skeleton para /[negocio]/presupuesto. Replica:
 * MonthSelector, 3 cards de resumen (Presupuesto total, Ejecutado,
 * % avance), tabla de categorías con barras de progreso.
 */
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header + MonthSelector */}
      <div className="flex items-center justify-between">
        <div className="h-9 w-56 rounded bg-gray-200" />
        <div className="h-9 w-32 rounded bg-gray-200" />
      </div>

      {/* 3 cards de resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl bg-white border border-gray-200 p-5">
            <div className="mb-2 h-4 w-32 rounded bg-gray-200" />
            <div className="h-7 w-36 rounded bg-gray-300" />
          </div>
        ))}
      </div>

      {/* Tabla de categorías */}
      <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="h-5 w-48 rounded bg-gray-200" />
          <div className="h-8 w-36 rounded bg-gray-200" />
        </div>
        <div className="divide-y divide-gray-100">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="px-6 py-4">
              <div className="flex items-center justify-between mb-2">
                <div className="h-4 w-40 rounded bg-gray-200" />
                <div className="h-4 w-24 rounded bg-gray-200" />
              </div>
              <div className="h-2 w-full rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-gray-200" style={{ width: `${(i * 11) % 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
