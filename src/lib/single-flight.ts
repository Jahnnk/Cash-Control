/**
 * Guard anti doble-submit: garantiza que una operación async no corra
 * dos veces en paralelo (ej. doble clic en "Guardar todo" con red lenta).
 *
 * A diferencia de `if (saving) return` con useState —que puede dejar
 * pasar el segundo clic porque el estado de React se actualiza
 * asíncrono—, este guard usa una bandera síncrona: el segundo clic se
 * descarta en el mismo tick.
 */
export function createSingleFlight() {
  let inFlight = false;
  return async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (inFlight) return undefined; // descartado: ya hay una en curso
    inFlight = true;
    try {
      return await fn();
    } finally {
      inFlight = false;
    }
  };
}
