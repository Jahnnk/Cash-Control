"use client";

import { useSearchParams } from "next/navigation";
import { RegistroForm } from "./registro-form";
import { Suspense, useEffect, useState } from "react";
import { getCategories } from "@/app/actions/categories";

function RegistroWithParams() {
  const searchParams = useSearchParams();
  const fechaParam = searchParams.get("fecha");
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCategories(true).then((cats) => {
      setCategories(cats.map((c) => c.name as string));
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;
  return <RegistroForm initialDate={fechaParam} categories={categories} />;
}

export default function RegistroPage() {
  return (
    <Suspense>
      <RegistroWithParams />
    </Suspense>
  );
}
