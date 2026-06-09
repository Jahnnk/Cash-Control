"use client";

import { useActionState } from "react";
import { Loader2, Lock } from "lucide-react";
import { loginWithPassword } from "@/app/actions/auth";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginWithPassword, null);

  return (
    <form
      action={formAction}
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4"
    >
      <div>
        <label
          htmlFor="password"
          className="block text-xs font-medium text-gray-700 mb-1"
        >
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-light/30"
          placeholder="••••••••"
        />
      </div>

      {state?.error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2" role="alert">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-primary text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
        Entrar
      </button>

      <p className="text-[11px] text-gray-400 text-center">
        La sesión dura 30 días en este dispositivo.
      </p>
    </form>
  );
}
