"use client";

import { useSearchParams } from "next/navigation";
import { RegistroForm } from "./registro-form";
import { Suspense, useEffect, useState } from "react";
import { getCategories } from "@/app/actions/categories";
import { getClients } from "@/app/actions/clients";

type ClientOption = { id: string; name: string };

function RegistroWithParams() {
  const searchParams = useSearchParams();
  const fechaParam = searchParams.get("fecha");
  const [categories, setCategories] = useState<string[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getCategories(true), getClients(true)]).then(([cats, cls]) => {
      setCategories(cats.map((c) => c.name as string));
      setClients(cls.map((c) => ({ id: c.id, name: c.name })));
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;
  return <RegistroForm initialDate={fechaParam} categories={categories} clients={clients} />;
}

export default function RegistroPage() {
  return (
    <Suspense>
      <RegistroWithParams />
    </Suspense>
  );
}
