import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

/**
 * Pantalla de login con contraseña compartida (APP_PASSWORD).
 * Primera barrera real de la app: detrás de ella sigue el selector
 * de rol Jahnn/Kelly (que es prevención de errores, no seguridad).
 */
export default function LoginPage() {
  const configured = !!process.env.APP_PASSWORD;
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
            Yayi&apos;s Cash Control
          </h1>
          <p className="text-gray-500 mt-2 text-base">
            Ingresa la contraseña para continuar
          </p>
        </header>

        {!configured && (
          <div className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            La app aún no tiene contraseña configurada (variable{" "}
            <code className="font-mono text-xs">APP_PASSWORD</code> en Vercel).
            Nadie puede entrar hasta configurarla.
          </div>
        )}

        <LoginForm />
      </div>
    </div>
  );
}
