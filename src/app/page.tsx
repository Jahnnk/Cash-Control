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
 * Con rol activo: Jahnn (CEO) aterriza directo en el panel del GRUPO
 * (salud global + por sede); Kelly va al selector de negocio.
 */
export default async function HomeRoleSelector() {
  const existing = await getActiveRole();
  if (existing) redirect(existing === "admin" ? "/grupo/dashboard" : "/select-business");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-2xl">
        <header className="text-center mb-12">
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Yayi&apos;s Cash Control</h1>
          <p className="text-gray-500 mt-2 text-base">¿Quién está usando?</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <RoleCard role="admin" name="Jahnn" />
          <RoleCard role="kelly" name="Kelly" />
        </div>

        <p className="text-center text-xs text-gray-400 mt-12">
          Cajamarca, Perú · La selección se recuerda 30 días.
        </p>
      </div>
    </div>
  );
}

function RoleCard({ role, name }: { role: "admin" | "kelly"; name: string }) {
  // server action bound al rol específico (puro server action, sin client component)
  const action = async () => {
    "use server";
    await selectRole(role);
  };

  return (
    <form action={action}>
      <button
        type="submit"
        className="group w-full bg-white rounded-2xl border border-gray-200 p-12 hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5 active:scale-[0.99] transition-all cursor-pointer flex flex-col items-center justify-center min-h-[200px]"
      >
        <div className="w-16 h-16 rounded-2xl bg-gray-100 text-gray-700 flex items-center justify-center mb-5">
          <User className="w-8 h-8" />
        </div>
        <div className="text-xl font-semibold text-gray-900">{name}</div>
      </button>
    </form>
  );
}
