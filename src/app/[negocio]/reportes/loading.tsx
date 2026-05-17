/**
 * Loading skeleton para /[negocio]/reportes. Replica: tabs
 * (Semanal/Mensual/Conciliación), MonthSelector, fila de 5 KPI
 * cards del reporte mensual, sección de drilldown / gráficos
 * abajo.
 */
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <div className="h-10 w-28 rounded-t bg-gray-200" />
        <div className="h-10 w-28 rounded-t bg-gray-100" />
        <div className="h-10 w-32 rounded-t bg-gray-100" />
      </div>

      {/* MonthSelector */}
      <div className="flex items-center justify-between">
        <div className="h-9 w-56 rounded bg-gray-200" />
        <div className="h-9 w-32 rounded bg-gray-200" />
      </div>

      {/* 5 cards del reporte mensual */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-xl bg-white border border-gray-200 p-5">
            <div className="mb-2 h-4 w-32 rounded bg-gray-200" />
            <div className="h-7 w-36 rounded bg-gray-300" />
            <div className="mt-2 h-3 w-44 rounded bg-gray-200" />
          </div>
        ))}
      </div>

      {/* Sección gráfico + tabla por categoría */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <div className="mb-4 h-5 w-44 rounded bg-gray-200" />
          <div className="mx-auto h-64 w-64 rounded-full bg-gray-100" />
        </div>
        <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="h-5 w-40 rounded bg-gray-200" />
          </div>
          <div className="divide-y divide-gray-100">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-gray-300" />
                  <div className="h-4 w-32 rounded bg-gray-200" />
                </div>
                <div className="h-4 w-20 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
