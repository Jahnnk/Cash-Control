"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { getLast7Days } from "@/app/actions/reports";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { DataTable } from "@/components/ui/DataTable";

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

  const data = rows ?? [];
  const isLoading = rows === null;

  const footer = data.length > 0 ? (
    <tr className="bg-gray-50 font-semibold">
      <td className="px-4 py-3">Total</td>
      <td className="px-4 py-3 text-right">{formatCurrency(sum(data, "byte_total"))}</td>
      <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(sum(data, "byte_credit_day"))}</td>
      <td className="px-4 py-3 text-right text-blue-600">{formatCurrency(sum(data, "byte_credit_collected"))}</td>
      <td className="px-4 py-3 text-right text-primary-light">{formatCurrency(sum(data, "bank_income"))}</td>
      <td className="px-4 py-3 text-right text-red-600">{formatCurrency(sum(data, "expenses_total"))}</td>
      <td className="px-4 py-3"></td>
      <td></td>
    </tr>
  ) : undefined;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900">Últimos 7 días</h2>
        <p className="text-xs text-gray-500 mt-0.5">Resumen día por día con acceso rápido a edición</p>
      </div>
      <DataTable
        rowKey={(row) => row.date as string}
        data={data}
        isLoading={isLoading}
        withCard={false}
        footer={footer}
        columns={[
          { key: "date", header: "Fecha", cellClassName: "font-medium", render: (row) => formatDateShort(row.date as string) },
          { key: "byte_total", header: "Byte Total", align: "right", render: (row) => formatCurrency(row.byte_total as string) },
          { key: "byte_credit_day", header: "Créd. Día", align: "right", cellClassName: "text-gray-600", render: (row) => formatCurrency(row.byte_credit_day as string) },
          { key: "byte_credit_collected", header: "Créd. Cobr.", align: "right", cellClassName: "text-blue-600", render: (row) => formatCurrency(row.byte_credit_collected as string) },
          { key: "bank_income", header: "Ingreso BCP", align: "right", cellClassName: "text-primary-light font-medium", render: (row) => formatCurrency(row.bank_income as string) },
          { key: "expenses_total", header: "Egresos", align: "right", cellClassName: "text-red-600", render: (row) => formatCurrency(row.expenses_total as string) },
          { key: "bank_balance_real", header: "Saldo BCP", align: "right", cellClassName: "font-semibold", render: (row) => row.bank_balance_real ? formatCurrency(row.bank_balance_real as string) : "—" },
          {
            key: "edit",
            header: "",
            width: "w-10",
            render: (row) => (
              <button
                onClick={() => editDay(row.date as string)}
                className="text-gray-400 hover:text-primary-light p-1 rounded"
                title="Editar este día"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            ),
          },
        ]}
      />
    </div>
  );
}

function sum(rows: Record<string, unknown>[], key: string): number {
  return rows.reduce((s, r) => s + parseFloat((r[key] as string) || "0"), 0);
}
