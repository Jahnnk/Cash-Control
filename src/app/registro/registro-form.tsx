"use client";

import { useState, useEffect, useRef } from "react";
import { upsertDailyRecord, getDailyRecord } from "@/app/actions/daily-records";
import { createExpense } from "@/app/actions/expenses";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { formatCurrency, getYesterday } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { Trash2, Plus, Save, Loader2, RefreshCw } from "lucide-react";

type AmountItem = { id: string; amount: number; note: string };

type ExpenseItem = {
  id: string;
  category: string;
  concept: string;
  amount: number;
  paymentMethod: string;
  isNew: boolean;
};

export function RegistroForm({ initialDate }: { initialDate?: string | null }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"byte" | "egresos">("byte");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const [date, setDate] = useState(initialDate || getYesterday());

  // Byte fields
  const [byteCash, setByteCash] = useState("0");
  const [byteCreditDay, setByteCreditDay] = useState("0");
  const [byteCreditCollected, setByteCreditCollected] = useState("0");
  const [byteDiscounts, setByteDiscounts] = useState("0");

  // Bank: lists of individual amounts
  const [incomeItems, setIncomeItems] = useState<AmountItem[]>([]);
  const [expenseItems, setExpenseItems] = useState<AmountItem[]>([]);
  const [bankBalanceReal, setBankBalanceReal] = useState("");

  // New income/expense inputs
  const [newIncomeAmt, setNewIncomeAmt] = useState("");
  const [newIncomeNote, setNewIncomeNote] = useState("");
  const [newExpenseAmt, setNewExpenseAmt] = useState("");
  const [newExpenseNote, setNewExpenseNote] = useState("");

  const incomeInputRef = useRef<HTMLInputElement>(null);
  const expenseInputRef = useRef<HTMLInputElement>(null);

  // Expenses tab
  const [expensesList, setExpensesList] = useState<ExpenseItem[]>([]);
  const [expCategory, setExpCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [expConcept, setExpConcept] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expMethod, setExpMethod] = useState("transferencia");

  // Computed - Total Byte = Contado + Crédito del día (descuentos NO restan)
  const byteTotal = parseFloat(byteCash || "0") + parseFloat(byteCreditDay || "0");
  const byteCreditBalance = parseFloat(byteCreditDay || "0") - parseFloat(byteCreditCollected || "0");
  const bankIncomeTotal = incomeItems.reduce((s, i) => s + i.amount, 0);
  const bankExpenseTotal = expenseItems.reduce((s, i) => s + i.amount, 0);

  // Load existing record when date changes
  useEffect(() => {
    setLoading(true);
    getDailyRecord(date).then((record) => {
      if (record) {
        setByteCash(String(record.byte_cash || 0));
        setByteCreditDay(String(record.byte_credit_day || 0));
        setByteCreditCollected(String(record.byte_credit_collected || 0));
        setByteDiscounts(String(record.byte_discounts || 0));
        setBankBalanceReal(
          record.bank_balance_real !== null ? String(record.bank_balance_real) : ""
        );
        // Load saved totals as a single item each (from DB we only have totals)
        const savedIncome = Number(record.bank_income) || 0;
        const savedExpense = Number(record.bank_expense) || 0;
        setIncomeItems(
          savedIncome > 0
            ? [{ id: crypto.randomUUID(), amount: savedIncome, note: "Guardado" }]
            : []
        );
        setExpenseItems(
          savedExpense > 0
            ? [{ id: crypto.randomUUID(), amount: savedExpense, note: "Guardado" }]
            : []
        );
      } else {
        setByteCash("0");
        setByteCreditDay("0");
        setByteCreditCollected("0");
        setByteDiscounts("0");
        setBankBalanceReal("");
        setIncomeItems([]);
        setExpenseItems([]);
      }
      setLoading(false);
    });
  }, [date]);

  function addIncome() {
    if (!newIncomeAmt) return;
    setIncomeItems([
      ...incomeItems,
      { id: crypto.randomUUID(), amount: parseFloat(newIncomeAmt), note: newIncomeNote },
    ]);
    setNewIncomeAmt("");
    setNewIncomeNote("");
    incomeInputRef.current?.focus();
  }

  function addBankExpense() {
    if (!newExpenseAmt) return;
    setExpenseItems([
      ...expenseItems,
      { id: crypto.randomUUID(), amount: parseFloat(newExpenseAmt), note: newExpenseNote },
    ]);
    setNewExpenseAmt("");
    setNewExpenseNote("");
    expenseInputRef.current?.focus();
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
        paymentMethod: expMethod,
        isNew: true,
      },
    ]);
    setExpConcept("");
    setExpAmount("");
  }

  async function handleSaveAll() {
    setSaving(true);
    try {
      await upsertDailyRecord({
        date,
        byteCash: parseFloat(byteCash || "0"),
        byteCreditDay: parseFloat(byteCreditDay || "0"),
        byteCreditCollected: parseFloat(byteCreditCollected || "0"),
        byteCreditBalance,
        byteDiscounts: parseFloat(byteDiscounts || "0"),
        byteTotal,
        bankIncome: bankIncomeTotal,
        bankExpense: bankExpenseTotal,
        bankBalanceReal: bankBalanceReal ? parseFloat(bankBalanceReal) : null,
      });

      for (const exp of expensesList.filter((e) => e.isNew)) {
        await createExpense({
          date,
          category: exp.category,
          concept: exp.concept,
          amount: exp.amount,
          paymentMethod: exp.paymentMethod,
        });
      }

      setSaved(true);
      setExpensesList([]);
      setTimeout(() => setSaved(false), 3000);
      router.refresh();
    } catch (error) {
      console.error("Error saving:", error);
      alert("Error al guardar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { key: "byte" as const, label: "Byte + Banco" },
    { key: "egresos" as const, label: `Egresos${expensesList.length > 0 ? ` (${expensesList.length})` : ""}` },
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
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
          Cargando...
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {/* BYTE + BANCO TAB */}
          {activeTab === "byte" && (
            <div className="space-y-6">
              {/* Byte Section */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Resumen Byte
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Field label="Contado" value={byteCash} onChange={setByteCash} />
                  <Field label="Crédito del día" value={byteCreditDay} onChange={setByteCreditDay} />
                  <Field label="Créditos cobrados" value={byteCreditCollected} onChange={setByteCreditCollected} />
                  <Field label="Descuentos (info)" value={byteDiscounts} onChange={setByteDiscounts} />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Total Byte (Contado + Crédito)</div>
                    <div className="text-lg font-bold text-gray-900">
                      {formatCurrency(byteTotal)}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Saldo créditos</div>
                    <div className={`text-lg font-bold ${byteCreditBalance > 0 ? "text-amber-600" : "text-primary-light"}`}>
                      {formatCurrency(byteCreditBalance)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bank Section */}
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary-light" />
                  Cuentas Bancarias (BCP)
                </h3>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Ingresos BCP */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700">Ingresos BCP</label>
                      <span className="text-sm font-bold text-primary-light">{formatCurrency(bankIncomeTotal)}</span>
                    </div>
                    <div className="flex gap-2 mb-2">
                      <input
                        ref={incomeInputRef}
                        type="number"
                        step="0.01"
                        value={newIncomeAmt}
                        onChange={(e) => setNewIncomeAmt(e.target.value)}
                        placeholder="Monto"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                        onKeyDown={(e) => e.key === "Enter" && addIncome()}
                      />
                      <input
                        type="text"
                        value={newIncomeNote}
                        onChange={(e) => setNewIncomeNote(e.target.value)}
                        placeholder="Nota (opc.)"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                        onKeyDown={(e) => e.key === "Enter" && addIncome()}
                      />
                      <button
                        onClick={addIncome}
                        disabled={!newIncomeAmt}
                        className="bg-primary-light text-white rounded-lg px-3 py-1.5 text-sm hover:bg-primary-light/90 disabled:opacity-40"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    {incomeItems.length > 0 && (
                      <div className="space-y-1">
                        {incomeItems.map((item) => (
                          <div key={item.id} className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-1.5 text-sm">
                            <span className="text-primary-light font-medium">{formatCurrency(item.amount)}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500 text-xs">{item.note}</span>
                              <button
                                onClick={() => setIncomeItems(incomeItems.filter((x) => x.id !== item.id))}
                                className="text-red-400 hover:text-red-600"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Egresos BCP */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700">Egresos BCP</label>
                      <span className="text-sm font-bold text-red-600">{formatCurrency(bankExpenseTotal)}</span>
                    </div>
                    <div className="flex gap-2 mb-2">
                      <input
                        ref={expenseInputRef}
                        type="number"
                        step="0.01"
                        value={newExpenseAmt}
                        onChange={(e) => setNewExpenseAmt(e.target.value)}
                        placeholder="Monto"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                        onKeyDown={(e) => e.key === "Enter" && addBankExpense()}
                      />
                      <input
                        type="text"
                        value={newExpenseNote}
                        onChange={(e) => setNewExpenseNote(e.target.value)}
                        placeholder="Nota (opc.)"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                        onKeyDown={(e) => e.key === "Enter" && addBankExpense()}
                      />
                      <button
                        onClick={addBankExpense}
                        disabled={!newExpenseAmt}
                        className="bg-red-500 text-white rounded-lg px-3 py-1.5 text-sm hover:bg-red-600 disabled:opacity-40"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    {expenseItems.length > 0 && (
                      <div className="space-y-1">
                        {expenseItems.map((item) => (
                          <div key={item.id} className="flex items-center justify-between bg-red-50 rounded-lg px-3 py-1.5 text-sm">
                            <span className="text-red-600 font-medium">{formatCurrency(item.amount)}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500 text-xs">{item.note}</span>
                              <button
                                onClick={() => setExpenseItems(expenseItems.filter((x) => x.id !== item.id))}
                                className="text-red-400 hover:text-red-600"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Saldo BCP Real */}
                <div className="mt-4 max-w-xs">
                  <Field label="Saldo BCP Real" value={bankBalanceReal} onChange={setBankBalanceReal} placeholder="Ver en app BCP" />
                </div>
              </div>
            </div>
          )}

          {/* EGRESOS TAB */}
          {activeTab === "egresos" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
                    onKeyDown={(e) => e.key === "Enter" && addExpense()}
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
                    onKeyDown={(e) => e.key === "Enter" && addExpense()}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Método</label>
                  <select
                    value={expMethod}
                    onChange={(e) => setExpMethod(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="transferencia">Transferencia</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="yape">Yape</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={addExpense}
                    disabled={!expConcept || !expAmount}
                    className="w-full bg-primary text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Agregar
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
                        <th className="px-4 py-2 text-center font-medium text-gray-600">Método</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-600">Monto</th>
                        <th className="px-4 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {expensesList.map((e) => (
                        <tr key={e.id}>
                          <td className="px-4 py-2 text-gray-600">{e.category}</td>
                          <td className="px-4 py-2">{e.concept}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              e.paymentMethod === "efectivo" ? "bg-amber-50 text-amber-700" :
                              e.paymentMethod === "yape" ? "bg-purple-50 text-purple-700" :
                              "bg-blue-50 text-blue-700"
                            }`}>
                              {e.paymentMethod === "transferencia" ? "Transfer." : e.paymentMethod === "efectivo" ? "Efectivo" : "Yape"}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right font-medium text-red-600">
                            {formatCurrency(e.amount)}
                          </td>
                          <td className="px-4 py-2">
                            <button
                              onClick={() => setExpensesList(expensesList.filter((x) => x.id !== e.id))}
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
                        <td className="px-4 py-2" colSpan={3}>Total</td>
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
      )}

      {/* Save */}
      <div className="flex items-center justify-end">
        <button
          onClick={handleSaveAll}
          disabled={saving}
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
        <div className="fixed bottom-6 right-6 bg-primary-light text-white px-6 py-3 rounded-lg shadow-lg text-sm font-medium">
          Guardado correctamente
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  color,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  color?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "0.00"}
        className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm ${color || ""}`}
      />
    </div>
  );
}
