"use client";

import { useSearchParams } from "next/navigation";
import { RegistroForm } from "./registro-form";
import { Suspense } from "react";

function RegistroWithParams() {
  const searchParams = useSearchParams();
  const fechaParam = searchParams.get("fecha");
  return <RegistroForm initialDate={fechaParam} />;
}

export default function RegistroPage() {
  return (
    <Suspense>
      <RegistroWithParams />
    </Suspense>
  );
}
