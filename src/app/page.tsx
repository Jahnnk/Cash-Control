import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChefHat, Coffee, Building2, BarChart3 } from "lucide-react";
import { ACTIVE_BUSINESS_COOKIE } from "@/lib/active-business";
import { isValidBusinessCode } from "@/lib/businesses";

export const dynamic = "force-dynamic";

/**
 * Pantalla raíz: selector de negocio.
 *
 * Si la cookie ya tiene un negocio válido, redirige directo a su
 * /[negocio]/dashboard (UX: el usuario habitual no ve esta pantalla
 * más que la primera vez o cuando explícitamente cambia).
 */
export default async function HomeSelector() {
  const c = await cookies();
  const cookieVal = c.get(ACTIVE_BUSINESS_COOKIE)?.value;
  if (cookieVal && isValidBusinessCode(cookieVal)) {
    redirect(`/${cookieVal}/dashboard`);
  }
  if (cookieVal === "grupo") {
    redirect(`/grupo/dashboard`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-3xl">
        <header className="text-center mb-12">
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Yayi&apos;s Cash Control</h1>
          <p className="text-gray-500 mt-2 text-base">¿Qué negocio gestionar?</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <BusinessCard
            href="/atelier/dashboard"
            icon={<ChefHat className="w-7 h-7" />}
            title="Yayi's Atelier"
            description="Centro de producción · B2B"
            accent="primary"
          />
          <BusinessCard
            href="/fonavi/dashboard"
            icon={<Coffee className="w-7 h-7" />}
            title="Yayi's Fonavi"
            description="Cafetería Fonavi"
            accent="violet"
          />
          <BusinessCard
            href="/centro/dashboard"
            icon={<Building2 className="w-7 h-7" />}
            title="Yayi's Centro"
            description="Cafetería Centro"
            accent="amber"
          />
        </div>

        <div className="mt-6">
          <Link
            href="/grupo/dashboard"
            className="group block bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5 active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gray-100 text-gray-700 flex items-center justify-center shrink-0">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <div className="text-base font-semibold text-gray-900">Grupo Yayi&apos;s</div>
                <div className="text-sm text-gray-500">Vista consolidada de los 3 negocios</div>
              </div>
            </div>
          </Link>
        </div>

        <p className="text-center text-xs text-gray-400 mt-12">
          Cajamarca, Perú
        </p>
      </div>
    </div>
  );
}

function BusinessCard({
  href, icon, title, description, accent,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  accent: "primary" | "violet" | "amber";
}) {
  const accentBg =
    accent === "primary" ? "bg-primary/10 text-primary" :
    accent === "violet"  ? "bg-violet-100 text-violet-700" :
                           "bg-amber-100 text-amber-700";

  return (
    <Link
      href={href}
      className="group block bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5 active:scale-[0.99] transition-all"
    >
      <div className={`w-12 h-12 rounded-xl ${accentBg} flex items-center justify-center mb-4`}>
        {icon}
      </div>
      <div className="text-base font-semibold text-gray-900">{title}</div>
      <div className="text-sm text-gray-500 mt-0.5">{description}</div>
    </Link>
  );
}
