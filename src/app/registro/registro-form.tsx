"use client";

import { useState, useEffect, useRef } from "react";
import { upsertDailyRecord, getDailyRecord, getLastBankBalance } from "@/app/actions/daily-records";
import { saveBankIncomeItems, getBankIncomeItems, updateBankIncomeItem, deleteBankIncomeItem } from "@/app/actions/bank-income";
import { createExpense, deleteExpense, updateExpense, getExpensesByDate } from "@/app/actions/expenses";
import { formatCurrency, getYesterday } from "@/lib/utils";
import { useRouter } from "next/navigation";
import {
  Trash2, Plus, Save, Loader2, RefreshCw, Pencil, Check, X,
  ArrowDownLeft, ArrowUpRight, ChevronUp, ChevronDown, DollarSign, User,
} from "lucide-react";

type IncomeItem = {
  id: string;
  dbId: string | null;
  amount: number;
  clientId: string | null;
  clientName: string;
  note: string;
};

type ExpenseItem = {
  id: string;
  dbId: string | null; // ID in database (null if not yet saved)
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
  const [activeTab, setActiveTab] = useState<"byte" | "movimientos">("byte");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(initialDate || getYesterday());
  const [editingSaldo, setEditingSaldo] = useState(false);
  const saldoInputRef = useRef<HTMLInputElement>(null);

  // Byte fields
  const [byteCashPhysical, setByteCashPhysical] = useState("0");
  const [byteDigital, setByteDigital] = useState("0");
  const [byteCreditDay, setByteCreditDay] = useState("0");
  const [byteCreditCollected, setByteCreditCollected] = useState("0");
  const [byteDiscounts, setByteDiscounts] = useState("0");
  const [bankBalanceReal, setBankBalanceReal] = useState("");

  // Transactions (Board-style)
  const [incomeItems, setIncomeItems] = useState<IncomeItem[]>([]);
  const [expensesList, setExpensesList] = useState<ExpenseItem[]>([]);

  // Quick-add state
  const [txType, setTxType] = useState<"ingreso" | "egreso">("ingreso");
  const [txAmount, setTxAmount] = useState("");
  const [txClient, setTxClient] = useState("");
  const [txCategory, setTxCategory] = useState(categories[0] || "Otros");
  const [txConcept, setTxConcept] = useState("");
  const [txMethod, setTxMethod] = useState("transferencia");
  const [txNote, setTxNote] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editConcept, setEditConcept] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editMethod, setEditMethod] = useState("");
  const [editClient, setEditClient] = useState("");
  const [editNote, setEditNote] = useState("");

  // Computed
  const byteTotal = parseFloat(byteCashPhysical || "0") + parseFloat(byteDigital || "0") + parseFloat(byteCreditDay || "0");
  const byteCreditBalance = parseFloat(byteCreditDay || "0") - parseFloat(byteCreditCollected || "0");
  const bankIncomeTotal = incomeItems.reduce((s, i) => s + i.amount, 0);
  const expensesTotal = expensesList.reduce((s, i) => s + i.amount, 0);
  const incomeByte = incomeItems.filter((i) => !i.clientId).reduce((s, i) => s + i.amount, 0);
  const incomeClients = incomeItems.filter((i) => i.clientId).reduce((s, i) => s + i.amount, 0);
  const byteExpectedBank = parseFloat(byteDigital || "0") + parseFloat(byteCreditCollected || "0");
  const bankDiff = byteExpectedBank - incomeByte;

  // Load existing record + income items + expenses
  useEffect(() => {
    setLoading(true);
    Promise.all([
      getDailyRecord(date),
      getBankIncomeItems(date),
      getLastBankBalance(date),
      getExpensesByDate(date),
    ]).then(([record, items, lastBalance, existingExpenses]) => {
      if (record) {
        setByteCashPhysical(String(record.byte_cash_physical || 0));
        setByteDigital(String(record.byte_digital || 0));
        setByteCreditDay(String(record.byte_credit_day || 0));
        setByteCreditCollected(String(record.byte_credit_collected || 0));
        setByteDiscounts(String(record.byte_discounts || 0));
        setBankBalanceReal(record.bank_balance_real !== null ? String(record.bank_balance_real) : "");
      } else {
        setByteCashPhysical("0"); setByteDigital("0"); setByteCreditDay("0");
        setByteCreditCollected("0"); setByteDiscounts("0");
        setBankBalanceReal(lastBalance ? String(lastBalance.bank_balance_real) : "");
      }

      // Load income items
      if (items.length > 0) {
        setIncomeItems(items.map((item) => ({
          id: crypto.randomUUID(),
          dbId: (item.id as string) || null,
          amount: Number(item.amount),
          clientId: (item.client_id as string) || null,
          clientName: (item.client_name as string) || "",
          note: (item.note as string) || "",
        })));
      } else if (record && Number(record.bank_income) > 0) {
        setIncomeItems([{ id: crypto.randomUUID(), dbId: null, amount: Number(record.bank_income), clientId: null, clientName: "", note: "Guardado" }]);
      } else {
        setIncomeItems([]);
      }

      // Load existing expenses from DB
      if (existingExpenses.length > 0) {
        setExpensesList(existingExpenses.map((exp) => ({
          id: crypto.randomUUID(),
          dbId: exp.id as string,
          category: exp.category as string,
          concept: exp.concept as string,
          amount: Number(exp.amount),
          paymentMethod: (exp.payment_method as string) || "transferencia",
          isNew: false,
        })));
      } else {
        setExpensesList([]);
      }

      setLoading(false);
    });
  }, [date]);

  function addTransaction() {
    if (!txAmount || parseFloat(txAmount) <= 0) return;

    if (txType === "ingreso") {
      const client = clients.find((c) => c.id === txClient);
      setIncomeItems([...incomeItems, {
        id: crypto.randomUUID(),
        dbId: null,
        amount: parseFloat(txAmount),
        clientId: txClient || null,
        clientName: client?.name || "",
        note: txNote,
      }]);
    } else {
      if (!txConcept) return;
      setExpensesList([...expensesList, {
        id: crypto.randomUUID(),
        dbId: null,
        category: txCategory,
        concept: txConcept,
        amount: parseFloat(txAmount),
        paymentMethod: txMethod,
        isNew: true,
      }]);
      setTxConcept("");
    }

    setTxAmount("");
    setTxNote("");
    amountRef.current?.focus();
  }

  function startEditIncome(item: IncomeItem) {
    setEditingId(item.id);
    setEditAmount(String(item.amount));
    setEditClient(item.clientId || "");
    setEditNote(item.note);
  }

  function startEditExpense(item: ExpenseItem) {
    setEditingId(item.id);
    setEditAmount(String(item.amount));
    setEditConcept(item.concept);
    setEditCategory(item.category);
    setEditMethod(item.paymentMethod);
  }

  async function saveEditIncome(item: IncomeItem) {
    const newAmount = parseFloat(editAmount) || item.amount;
    const client = clients.find((c) => c.id === editClient);
    // Update local state
    setIncomeItems(incomeItems.map((i) =>
      i.id === item.id
        ? { ...i, amount: newAmount, clientId: editClient || null, clientName: client?.name || "", note: editNote }
        : i
    ));
    // Update in DB if saved
    if (item.dbId) {
      await updateBankIncomeItem(item.dbId, { amount: newAmount, clientId: editClient || null, note: editNote });
    }
    setEditingId(null);
  }

  async function saveEditExpense(item: ExpenseItem) {
    const newAmount = parseFloat(editAmount) || item.amount;
    // Update local state
    setExpensesList(expensesList.map((e) =>
      e.id === item.id
        ? { ...e, amount: newAmount, concept: editConcept, category: editCategory, paymentMethod: editMethod }
        : e
    ));
    // Update in DB if saved
    if (item.dbId) {
      await updateExpense(item.dbId, { amount: newAmount, concept: editConcept, category: editCategory, paymentMethod: editMethod });
    }
    setEditingId(null);
  }

  async function handleDeleteIncome(item: IncomeItem) {
    if (item.dbId) await deleteBankIncomeItem(item.dbId);
    setIncomeItems(incomeItems.filter((x) => x.id !== item.id));
  }

  async function handleDeleteExpense(item: ExpenseItem) {
    if (item.dbId) await deleteExpense(item.dbId);
    setExpensesList(expensesList.filter((x) => x.id !== item.id));
  }

  function moveIncome(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= incomeItems.length) return;
    const arr = [...incomeItems];
    [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
    setIncomeItems(arr);
  }

  function moveExpense(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= expensesList.length) return;
    const arr = [...expensesList];
    [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
    setExpensesList(arr);
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
      await saveBankIncomeItems(date, incomeItems.map((i) => ({ amount: i.amount, clientId: i.clientId, note: i.note })));
      for (const exp of expensesList.filter((e) => e.isNew)) {
        await createExpense({ date, category: exp.category, concept: exp.concept, amount: exp.amount, paymentMethod: exp.paymentMethod });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // Reload expenses from DB to show saved items with dbId
      const freshExpenses = await getExpensesByDate(date);
      setExpensesList(freshExpenses.map((exp) => ({
        id: crypto.randomUUID(),
        dbId: exp.id as string,
        category: exp.category as string,
        concept: exp.concept as string,
        amount: Number(exp.amount),
        paymentMethod: (exp.payment_method as string) || "transferencia",
        isNew: false,
      })));
      router.refresh();
    } catch (error) {
      console.error("Error saving:", error);
      alert("Error al guardar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { key: "byte" as const, label: "Byte" },
    { key: "movimientos" as const, label: `Movimientos${(incomeItems.length + expensesList.length) > 0 ? ` (${incomeItems.length + expensesList.length})` : ""}` },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Registro Diario</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">Fecha:</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>

      {/* Saldo BCP */}
      <div className="bg-primary text-white rounded-xl p-5 flex items-center justify-between">
        <div>
          <div className="text-sm text-white/70">Saldo BCP Real</div>
          <div className="text-3xl font-bold">
            {bankBalanceReal ? formatCurrency(parseFloat(bankBalanceReal)) : "—"}
          </div>
        </div>
        {editingSaldo ? (
          <div className="flex items-center gap-2">
            <input
              ref={saldoInputRef}
              type="number"
              step="0.01"
              value={bankBalanceReal}
              onChange={(e) => setBankBalanceReal(e.target.value)}
              placeholder="0.00"
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingSaldo(false); }}
              onBlur={() => setEditingSaldo(false)}
              className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/40 text-right text-lg w-48 focus:bg-white/20"
              autoFocus
            />
          </div>
        ) : (
          <button
            onClick={() => { setEditingSaldo(true); setTimeout(() => saldoInputRef.current?.focus(), 50); }}
            className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2 text-sm text-white/80 transition-colors"
          >
            Editar saldo
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key ? "bg-white text-primary shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />Cargando...
        </div>
      ) : (
        <>
          {/* BYTE TAB */}
          {activeTab === "byte" && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
              {/* Ventas */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Resumen Byte — Ventas</h3>
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
              {/* Totales */}
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Byte — Totales</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Efectivo (caja)" value={byteCashPhysical} onChange={setByteCashPhysical} />
                  <Field label="Digital (Yape+Transfer+Tarjeta+Plin)" value={byteDigital} onChange={setByteDigital} />
                </div>
                <div className="bg-gray-50 rounded-lg p-3 mt-3">
                  <div className="text-xs text-gray-500">Total Byte</div>
                  <div className="text-lg font-bold text-gray-900">{formatCurrency(byteTotal)}</div>
                </div>
              </div>
              {/* Verificación */}
              {(byteExpectedBank > 0 || incomeByte > 0) && (
                <div className={`rounded-lg p-4 border ${Math.abs(bankDiff) < 1 ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
                  <div className="text-sm font-semibold text-gray-900 mb-2">Verificación</div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-gray-500">Byte esperado</div>
                      <div className="font-bold">{formatCurrency(byteExpectedBank)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">BCP real (sin clientes)</div>
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
                      + {formatCurrency(incomeClients)} por pagos de clientes
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* MOVIMIENTOS TAB — Board style */}
          {activeTab === "movimientos" && (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <div className="text-xs text-gray-500 mb-1">Ingresos</div>
                  <div className="text-xl font-bold text-primary-light">{formatCurrency(bankIncomeTotal)}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <div className="text-xs text-gray-500 mb-1">Egresos</div>
                  <div className="text-xl font-bold text-red-600">{formatCurrency(expensesTotal)}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <div className="text-xs text-gray-500 mb-1">Neto</div>
                  <div className={`text-xl font-bold ${bankIncomeTotal - expensesTotal >= 0 ? "text-primary-light" : "text-red-600"}`}>
                    {formatCurrency(bankIncomeTotal - expensesTotal)}
                  </div>
                </div>
              </div>

              {/* Quick add — Board style */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                {/* Type toggle */}
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
                  <button onClick={() => setTxType("ingreso")}
                    className={`flex-1 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                      txType === "ingreso" ? "bg-primary-light text-white shadow-sm" : "text-gray-600"
                    }`}>
                    <ArrowDownLeft className="w-4 h-4" /> Ingreso
                  </button>
                  <button onClick={() => setTxType("egreso")}
                    className={`flex-1 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                      txType === "egreso" ? "bg-red-500 text-white shadow-sm" : "text-gray-600"
                    }`}>
                    <ArrowUpRight className="w-4 h-4" /> Egreso
                  </button>
                </div>

                {/* Amount input — big and prominent */}
                <div className="mb-4">
                  <input ref={amountRef} type="number" step="0.01" value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    placeholder="0.00"
                    onKeyDown={(e) => e.key === "Enter" && addTransaction()}
                    className={`w-full text-center text-3xl font-bold border-0 border-b-2 py-3 focus:outline-none ${
                      txType === "ingreso" ? "border-primary-light text-primary-light" : "border-red-400 text-red-600"
                    }`} />
                </div>

                {/* Context fields */}
                {txType === "ingreso" ? (
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <select value={txClient} onChange={(e) => setTxClient(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      <option value="">Ingreso del día</option>
                      {clients.map((c) => (<option key={c.id} value={c.id}>Pago de {c.name}</option>))}
                    </select>
                    <input type="text" value={txNote} onChange={(e) => setTxNote(e.target.value)}
                      placeholder="Nota (opcional)"
                      onKeyDown={(e) => e.key === "Enter" && addTransaction()}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                ) : (
                  <div className="space-y-3 mb-3">
                    <div className="grid grid-cols-2 gap-3">
                      <select value={txCategory} onChange={(e) => setTxCategory(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                        {categories.map((cat) => (<option key={cat} value={cat}>{cat}</option>))}
                      </select>
                      <select value={txMethod} onChange={(e) => setTxMethod(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                        <option value="transferencia">Transferencia</option>
                        <option value="efectivo">Efectivo</option>
                        <option value="yape">Yape</option>
                      </select>
                    </div>
                    <input type="text" value={txConcept} onChange={(e) => setTxConcept(e.target.value)}
                      placeholder="Concepto del gasto"
                      onKeyDown={(e) => e.key === "Enter" && addTransaction()}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                )}

                <button onClick={addTransaction}
                  disabled={!txAmount || (txType === "egreso" && !txConcept)}
                  className={`w-full py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-40 ${
                    txType === "ingreso" ? "bg-primary-light hover:bg-primary-light/90" : "bg-red-500 hover:bg-red-600"
                  }`}>
                  <Plus className="w-4 h-4" /> Agregar {txType}
                </button>
              </div>

              {/* Transaction feed — Board style */}
              {(incomeItems.length > 0 || expensesList.length > 0) && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="divide-y divide-gray-100">
                    {/* Income items */}
                    {incomeItems.map((item, idx) => (
                      editingId === item.id ? (
                        <div key={item.id} className="px-4 py-3 bg-green-50 space-y-2">
                          <div className="flex items-center gap-2">
                            <input type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)}
                              className="w-28 border border-gray-300 rounded px-2 py-1 text-sm" autoFocus />
                            <select value={editClient} onChange={(e) => setEditClient(e.target.value)}
                              className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm">
                              <option value="">Ingreso del día</option>
                              {clients.map((c) => (<option key={c.id} value={c.id}>Pago de {c.name}</option>))}
                            </select>
                            <input type="text" value={editNote} onChange={(e) => setEditNote(e.target.value)}
                              placeholder="Nota" className="w-28 border border-gray-300 rounded px-2 py-1 text-sm" />
                            <button onClick={() => saveEditIncome(item)} className="text-primary-light p-1"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setEditingId(null)} className="text-gray-400 p-1"><X className="w-4 h-4" /></button>
                          </div>
                        </div>
                      ) : (
                        <div key={item.id} className="flex items-center px-4 py-3 hover:bg-gray-50 group">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${item.clientId ? "bg-blue-100" : "bg-green-100"}`}>
                            {item.clientId ? <User className="w-4 h-4 text-blue-600" /> : <ArrowDownLeft className="w-4 h-4 text-primary-light" />}
                          </div>
                          <div className="ml-3 flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900">{item.clientId ? `Pago de ${item.clientName}` : "Ingreso del día"}</div>
                            {item.note && <div className="text-xs text-gray-500 truncate">{item.note}</div>}
                          </div>
                          <div className="text-sm font-bold text-primary-light ml-3">+{formatCurrency(item.amount)}</div>
                          <div className="flex items-center ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => moveIncome(idx, -1)} disabled={idx === 0}
                              className="text-gray-300 hover:text-gray-500 p-0.5 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                            <button onClick={() => moveIncome(idx, 1)} disabled={idx === incomeItems.length - 1}
                              className="text-gray-300 hover:text-gray-500 p-0.5 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                            <button onClick={() => startEditIncome(item)}
                              className="text-gray-400 hover:text-primary-light p-0.5 ml-1"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleDeleteIncome(item)}
                              className="text-red-400 hover:text-red-600 p-0.5"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      )
                    ))}

                    {/* Expense items */}
                    {expensesList.map((item, idx) => (
                      editingId === item.id ? (
                        <div key={item.id} className="px-4 py-3 bg-red-50 space-y-2">
                          <div className="flex items-center gap-2">
                            <input type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)}
                              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm" autoFocus />
                            <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)}
                              className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm">
                              {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
                            </select>
                            <select value={editMethod} onChange={(e) => setEditMethod(e.target.value)}
                              className="w-28 border border-gray-300 rounded px-2 py-1 text-sm">
                              <option value="transferencia">Transfer.</option>
                              <option value="efectivo">Efectivo</option>
                              <option value="yape">Yape</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <input type="text" value={editConcept} onChange={(e) => setEditConcept(e.target.value)}
                              className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm" placeholder="Concepto" />
                            <button onClick={() => saveEditExpense(item)} className="text-primary-light p-1"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setEditingId(null)} className="text-gray-400 p-1"><X className="w-4 h-4" /></button>
                          </div>
                        </div>
                      ) : (
                        <div key={item.id} className="flex items-center px-4 py-3 hover:bg-gray-50 group">
                          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                            <ArrowUpRight className="w-4 h-4 text-red-600" />
                          </div>
                          <div className="ml-3 flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900">{item.concept}</div>
                            <div className="text-xs text-gray-500 flex items-center gap-2">
                              <span>{item.category}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                item.paymentMethod === "efectivo" ? "bg-amber-100 text-amber-700" :
                                item.paymentMethod === "yape" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                              }`}>
                                {item.paymentMethod === "transferencia" ? "Transfer." : item.paymentMethod === "efectivo" ? "Efectivo" : "Yape"}
                              </span>
                            </div>
                          </div>
                          <div className="text-sm font-bold text-red-600 ml-3">-{formatCurrency(item.amount)}</div>
                          <div className="flex items-center ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => moveExpense(idx, -1)} disabled={idx === 0}
                              className="text-gray-300 hover:text-gray-500 p-0.5 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                            <button onClick={() => moveExpense(idx, 1)} disabled={idx === expensesList.length - 1}
                              className="text-gray-300 hover:text-gray-500 p-0.5 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                            <button onClick={() => startEditExpense(item)}
                              className="text-gray-400 hover:text-primary-light p-0.5 ml-1"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleDeleteExpense(item)}
                              className="text-red-400 hover:text-red-600 p-0.5"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
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
