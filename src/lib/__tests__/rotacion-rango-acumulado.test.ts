/**
 * Guardia: el reporte de rotación tiene que ser ACUMULADO desde el 1.
 *
 * Guardar un mes REEMPLAZA lo que había (`DELETE ... WHERE month` en
 * runImport). Así que subir el export por defecto de Byte — "del 10 al
 * 16", una semana suelta — borra el resto del mes y deja el análisis
 * con 7 días de datos.
 *
 * Se descubrió el 18-ago-2026, justo cuando se iba a volver rutina que
 * cada administrador lo subiera los sábados: el archivo que Jahnn mandó
 * como ejemplo era exactamente ese, una semana. Habría vaciado el mes
 * de las tres sedes, cada sábado, en silencio.
 *
 * Estos tests leen el CÓDIGO, no la base: exigen que la validación esté
 * en la action (donde no se puede saltar) y no solo en el modal.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const leer = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

describe("la validación del rango vive en el servidor", () => {
  const action = leer("src/app/actions/product-sales-import.ts");

  it("importProductSalesFromPanel compara el inicio del rango con el día 1", () => {
    // Si esto se cae, el modal sigue avisando pero la action acepta
    // cualquier rango — y el modal se puede saltar.
    expect(action).toContain("input.periodStart");
    expect(action).toMatch(/periodStart !== inicioMes/);
  });

  it("el mensaje dice CÓMO exportarlo bien, no solo que está mal", () => {
    expect(action).toMatch(/ACUMULADO/);
    expect(action).toMatch(/hasta hoy/);
    expect(action).toMatch(/se pierde lo que ya estaba cargado/);
  });

  it("sigue siendo verdad que guardar un mes lo reemplaza", () => {
    // Esta prueba es el "por qué" de la de arriba. Si algún día el
    // import pasa a acumular en vez de reemplazar, esto se cae y hay
    // que revisar si la restricción del rango sigue haciendo falta.
    expect(action).toMatch(/DELETE FROM product_month_sales\s+WHERE business_id = \$\{bId\} AND month = \$\{input\.month\}/);
  });
});

describe("el modal manda el rango a la action", () => {
  const modal = leer("src/app/[negocio]/panel/import-control-modal.tsx");

  it("incluye periodStart y periodEnd en la llamada", () => {
    expect(modal).toContain("periodStart: rot.periodStart");
    expect(modal).toContain("periodEnd: rot.periodEnd");
  });
});
