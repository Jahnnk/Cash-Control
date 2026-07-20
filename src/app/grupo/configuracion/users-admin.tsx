"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Users, UserPlus, KeyRound, Ban, RotateCcw, Pencil, X, Loader2, Copy, CheckCircle2, ShieldCheck,
} from "lucide-react";
import { useToast } from "@/components/toast-provider";
import {
  listUsers, createUser, resetUserPassword, setUserActive, renameUser, importLegacyUser,
  type AppUser, type UsersOverview,
} from "@/app/actions/users";
import { USER_SCOPES, SCOPE_LABELS, type UserScope } from "@/lib/user-scopes";

/**
 * Gestión de accesos del personal. Principios visibles en la UI:
 *  - La contraseña se muestra UNA vez (al crear/renovar) y se entrega
 *    en persona. Después solo existe "renovar", nunca "ver".
 *  - Inhabilitar corta el acceso al instante, aunque tenga la sesión
 *    abierta en su celular.
 *  - La llave de la dirección no se toca desde aquí (vive en Vercel).
 */

function fmtDate(iso: string | null): string {
  if (!iso) return "nunca";
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") || iso.includes("+") ? "" : "Z"));
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "America/Lima" }) +
    " " + d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
}

export function UsersAdmin() {
  const { showToast } = useToast();
  const [data, setData] = useState<UsersOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [converting, setConverting] = useState<{ scope: UserScope; envVar: string } | null>(null);
  const [renaming, setRenaming] = useState<AppUser | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  // Contraseña recién generada: se enseña UNA vez en un modal.
  const [issued, setIssued] = useState<{ nombre: string; password: string; esNueva: boolean } | null>(null);

  const load = useCallback(async () => {
    const r = await listUsers();
    if (r.ok) { setData(r.data); setError(null); }
    else { setData(null); setError(r.error); }
    setLoading(false);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  async function handleToggleActive(u: AppUser) {
    if (u.active && !window.confirm(`¿Inhabilitar a ${u.nombre}? Pierde el acceso AL INSTANTE, aunque tenga la sesión abierta.`)) return;
    setBusyId(u.id);
    const r = await setUserActive({ id: u.id, active: !u.active });
    setBusyId(null);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(u.active ? `${u.nombre} inhabilitado — ya no puede entrar` : `${u.nombre} reactivado (misma contraseña)`, "success");
    load();
  }

  async function handleReset(u: AppUser) {
    if (!window.confirm(`¿Nueva contraseña para ${u.nombre}? La actual deja de servir al instante y su sesión abierta se cierra.`)) return;
    setBusyId(u.id);
    const r = await resetUserPassword(u.id);
    setBusyId(null);
    if (!r.ok) { showToast(r.error, "error"); return; }
    setIssued({ nombre: u.nombre, password: r.password, esNueva: false });
    load();
  }

  const activos = data?.users.filter((u) => u.active) ?? [];
  const inactivos = data?.users.filter((u) => !u.active) ?? [];
  // Accesos que HOY funcionan con la contraseña por sede de Vercel y aún
  // no tienen usuario propio: se muestran como filas, no se esconden.
  const legacyPending = data?.legacyEnv.filter((l) => l.configured && !l.converted) ?? [];
  const legacyDone = data?.legacyEnv.filter((l) => l.configured && l.converted) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" /> Accesos del equipo
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Quién puede entrar al sistema y con qué rol. Cada persona tiene SU contraseña:
            cuando alguien sale del equipo, inhabilítalo aquí y listo.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark"
        >
          <UserPlus className="w-4 h-4" /> Nuevo acceso
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">Cargando…</div>
      ) : error ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">{error}</div>
      ) : data && (
        <>
          {/* Dirección: informativo, no gestionable a propósito */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="text-xs text-gray-600">
              <strong className="text-gray-900">Dirección</strong> — acceso total. Jahnn con la llave maestra
              (<code className="bg-gray-100 px-1 rounded">APP_PASSWORD</code>) y Kelly con su llave propia
              (<code className="bg-gray-100 px-1 rounded">APP_PASSWORD_KELLY</code>, revocable por separado).
              No se gestionan desde esta pantalla a propósito: se cambian solo en Vercel, para que ningún
              error o mal uso aquí adentro pueda dejarlos fuera de su propia app.
            </div>
          </div>

          {/* Usuarios activos + accesos heredados de Vercel que siguen
              funcionando (contraseña compartida por sede, sin nombre) */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">
              Con acceso ({activos.length + legacyPending.length})
            </div>
            {legacyPending.length > 0 && (
              <div className="border-b border-gray-100">
                {legacyPending.map((l) => (
                  <div key={l.envVar} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 bg-sky-50/50 border-b border-gray-100 last:border-b-0">
                    <div className="text-sm">
                      <span className="font-medium text-gray-900">Sin nombre</span>{" "}
                      <span className="text-gray-600">· {SCOPE_LABELS[l.scope]}</span>
                      <div className="text-[11px] text-gray-400">
                        Entra con la contraseña compartida de la sede (creada en Vercel: <code>{l.envVar}</code>)
                      </div>
                    </div>
                    <button
                      onClick={() => setConverting({ scope: l.scope, envVar: l.envVar })}
                      className="text-xs px-2.5 py-1 border border-sky-200 rounded-lg text-sky-700 hover:bg-sky-50"
                      title="Crea el usuario con nombre CONSERVANDO su misma contraseña"
                    >
                      <UserPlus className="w-3 h-3 inline mr-1" />Ponerle nombre
                    </button>
                  </div>
                ))}
              </div>
            )}
            {activos.length === 0 && legacyPending.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">
                Aún no hay usuarios. Crea el primero con “Nuevo acceso”.
              </div>
            ) : activos.length === 0 ? null : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase text-gray-500 bg-gray-50">
                      <th className="text-left px-4 py-2 font-medium">Persona</th>
                      <th className="text-left px-4 py-2 font-medium">Rol</th>
                      <th className="text-left px-4 py-2 font-medium">Último ingreso</th>
                      <th className="text-right px-4 py-2 font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activos.map((u) => (
                      <tr key={u.id} className="border-t border-gray-100">
                        <td className="px-4 py-2.5 font-medium text-gray-900">
                          {u.nombre}
                          <button onClick={() => setRenaming(u)} className="ml-1.5 text-gray-300 hover:text-primary" title="Renombrar">
                            <Pencil className="w-3 h-3 inline" />
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{SCOPE_LABELS[u.scope]}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{fmtDate(u.lastLogin)}</td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <button
                            onClick={() => handleReset(u)}
                            disabled={busyId === u.id}
                            className="text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 mr-1.5"
                            title="Genera una contraseña nueva; la actual muere al instante"
                          >
                            <KeyRound className="w-3 h-3 inline mr-1" />Nueva contraseña
                          </button>
                          <button
                            onClick={() => handleToggleActive(u)}
                            disabled={busyId === u.id}
                            className="text-xs px-2.5 py-1 border border-red-200 rounded-lg text-red-600 hover:bg-red-50"
                            title="Le corta el acceso al instante"
                          >
                            <Ban className="w-3 h-3 inline mr-1" />Inhabilitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Inhabilitados */}
          {inactivos.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-500">
                Sin acceso ({inactivos.length})
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {inactivos.map((u) => (
                    <tr key={u.id} className="border-t border-gray-100 text-gray-400">
                      <td className="px-4 py-2.5">{u.nombre}</td>
                      <td className="px-4 py-2.5">{SCOPE_LABELS[u.scope]}</td>
                      <td className="px-4 py-2.5 text-xs">último ingreso: {fmtDate(u.lastLogin)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => handleToggleActive(u)}
                          disabled={busyId === u.id}
                          className="text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                        >
                          <RotateCcw className="w-3 h-3 inline mr-1" />Reactivar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Accesos ya convertidos: último paso manual en Vercel */}
          {legacyDone.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
              <strong>Último paso (en Vercel):</strong> estos accesos ya tienen su usuario con nombre, así que
              borra sus variables viejas{" "}
              {legacyDone.map((l) => <code key={l.envVar} className="bg-amber-100 px-1 rounded mr-1">{l.envVar}</code>)}
              en Vercel → Settings → Environment Variables y redeploya. No corre prisa (la contraseña es la misma
              por ambos caminos), pero mientras existan, “Inhabilitar” y “Nueva contraseña” no surten efecto
              completo: la contraseña compartida vieja seguiría abriendo la puerta.
            </div>
          )}
        </>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(nombre, password) => {
            setShowCreate(false);
            setIssued({ nombre, password, esNueva: true });
            load();
          }}
        />
      )}

      {renaming && (
        <RenameModal
          user={renaming}
          onClose={() => setRenaming(null)}
          onSaved={() => { setRenaming(null); load(); }}
        />
      )}

      {converting && (
        <ConvertModal
          scope={converting.scope}
          envVar={converting.envVar}
          onClose={() => setConverting(null)}
          onSaved={() => { setConverting(null); load(); }}
        />
      )}

      {issued && <PasswordOnceModal issued={issued} onClose={() => setIssued(null)} />}
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (nombre: string, password: string) => void }) {
  const { showToast } = useToast();
  const [nombre, setNombre] = useState("");
  const [scope, setScope] = useState<UserScope>("admin-fonavi");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    setSaving(true);
    const r = await createUser({ nombre, scope });
    setSaving(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    onCreated(nombre.trim(), r.password);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" /> Nuevo acceso
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] uppercase text-gray-500">Nombre de la persona</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. María Quispe"
              autoFocus
              className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase text-gray-500">Rol (qué pantalla puede usar)</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as UserScope)}
              className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              {USER_SCOPES.map((s) => <option key={s} value={s}>{SCOPE_LABELS[s]}</option>)}
            </select>
          </div>
          <p className="text-[11px] text-gray-400">
            La contraseña se genera sola (fuerte y fácil de dictar) y se muestra UNA sola vez al crear el acceso.
          </p>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button
            onClick={handleCreate}
            disabled={saving || nombre.trim().length < 2}
            className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Crear acceso
          </button>
        </div>
      </div>
    </div>
  );
}

/** Convierte un acceso heredado de Vercel en usuario con nombre,
 * conservando la MISMA contraseña — nadie tiene que aprenderse otra. */
function ConvertModal({ scope, envVar, onClose, onSaved }: { scope: UserScope; envVar: string; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const [nombre, setNombre] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleConvert() {
    setSaving(true);
    const r = await importLegacyUser({ scope, nombre });
    setSaving(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(`${nombre.trim()} creado con su misma contraseña de siempre`, "success");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" /> Ponerle nombre al acceso
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          {SCOPE_LABELS[scope]} — el usuario se crea <strong>conservando su misma contraseña de siempre</strong>:
          la persona no nota ningún cambio. Al final, borra <code className="bg-gray-100 px-1 rounded">{envVar}</code> en
          Vercel para que el control quede solo en esta pantalla.
        </p>
        <label className="text-[11px] uppercase text-gray-500">¿Quién usa este acceso?</label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Luis"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && !saving && nombre.trim().length >= 2) handleConvert(); }}
          className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button
            onClick={handleConvert}
            disabled={saving || nombre.trim().length < 2}
            className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Crear usuario
          </button>
        </div>
      </div>
    </div>
  );
}

function RenameModal({ user, onClose, onSaved }: { user: AppUser; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const [nombre, setNombre] = useState(user.nombre);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const r = await renameUser({ id: user.id, nombre });
    setSaving(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-gray-900 mb-3">Renombrar</h3>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && !saving) handleSave(); }}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || nombre.trim().length < 2}
            className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/** La contraseña recién generada: visible UNA vez, con copia al portapapeles. */
function PasswordOnceModal({ issued, onClose }: { issued: { nombre: string; password: string; esNueva: boolean }; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(issued.password);
      setCopied(true);
    } catch { /* http local sin clipboard — queda la copia manual */ }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-primary" />
          {issued.esNueva ? `Acceso creado para ${issued.nombre}` : `Contraseña nueva de ${issued.nombre}`}
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Cópiala AHORA: por seguridad no se guarda y no se puede volver a ver. Si se pierde, se genera otra.
        </p>
        <div className="bg-gray-900 text-emerald-300 font-mono text-base rounded-lg px-4 py-3 text-center select-all break-all">
          {issued.password}
        </div>
        <button
          onClick={copy}
          className="w-full mt-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5"
        >
          {copied ? <><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Copiada</> : <><Copy className="w-4 h-4" /> Copiar</>}
        </button>
        <div className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          🤝 Entrégala <strong>en persona</strong> (o dictada por llamada). Nunca por escrito en manuales ni papeles.
          No hay usuario: con el link y esta contraseña la persona ya entra a su pantalla.
        </div>
        <button
          onClick={onClose}
          className="w-full mt-3 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark"
        >
          Ya la entregué / la guardé
        </button>
      </div>
    </div>
  );
}
