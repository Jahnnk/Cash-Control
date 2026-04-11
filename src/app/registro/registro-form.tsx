"use client";

import { useState, useEffect, useRef } from "react";
import { upsertDailyRecord, getDailyRecord } from "@/app/actions/daily-records";
import { saveBankIncomeItems, getBankIncomeItems } from "@/app/actions/bank-income";
import { createExpense } from "@/app/actions/expenses";
import { formatCurrency, getYesterday } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { Trash2, Plus, Save, Loader2, RefreshCw } from "lucide-react";

type IncomeItem = {
  id: string;
  amount: number;
  clientId: string | null;
  clientName: string;
  note: string;
};

type ExpenseItem = {
  id: string;
  category: string;
  concept: string;
  amount: number;
  paymentMethod: string;
  isNew: boolean;
};

type ClientOption = { id: string; name: string };

export function RegistroForm({
  initialDate,
  categories,
  clients,
}: {
  initialDate?: string | null;
  categories: string[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"byte" | "egresos">("byte");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const [date, setDate] = useState(initialDate || getYesterday());

  // Byte fields
  const [byteCashPhysical, setByteCashPhysical] = useState("0");
  const [byteDigital, setByteDigital] = useState("0");
  const [byteCreditDay, setByteCreditDay] = useState("0");
  const [byteCreditCollected, setByteCreditCollected] = useState("0");
  const [byteDiscounts, setByteDiscounts] = useState("0");

  // Bank income: individual items with optional client
  const [incomeItems, setIncomeItems] = useState<IncomeItem[]>([]);
  const [bankBalanceReal, setBankBalanceReal] = useState("");
  const [newIncomeAmt, setNewIncomeAmt] = useState("");
  const [newIncomeClient, setNewIncomeClient] = useState("");
  const [newIncomeNote, setNewIncomeNote] = useState("");
  const incomeInputRef = useRef<HTMLInputElement>(null);

  // Egresos
  const [expensesList, setExpensesList] = useState<ExpenseItem[]>([]);
  const [expCategory, setExpCategory] = useState<string>(categories[0] || "Otros");
  const [expConcept, setExpConcept] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expMethod, setExpMethod] = useState("transferencia");

  // Computed
  const byteContadoTotal = parseFloat(byteCashPhysical || "0") + parseFloat(byteDigital || "0");
  const byteTotal = byteContadoTotal + parseFloat(byteCreditDay || "0");
  const byteCreditBalance = parseFloat(byteCreditDay || "0") - parseFloat(byteCreditCollected || "0");
  const bankIncomeTotal = incomeItems.reduce((s, i) => s + i.amount, 0);
  const expensesTotal = expensesList.reduce((s, i) => s + i.amount, 0);

  // Split income: daily Byte (no client) vs client payments
  const incomeByte = incomeItems.filter((i) => !i.clientId).reduce((s, i) => s + i.amount, 0);
  const incomeClients = incomeItems.filter((i) => i.clientId).reduce((s, i) => s + i.amount, 0);

  // Expected bank income from Byte: Digital + Créd. cobrados
  const byteExpectedBank = parseFloat(byteDigital || "0") + parseFloat(byteCreditCollected || "0");
  // Verification compares Byte expected vs income WITHOUT client (daily Byte income)
  const bankDiff = byteExpectedBank - incomeByte;

  // Load existing record when date changes
  useEffect(() => {
    setLoading(true);
    Promise.all([getDailyRecord(date), getBankIncomeItems(date)]).then(
      ([record, items]) => {
        if (record) {
          setByteCashPhysical(String(record.byte_cash_physical || 0));
          setByteDigital(String(record.byte_digital || 0));
          setByteCreditDay(String(record.byte_credit_day || 0));
          setByteCreditCollected(String(record.byte_credit_collected || 0));
          setByteDiscounts(String(record.byte_discounts || 0));
          setBankBalanceReal(
            record.bank_balance_real !== null ? String(record.bank_balance_real) : ""
          );
        } else {
          setByteCashPhysical("0");
          setByteDigital("0");
          setByteCreditDay("0");
          setByteCreditCollected("0");
          setByteDiscounts("0");
          setBankBalanceReal("");
        }

        // Load saved income items
        if (items.length > 0) {
          setIncomeItems(
            items.map((item) => ({
              id: crypto.randomUUID(),
              amount: Number(item.amount),
              clientId: (item.client_id as string) || null,
              clientName: (item.client_name as string) || "",
              note: (item.note as string) || "",
            }))
          );
        } else if (record && Number(record.bank_income) > 0) {
          // Backward compat: old records without individual items
          setIncomeItems([
            {
              id: crypto.randomUUID(),
              amount: Number(record.bank_income),
              clientId: null,
              clientName: "",
              note: "Guardado (sin detalle)",
            },
          ]);
        } else {
          setIncomeItems([]);
        }

        setExpensesList([]);
        setLoading(false);
      }
    );
  }, [date]);

  function addIncome() {
    if (!newIncomeAmt) return;
    const client = clients.find((c) => c.id === newIncomeClient);
    setIncomeItems([
      ...incomeItems,
      {
        id: crypto.randomUUID(),
        amount: parseFloat(newIncomeAmt),
        clientId: newIncomeClient || null,
        clientName: client?.name || "",
        note: newIncomeNote,
      },
    ]);
    setNewIncomeAmt("");
    setNewIncomeNote("");
    setNewIncomeClient("");
    incomeInputRef.current?.focus();
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
        byteCashPhysical: parseFloat(byteCashPhysical || "0"),
        byteDigital: parseFloat(byteDigital || "0"),
        byteCreditDay: parseFloat(byteCreditDay || "0"),
        byteCreditCollected: parseFloat(byteCreditCollected || "0"),
        byteCreditBalance,
        byteDiscounts: parseFloat(byteDiscounts || "0"),
        byteTotal,
        bankIncome: bankIncomeTotal,
        bankExpense: expensesTotal,
        bankBalanceReal: bankBalanceReal ? parseFloat(bankBalanceReal) : null,
      });

      // Save individual income items with client info
      await saveBankIncomeItems(
        date,
        incomeItems.map((i) => ({
          amount: i.amount,
          clientId: i.clientId,
          note: i.note,
        }))
      );

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
    {
      key: "egresos" as const,
      label: expensesList.length > 0
        ? `Egresos (${expensesList.length}) — ${formatCurrency(expensesTotal)}`
        : "Egresos",
    },
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
              {/* Byte Ventas */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Resumen Byte — Ventas
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Field label="Crédito del día" value={byteCreditDay} onChange={setByteCreditDay} />
                  <Field label="Créditos cobrados" value={byteCreditCollected} onChange={setByteCreditCollected} />
                  <Field label="Descuentos (info)" value={byteDiscounts} onChange={setByteDiscounts} />
                  <div className="bg-gray-50 rounded-lg p-3 flex flex-col justify-center">
                    <div className="text-xs text-gray-500">Saldo créditos</div>
                    <div className={`text-lg font-bold ${byteCreditBalance > 0 ? "text-amber-600" : "text-primary-light"}`}>
                      {formatCurrency(byteCreditBalance)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Byte Totales */}
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Byte — Totales (métodos de cobro)
                </h3>
                <p className="text-xs text-gray-500 mb-3">De la pestaña &quot;Totales&quot; en Byte</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Efectivo <span className="text-xs text-gray-400">(caja física)</span>
                    </label>
                    <input type="number" step="0.01" value={byteCashPhysical}
                      onChange={(e) => setByteCashPhysical(e.target.value)}
                      placeholder="0.00"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Digital <span className="text-xs text-gray-400">(Yape+Transfer+Tarjeta+Plin)</span>
                    </label>
                    <input type="number" step="0.01" value={byteDigital}
                      onChange={(e) => setByteDigital(e.target.value)}
                      placeholder="0.00"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 mt-3">
                  <div className="text-xs text-gray-500">Total Byte (Crédito día + Efectivo + Digital)</div>
                  <div className="text-lg font-bold text-gray-900">{formatCurrency(byteTotal)}</div>
                </div>
              </div>

              {/* Bank Income Section */}
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary-light" />
                  Ingresos BCP (del app del banco)
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Agrega cada ingreso. Si es pago de un cliente por crédito antiguo, selecciona el cliente.
                </p>

                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-gray-600">
                    Total: <span className="font-bold text-primary-light">{formatCurrency(bankIncomeTotal)}</span>
                    {incomeClients > 0 && (
                      <span className="text-xs text-gray-400 ml-2">
                        (Byte día: {formatCurrency(incomeByte)} · Clientes: {formatCurrency(incomeClients)})
                      </span>
                    )}
                  </div>
                </div>

                {/* Add income form */}
                <div className="flex gap-2 mb-2">
                  <input
                    ref={incomeInputRef}
                    type="number"
                    step="0.01"
                    value={newIncomeAmt}
                    onChange={(e) => setNewIncomeAmt(e.target.value)}
                    placeholder="Monto"
                    className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && addIncome()}
                  />
                  <select
                    value={newIncomeClient}
                    onChange={(e) => setNewIncomeClient(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="">Ingreso del día (sin cliente)</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>Pago de {c.name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newIncomeNote}
                    onChange={(e) => setNewIncomeNote(e.target.value)}
                    placeholder="Nota"
                    className="w-32 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
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

                {/* Income items list */}
                {incomeItems.length > 0 && (
                  <div className="space-y-1">
                    {incomeItems.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${
                          item.clientId ? "bg-blue-50" : "bg-green-50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${item.clientId ? "text-blue-700" : "text-primary-light"}`}>
                            {formatCurrency(item.amount)}
                          </span>
                          {item.clientId && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                              {item.clientName}
                            </span>
                          )}
                        </div>
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

                {/* Saldo BCP Real */}
                <div className="mt-4 max-w-xs">
                  <Field label="Saldo BCP Real" value={bankBalanceReal} onChange={setBankBalanceReal} placeholder="Ver en app BCP" />
                </div>
              </div>

              {/* Verification */}
              {(byteExpectedBank > 0 || incomeByte > 0) && (
                <div className={`rounded-lg p-4 ${Math.abs(bankDiff) < 1 ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
                  <div className="text-sm font-semibold text-gray-900 mb-2">Verificación rápida</div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-gray-500">Byte esperado en banco (Digital + Créd. cobr.)</div>
                      <div className="font-bold text-gray-900">{formatCurrency(byteExpectedBank)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Ingresó al BCP (sin pagos de clientes)</div>
                      <div className="font-bold text-primary-light">{formatCurrency(incomeByte)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Diferencia</div>
                      <div className={`font-bold ${Math.abs(bankDiff) < 1 ? "text-green-600" : "text-amber-600"}`}>
                        {Math.abs(bankDiff) < 1 ? "✓ Cuadra" : `${bankDiff > 0 ? "+" : ""}${formatCurrency(bankDiff)}`}
                      </div>
                    </div>
                  </div>
                  {incomeClients > 0 && (
                    <div className="mt-2 text-xs text-blue-700 bg-blue-50 rounded px-2 py-1">
                      Además ingresaron {formatCurrency(incomeClients)} por pagos de clientes (créditos antiguos)
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* EGRESOS TAB */}
          {activeTab === "egresos" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                  <select value={expCategory} onChange={(e) => setExpCategory(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    {categories.map((cat) => (<option key={cat} value={cat}>{cat}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Concepto</label>
                  <input type="text" value={expConcept} onChange={(e) => setExpConcept(e.target.value)}
                    placeholder="Descripción del gasto"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && addExpense()} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
                  <input type="number" step="0.01" value={expAmount} onChange={(e) => setExpAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && addExpense()} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Método</label>
                  <select value={expMethod} onChange={(e) => setExpMethod(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="transferencia">Transferencia</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="yape">Yape</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button onClick={addExpense} disabled={!expConcept || !expAmount}
                    className="w-full bg-primary text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-40 flex items-center justify-center gap-2">
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
                          <td className="px-4 py-2 text-right font-medium text-red-600">{formatCurrency(e.amount)}</td>
                          <td className="px-4 py-2">
                            <button onClick={() => setExpensesList(expensesList.filter((x) => x.id !== e.id))}
                              className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold">
                        <td className="px-4 py-2" colSpan={3}>Total egresos del día</td>
                        <td className="px-4 py-2 text-right text-red-600">{formatCurrency(expensesTotal)}</td>
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
        <button onClick={handleSaveAll} disabled={saving}
          className="bg-primary text-white rounded-lg px-6 py-3 text-sm font-medium hover:bg-primary/90 disabled:opacity-40 flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
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

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type="number" step="0.01" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "0.00"}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
    </div>
  );
}
