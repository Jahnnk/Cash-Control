/**
 * Guardia contra el incidente del 11-ago-2026.
 *
 * QUÉ PASÓ: `src/app/actions/highlight-photos.ts` (archivo "use server")
 * tenía `export type { HighlightPhotoKind };` — una RE-EXPORTACIÓN de
 * tipo. Turbopack convierte cada export de un archivo "use server" en
 * una referencia a server action, y en esa transformación la re-export
 * de tipo NO se borra: queda código que busca el tipo como valor en
 * tiempo de ejecución. Resultado en producción:
 *
 *   ReferenceError: HighlightPhotoKind is not defined
 *       at module evaluation (.../ssr/src_app_actions_*.js)
 *
 * Y como reventaba al EVALUAR el módulo, tumbaba cualquier llamada a
 * cualquier action de ese chunk: /grupo/highlight daba 500 al cambiar
 * de fecha. Costó tres intentos de diagnóstico encontrarlo porque
 * `tsc`, `npm run build` y Vitest lo dan por bueno — esos transforms sí
 * borran el tipo. Solo aparece en el runtime de producción.
 *
 * Esta prueba es estática a propósito: no puede reproducir el transform
 * de Turbopack, pero sí puede prohibir el PATRÓN que lo dispara.
 *
 * Regla: en un archivo "use server", declarar los tipos localmente
 * (`export type X = {...}` es seguro) o importarlos desde una lib, pero
 * NUNCA re-exportarlos (`export type { X }` / `export { X }`).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function archivosTs(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      out.push(...archivosTs(ruta));
    } else if (/\.tsx?$/.test(entrada) && !/\.test\.tsx?$/.test(entrada)) {
      out.push(ruta);
    }
  }
  return out;
}

/** Quita comentarios de línea y de bloque para no dar falsos positivos
 *  (el propio archivo del incidente documenta el patrón prohibido). */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe('archivos "use server": nada de re-exportar', () => {
  const raiz = join(process.cwd(), "src");
  const useServer = archivosTs(raiz).filter((f) => {
    const src = readFileSync(f, "utf8");
    return /^\s*["']use server["']/.test(src);
  });

  it("encuentra los archivos de acciones (si no, la guardia no sirve)", () => {
    expect(useServer.length).toBeGreaterThan(5);
  });

  /**
   * Se prohíben las dos formas que SÍ rompen:
   *   · `export type { X }`  → el tipo no existe en runtime → ReferenceError
   *   · `export * from "..."` → puede arrastrar tipos sin querer
   *
   * `export { fnAsync }` (re-export de un VALOR async declarado en el
   * mismo archivo) NO se prohíbe: sí existe en runtime y funciona — lo
   * usa `src/app/actions/attachments.ts` desde hace meses sin problema.
   */
  it("ninguno re-exporta TIPOS (eso es lo que revienta en producción)", () => {
    const culpables: string[] = [];
    for (const f of useServer) {
      const src = sinComentarios(readFileSync(f, "utf8"));
      const reExportaTipo =
        /^\s*export\s+type\s*\{/m.test(src) || /^\s*export\s+\*/m.test(src);
      if (reExportaTipo) culpables.push(f.replace(process.cwd() + "/", ""));
    }
    expect(
      culpables,
      `Re-exportación de tipo prohibida en archivos "use server" ` +
        `(declara el tipo localmente o impórtalo de una lib):\n${culpables.join("\n")}`,
    ).toEqual([]);
  });

  it("todo lo exportado como valor es async (regla vieja, misma familia)", () => {
    const culpables: string[] = [];
    for (const f of useServer) {
      const src = sinComentarios(readFileSync(f, "utf8"));
      // export const/let/var/class → no permitido (solo funciones async)
      if (/^\s*export\s+(const|let|var|class)\s/m.test(src)) {
        culpables.push(f.replace(process.cwd() + "/", ""));
      }
      // export function sin async → tampoco
      if (/^\s*export\s+function\s/m.test(src)) {
        culpables.push(f.replace(process.cwd() + "/", ""));
      }
    }
    expect(culpables, `Export no-async en archivos "use server":\n${culpables.join("\n")}`)
      .toEqual([]);
  });
});
