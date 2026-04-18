"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { getLast7Days } from "@/app/actions/reports";
import { formatCurrency, formatDateShort } from "@/lib/utils";

export function Last7DaysReport() {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);

  useEffect(() => {
    getLast7Days().then((r) => setRows(r as Record<string, unknown>[]));
  }, []);

  function editDay(dateStr: string) {
    const d = new Date(dateStr);
    const formatted = d.toISOString().split("T")[0];
    router.push(`/registro?fecha=${formatted}`);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900">Últimos 7 días</h2>
        <p className="text-xs text-gray-500 mt-0.5">Resumen día por día con acceso rápido a edición</p>
      </div>
      {rows === null ? (
        <div className="p-8 text-center text-gray-500 text-sm">Cargando...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-left">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium text-right">Byte Total</th>
                <th className="px-4 py-3 font-medium text-right">Créd. Día</th>
                <th className="px-4 py-3 font-medium text-right">Créd. Cobr.</th>
                <th className="px-4 py-3 font-medium text-right">Ingreso BCP</th>
                <th className="px-4 py-3 font-medium text-right">Egresos</th>
                <th className="px-4 py-3 font-medium text-right">Saldo BCP</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.date as string} className="hover:bg-gray-50 group">
                  <td className="px-4 py-3 font-medium">{formatDateShort(row.date as string)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(row.byte_total as string)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(row.byte_credit_day as string)}</td>
                  <td className="px-4 py-3 text-right text-blue-600">{formatCurrency(row.byte_credit_collected as string)}</td>
                  <td className="px-4 py-3 text-right text-primary-light font-medium">{formatCurrency(row.bank_income as string)}</td>
                  <td className="px-4 py-3 text-right text-red-600">{formatCurrency(row.expenses_total as string)}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {row.bank_balance_real ? formatCurrency(row.bank_balance_real as string) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => editDay(row.date as string)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-primary-light p-1 rounded"
                      title="Editar este día"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">{formatCurrency(sum(rows, "byte_total"))}</td>
                <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(sum(rows, "byte_credit_day"))}</td>
                <td className="px-4 py-3 text-right text-blue-600">{formatCurrency(sum(rows, "byte_credit_collected"))}</td>
                <td className="px-4 py-3 text-right text-primary-light">{formatCurrency(sum(rows, "bank_income"))}</td>
                <td className="px-4 py-3 text-right text-red-600">{formatCurrency(sum(rows, "expenses_total"))}</td>
                <td className="px-4 py-3"></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function sum(rows: Record<string, unknown>[], key: string): number {
  return rows.reduce((s, r) => s + parseFloat((r[key] as string) || "0"), 0);
}
