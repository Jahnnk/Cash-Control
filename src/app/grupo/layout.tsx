import { Sidebar } from "@/components/sidebar";
import { BusinessBanner } from "@/components/business-banner";
import { ToastProvider } from "@/components/toast-provider";

/**
 * Layout del scope consolidado /grupo/...
 *
 * No hay un "negocio activo" — la vista agrega los 3. La cookie + el header
 * x-active-business=grupo los setea el middleware en cada request.
 * ToastProvider: igual que en [negocio] — los componentes del dashboard
 * (deck de KPIs, etc.) usan useToast y sin el provider la página revienta.
 */
export default async function GrupoLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <Sidebar />
      <main className="lg:ml-64 min-h-screen">
        <BusinessBanner scope="grupo" />
        <div className="p-4 pt-6 lg:p-8 lg:pt-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </ToastProvider>
  );
}
