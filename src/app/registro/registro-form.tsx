"use client";

import { useState } from "react";
import { createSale } from "@/app/actions/sales";
import { createCollection } from "@/app/actions/collections";
import { createExpense } from "@/app/actions/expenses";
import { upsertBankBalance } from "@/app/actions/bank";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { formatCurrency, getYesterday } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { Trash2, Plus, Save, Loader2 } from "lucide-react";

type Client = {
  id: string;
  name: string;
  type: string;
  paymentPattern: string | null;
  isActive: boolean;
  createdAt: Date;
};

type SaleItem = {
  id: string;
  clientId: string;
  clientName: string;
  amount: number;
  discount: number;
  notes: string;
};

type CollectionItem = {
  id: string;
  clientId: string;
  clientName: string;
  amount: number;
  notes: string;
};

type ExpenseItem = {
  id: string;
  category: string;
  concept: string;
  amount: number;
};

export function RegistroForm({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"ventas" | "cobros" | "egresos">("ventas");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Shared date
  const [date, setDate] = useState(getYesterday());

  // Sales state
  const [salesList, setSalesList] = useState<SaleItem[]>([]);
  const [saleClient, setSaleClient] = useState("");
  const [saleAmount, setSaleAmount] = useState("");
  const [saleDiscount, setSaleDiscount] = useState("0");
  const [saleNotes, setSaleNotes] = useState("");

  // Collections state
  const [collectionsList, setCollectionsList] = useState<CollectionItem[]>([]);
  const [colClient, setColClient] = useState("");
  const [colAmount, setColAmount] = useState("");
  const [colNotes, setColNotes] = useState("");

  // Expenses state
  const [expensesList, setExpensesList] = useState<ExpenseItem[]>([]);
  const [expCategory, setExpCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [expConcept, setExpConcept] = useState("");
  const [expAmount, setExpAmount] = useState("");

  // Bank balance
  const [bankClosing, setBankClosing] = useState("");

  function addSale() {
    if (!saleClient || !saleAmount) return;
    const client = clients.find((c) => c.id === saleClient);
    setSalesList([
      ...salesList,
      {
        id: crypto.randomUUID(),
        clientId: saleClient,
        clientName: client?.name || "",
        amount: parseFloat(saleAmount),
        discount: parseFloat(saleDiscount) || 0,
        notes: saleNotes,
      },
    ]);
    setSaleAmount("");
    setSaleDiscount("0");
    setSaleNotes("");
  }

  function addCollection() {
    if (!colClient || !colAmount) return;
    const client = clients.find((c) => c.id === colClient);
    setCollectionsList([
      ...collectionsList,
      {
        id: crypto.randomUUID(),
        clientId: colClient,
        clientName: client?.name || "",
        amount: parseFloat(colAmount),
        notes: colNotes,
      },
    ]);
    setColAmount("");
    setColNotes("");
  }

  function addExpense() {
    if (!expConcept || !expAmount) return;
    setExpensesList([
      ...expensesList,
      {
        id: crypto.randomUUID(),
        category: expCategory,
        concept: expConcept,
        amount: parseFloat(expAmount),
      },
    ]);
    setExpConcept("");
    setExpAmount("");
  }

  async function handleSaveAll() {
    setSaving(true);
    try {
      // Save all sales
      for (const sale of salesList) {
        await createSale({
          clientId: sale.clientId,
          date,
          amount: sale.amount,
          discount: sale.discount,
          notes: sale.notes,
        });
      }

      // Save all collections
      for (const col of collectionsList) {
        await createCollection({
          clientId: col.clientId,
          date,
          amount: col.amount,
          notes: col.notes,
        });
      }

      // Save all expenses
      for (const exp of expensesList) {
        await createExpense({
          date,
          category: exp.category,
          concept: exp.concept,
          amount: exp.amount,
        });
      }

      // Save bank balance if provided
      if (bankClosing) {
        await upsertBankBalance({
          date,
          closingBalance: parseFloat(bankClosing),
        });
      }

      setSaved(true);
      setSalesList([]);
      setCollectionsList([]);
      setExpensesList([]);
      setBankClosing("");
      setTimeout(() => setSaved(false), 3000);
      router.refresh();
    } catch (error) {
      console.error("Error saving:", error);
      alert("Error al guardar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  const totalItems = salesList.length + collectionsList.length + expensesList.length + (bankClosing ? 1 : 0);

  const tabs = [
    { key: "ventas" as const, label: "Ventas Byte", count: salesList.length },
    { key: "cobros" as const, label: "Cobros", count: collectionsList.length },
    { key: "egresos" as const, label: "Egresos", count: expensesList.length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Registro Diario</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">Fecha:</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-white text-primary shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-2 bg-primary-light text-white text-xs px-2 py-0.5 rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {/* VENTAS TAB */}
        {activeTab === "ventas" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <select
                  value={saleClient}
                  onChange={(e) => setSaleClient(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Seleccionar...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
                <input
                  type="number"
                  step="0.01"
                  value={saleAmount}
                  onChange={(e) => setSaleAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descuento</label>
                <input
                  type="number"
                  step="0.01"
                  value={saleDiscount}
                  onChange={(e) => setSaleDiscount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={addSale}
                  disabled={!saleClient || !saleAmount}
                  className="w-full bg-primary text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Agregar venta
                </button>
              </div>
            </div>

            {salesList.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Cliente</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Monto</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Desc.</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Neto</th>
                      <th className="px-4 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {salesList.map((s) => (
                      <tr key={s.id}>
                        <td className="px-4 py-2">{s.clientName}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(s.amount)}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(s.discount)}</td>
                        <td className="px-4 py-2 text-right font-medium">
                          {formatCurrency(s.amount - s.discount)}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => setSalesList(salesList.filter((x) => x.id !== s.id))}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-4 py-2">Total</td>
                      <td className="px-4 py-2 text-right">
                        {formatCurrency(salesList.reduce((s, r) => s + r.amount, 0))}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {formatCurrency(salesList.reduce((s, r) => s + r.discount, 0))}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {formatCurrency(salesList.reduce((s, r) => s + (r.amount - r.discount), 0))}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* COBROS TAB */}
        {activeTab === "cobros" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <select
                  value={colClient}
                  onChange={(e) => setColClient(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Seleccionar...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto cobrado</label>
                <input
                  type="number"
                  step="0.01"
                  value={colAmount}
                  onChange={(e) => setColAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={addCollection}
                  disabled={!colClient || !colAmount}
                  className="w-full bg-primary text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Agregar cobro
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nota (opcional)</label>
              <input
                type="text"
                value={colNotes}
                onChange={(e) => setColNotes(e.target.value)}
                placeholder="Transferencia, depósito, etc."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {collectionsList.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Cliente</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Monto</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Nota</th>
                      <th className="px-4 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {collectionsList.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2">{c.clientName}</td>
                        <td className="px-4 py-2 text-right font-medium text-primary-light">
                          {formatCurrency(c.amount)}
                        </td>
                        <td className="px-4 py-2 text-gray-500">{c.notes || "—"}</td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() =>
                              setCollectionsList(collectionsList.filter((x) => x.id !== c.id))
                            }
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-4 py-2">Total</td>
                      <td className="px-4 py-2 text-right text-primary-light">
                        {formatCurrency(collectionsList.reduce((s, r) => s + r.amount, 0))}
                      </td>
                      <td></td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* EGRESOS TAB */}
        {activeTab === "egresos" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Concepto</label>
                <input
                  type="text"
                  value={expConcept}
                  onChange={(e) => setExpConcept(e.target.value)}
                  placeholder="Descripción del gasto"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
                <input
                  type="number"
                  step="0.01"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={addExpense}
                  disabled={!expConcept || !expAmount}
                  className="w-full bg-primary text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Agregar egreso
                </button>
              </div>
            </div>

            {expensesList.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Categoría</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Concepto</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Monto</th>
                      <th className="px-4 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {expensesList.map((e) => (
                      <tr key={e.id}>
                        <td className="px-4 py-2 text-gray-600">{e.category}</td>
                        <td className="px-4 py-2">{e.concept}</td>
                        <td className="px-4 py-2 text-right font-medium text-red-600">
                          {formatCurrency(e.amount)}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() =>
                              setExpensesList(expensesList.filter((x) => x.id !== e.id))
                            }
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-4 py-2" colSpan={2}>Total</td>
                      <td className="px-4 py-2 text-right text-red-600">
                        {formatCurrency(expensesList.reduce((s, r) => s + r.amount, 0))}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bank Balance */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Saldo de banco al cierre del día</h3>
        <div className="flex gap-4 items-end">
          <div className="flex-1 max-w-xs">
            <input
              type="number"
              step="0.01"
              value={bankClosing}
              onChange={(e) => setBankClosing(e.target.value)}
              placeholder="Saldo del banco hoy"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          {bankClosing && (
            <span className="text-sm text-gray-600 pb-2">
              {formatCurrency(parseFloat(bankClosing) || 0)}
            </span>
          )}
        </div>
      </div>

      {/* Save All */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-6">
        <div className="text-sm text-gray-600">
          {totalItems > 0
            ? `${totalItems} registros pendientes de guardar`
            : "No hay registros pendientes"}
        </div>
        <button
          onClick={handleSaveAll}
          disabled={totalItems === 0 || saving}
          className="bg-primary text-white rounded-lg px-6 py-3 text-sm font-medium hover:bg-primary/90 disabled:opacity-40 flex items-center gap-2"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? "Guardando..." : "Guardar todo"}
        </button>
      </div>

      {saved && (
        <div className="fixed bottom-6 right-6 bg-primary-light text-white px-6 py-3 rounded-lg shadow-lg text-sm font-medium animate-fade-in">
          Todos los registros guardados correctamente
        </div>
      )}
    </div>
  );
}
