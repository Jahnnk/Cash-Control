/** Valida la ficha de un financiamiento que llena Jahnn (solo comprueba, no toca la base). Lo vacío queda en null = «falta dato». */

export type FichaFinanciamiento = {
  id?: number; businessId: number; nombre: string; acreedor?: string | null; patron?: string | null;
  diaPago?: number | null; cuota?: number | null; montoOriginal?: number | null; cuotasTotal?: number | null;
  incluyeIntereses?: boolean | null; desde?: string | null;
};
export type FichaLimpia = Required<Omit<FichaFinanciamiento, "id">> & { id: number | null };

const vacio = (v: unknown) => v === undefined || v === null || v === "";
const positivo = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0;

export function validarFinanciamiento(f: FichaFinanciamiento): { ok: true; ficha: FichaLimpia } | { ok: false; error: string } {
  if (![1, 2, 3].includes(f?.businessId)) return { ok: false, error: "Elige la sede que paga esta deuda." };
  const nombre = (f.nombre ?? "").trim();
  if (!nombre) return { ok: false, error: "Ponle un nombre a la deuda (por ejemplo: Préstamo familiar)." };
  if (nombre.length > 80) return { ok: false, error: "El nombre es muy largo (máximo 80 letras)." };
  if (!vacio(f.cuota) && !positivo(f.cuota)) return { ok: false, error: "La cuota debe ser un monto mayor que cero." };
  if (!vacio(f.montoOriginal) && !positivo(f.montoOriginal)) return { ok: false, error: "El monto original debe ser mayor que cero." };
  if (!vacio(f.cuotasTotal) && !(Number.isInteger(f.cuotasTotal) && (f.cuotasTotal as number) > 0)) return { ok: false, error: "El número de cuotas debe ser un entero mayor que cero." };
  if (!vacio(f.diaPago) && !(Number.isInteger(f.diaPago) && (f.diaPago as number) >= 1 && (f.diaPago as number) <= 31)) return { ok: false, error: "El día de pago debe estar entre 1 y 31." };
  const patron = (f.patron ?? "").trim();
  if (patron) { try { new RegExp(patron, "i"); } catch { return { ok: false, error: "La palabra para reconocer los pagos no es válida." }; } }
  const desde = (f.desde ?? "").trim();
  if (desde && (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || Number.isNaN(Date.parse(`${desde}T12:00:00Z`)))) return { ok: false, error: "La fecha de inicio no es válida." };
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    ok: true,
    ficha: {
      id: f.id ?? null, businessId: f.businessId, nombre, acreedor: (f.acreedor ?? "").trim() || null, patron: patron || null,
      diaPago: vacio(f.diaPago) ? null : (f.diaPago as number), cuota: vacio(f.cuota) ? null : r2(f.cuota as number),
      montoOriginal: vacio(f.montoOriginal) ? null : r2(f.montoOriginal as number), cuotasTotal: vacio(f.cuotasTotal) ? null : (f.cuotasTotal as number),
      incluyeIntereses: f.incluyeIntereses ?? null, desde: desde || null,
    },
  };
}
