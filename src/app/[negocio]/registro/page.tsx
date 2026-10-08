"use client";

import { useParams, useSearchParams } from "next/navigation";
import { RegistroForm } from "./registro-form";
import { Suspense, useEffect, useState } from "react";
import { getCategories } from "@/app/actions/categories";
import { getClients } from "@/app/actions/clients";
import { getLiquidezGrupo } from "@/app/actions/liquidez";

const SEDE: Record<string, number> = { atelier: 1, fonavi: 2, centro: 3 };

type ClientOption = { id: string; name: string };

function RegistroWithParams() {
  const searchParams = useSearchParams();
  const fechaParam = searchParams.get("fecha");
  const tipoParam = searchParams.get("tipo");
  const initialTxType: "ingreso" | "egreso" | undefined =
    tipoParam === "ingreso" ? "ingreso" : tipoParam === "gasto" ? "egreso" : undefined;
  // Pre-fill desde el panel de Investigación de conciliación (Fase 2).
  // El panel arma URLs como
  //   ?tipo=ingreso&prefill_amount=29.45&prefill_method=yape_plin
  const prefillAmountStr = searchParams.get("prefill_amount");
  const prefillAmount = prefillAmountStr ? parseFloat(prefillAmountStr) : null;
  const prefillMethod = searchParams.get("prefill_method") ?? null;
  const [categories, setCategories] = useState<string[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const params = useParams<{ negocio?: string }>();
  const businessId = SEDE[params?.negocio ?? "atelier"] ?? 1;
  const [bancoExcel, setBancoExcel] = useState<{ banco: number | null; caja: number; fecha: string | null } | null>(null);

  useEffect(() => {
    Promise.all([getCategories(true), getClients(true), getLiquidezGrupo()]).then(([cats, cls, liq]) => {
      setCategories(cats.map((c) => c.name as string));
      setClients(cls.map((c) => ({ id: c.id, name: c.name })));
      const s = liq?.sedes.find((x) => x.businessId === businessId);
      setBancoExcel(s ? { banco: s.banco, caja: s.caja, fecha: s.fecha } : null);
      setLoading(false);
    });
  }, [businessId]);

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;
  return (
    <RegistroForm
      initialDate={fechaParam}
      categories={categories}
      clients={clients}
      initialTxType={initialTxType}
      initialTxAmount={prefillAmount && prefillAmount > 0 ? prefillAmount : undefined}
      initialTxMethod={prefillMethod ?? undefined}
      bancoExcel={bancoExcel}
    />
  );
}

export default function RegistroPage() {
  return (
    <Suspense>
      <RegistroWithParams />
    </Suspense>
  );
}
