import { redirect } from "next/navigation";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { getActiveRole, allowedScopesForRole } from "@/lib/role";
import { BUSINESS_THEMES, type ScopeCode } from "@/lib/business-theme";

export const dynamic = "force-dynamic";

/**
 * Pantalla de selección de negocio. Solo accesible si hay un rol activo.
 * Filtra los negocios mostrados según el rol:
 *   - admin (Jahnn): ve los 3 negocios + Grupo.
 *   - kelly: solo Fonavi, Centro y Grupo (sin Atelier).
 */
export default async function SelectBusinessPage() {
  const role = await getActiveRole();
  if (!role) redirect("/");

  const allowed = allowedScopesForRole(role);
  const isKelly = role === "kelly";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-3xl">
        <header className="text-center mb-12">
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Yayi&apos;s Cash Control</h1>
          <p className="text-gray-500 mt-2 text-base">¿Qué negocio gestionar?</p>
          <p className="text-xs text-gray-400 mt-2">
            Estás como{" "}
            <span className="font-medium text-gray-600">{isKelly ? "Kelly" : "Jahnn"}</span>{" "}
            ·{" "}
            <Link href="/" className="text-primary-light hover:underline">cambiar usuario</Link>
          </p>
        </header>

        <div className={"grid grid-cols-1 sm:grid-cols-3 gap-4"}>
          {(["atelier", "fonavi", "centro"] as ScopeCode[])
            .filter((code) => allowed.includes(code))
            .map((code) => (
              <BusinessCard key={code} code={code} />
            ))}
        </div>

        <div className="mt-6">
          <Link
            href="/grupo/dashboard"
            className="group block bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all"
            style={{ borderTopColor: BUSINESS_THEMES.grupo.color, borderTopWidth: 3 }}
          >
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: BUSINESS_THEMES.grupo.colorSoft, color: BUSINESS_THEMES.grupo.color }}
              >
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <div className="text-base font-semibold text-gray-900">Grupo Yayi&apos;s</div>
                <div className="text-sm text-gray-500">Vista consolidada de los 3 negocios</div>
              </div>
            </div>
          </Link>
        </div>

        <p className="text-center text-xs text-gray-400 mt-12">Cajamarca, Perú</p>
      </div>
    </div>
  );
}

function BusinessCard({ code }: { code: ScopeCode }) {
  const t = BUSINESS_THEMES[code];
  const Icon = t.icon;
  return (
    <Link
      href={`/${code}/dashboard`}
      className="group block bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all"
      style={{ borderTopColor: t.color, borderTopWidth: 3 }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
        style={{ backgroundColor: t.colorSoft, color: t.color }}
      >
        <Icon className="w-7 h-7" />
      </div>
      <div className="text-base font-semibold text-gray-900">{t.label}</div>
      <div className="text-sm text-gray-500 mt-0.5">{t.description}</div>
    </Link>
  );
}
