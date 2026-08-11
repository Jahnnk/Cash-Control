/**
 * Reintenta UNA vez, tras una pausa breve, si la primera llamada falla.
 *
 * Pensado para absorber tropiezos transitorios entre el navegador y la
 * base de datos — el caso típico es Neon "despertando" tras estar
 * inactiva (cold start), que puede tardar más que una consulta normal
 * y hacer que la primera petición falle aunque la segunda, un instante
 * después, funcione sin problema.
 *
 * Se usa en las llamadas del lado del cliente a las acciones del
 * Highlight (src/components/highlight-photos.tsx,
 * src/app/grupo/highlight/*, src/app/[negocio]/panel/highlight-card.tsx):
 * son las que más golpes de conexión concentran, porque una sola
 * pantalla puede disparar varias consultas en paralelo (el Highlight
 * del día + su historial + las fotos de indicación y evidencia).
 */
export async function conReintento<T>(fn: () => Promise<T>, esperaMs = 700): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error("[conReintento] primer intento falló, reintentando en", esperaMs, "ms:", e);
    await new Promise((r) => setTimeout(r, esperaMs));
    return fn();
  }
}
