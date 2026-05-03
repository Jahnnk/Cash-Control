import { redirect } from "next/navigation";
import { User } from "lucide-react";
import { getActiveRole } from "@/lib/role";
import { selectRole } from "@/app/actions/role";

export const dynamic = "force-dynamic";

/**
 * Pantalla raíz: selector de rol (Jahnn vs Kelly).
 *
 * NO es login con contraseña. Es prevención de errores accidentales
 * para que Kelly no entre a Atelier sin querer. Si alguien usa URL
 * hackeada puede bypass-ear esto — no es seguridad, es UX defensiva.
 *
 * Si ya hay rol activo, redirige a /select-business para que elija
 * negocio (NO redirige al último negocio usado, para forzar paso
 * consciente cada vez que reabre la app).
 */
export default async function HomeRoleSelector() {
  const existing = await getActiveRole();
  if (existing) redirect("/select-business");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-2xl">
        <header className="text-center mb-12">
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Yayi&apos;s Cash Control</h1>
          <p className="text-gray-500 mt-2 text-base">¿Quién está usando?</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <RoleCard role="admin" name="Jahnn" description="Acceso total a los 3 negocios" />
          <RoleCard role="kelly" name="Kelly" description="Fonavi y Centro" />
        </div>

        <p className="text-center text-xs text-gray-400 mt-12">
          Cajamarca, Perú · La selección se recuerda 30 días.
        </p>
      </div>
    </div>
  );
}

function RoleCard({ role, name, description }: { role: "admin" | "kelly"; name: string; description: string }) {
  // server action bound al rol específico (puro server action, sin client component)
  const action = async () => {
    "use server";
    await selectRole(role);
  };

  return (
    <form action={action}>
      <button
        type="submit"
        className="group w-full bg-white rounded-2xl border border-gray-200 p-8 hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5 active:scale-[0.99] transition-all text-left cursor-pointer"
      >
        <div className="w-14 h-14 rounded-xl bg-gray-100 text-gray-700 flex items-center justify-center mb-5">
          <User className="w-7 h-7" />
        </div>
        <div className="text-lg font-semibold text-gray-900">{name}</div>
        <div className="text-sm text-gray-500 mt-1">{description}</div>
      </button>
    </form>
  );
}
