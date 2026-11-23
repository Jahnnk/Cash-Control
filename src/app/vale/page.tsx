import type { Metadata } from "next";
import { CanjeEnCaja } from "@/components/vales/canje-caja";

/**
 * Canje en caja cuando el invitado no puede mostrar el vale en su celular
 * (sin datos o sin pantalla): el cajero escribe el código y el PIN de caja de
 * su sede. Página pública a propósito — los cajeros no tienen cuenta; el PIN
 * es la llave (ver actions/vales-caja.ts).
 */

export const metadata: Metadata = {
  title: "Canje en caja · Yayi's",
  description: "Canje de vales de consumo en caja.",
  robots: { index: false, follow: false },
};

export default function CanjeCajaPage() {
  return (
    <main className="min-h-screen bg-[#F4FAF7] flex items-start sm:items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-lg border border-emerald-100 overflow-hidden">
        <div className="px-6 pt-7 pb-4">
          <h1 className="text-2xl font-extrabold leading-tight text-[#004C40]">Canje de vale en caja</h1>
          <p className="mt-1 text-sm text-gray-600">Escribe el código del vale y el PIN de caja de tu sede.</p>
        </div>
        <div className="px-6 pb-6">
          <CanjeEnCaja />
        </div>
      </div>
    </main>
  );
}
