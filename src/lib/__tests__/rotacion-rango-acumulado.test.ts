/**
 * Guardia del acumulado por períodos del reporte de rotación.
 *
 * HISTORIA (importa para no volver atrás):
 *
 * El 18-ago-2026 se descubrió que subir el export por defecto de Byte
 * —"del 10 al 16", una semana— BORRABA el resto del mes, porque guardar
 * un mes lo reemplazaba entero. El primer parche fue exigir que el
 * reporte empezara el día 1. Funcionaba, pero obligaba a Kelly y a los
 * administradores a exportar siempre el acumulado.
 *
 * Ese mismo día Jahnn pidió lo correcto: que se pueda subir por semanas
 * Y que si alguien sube el mes entero también salga bien. Así que la
 * restricción del día 1 se reemplazó por acumulación real por períodos.
 *
 * Lo que estos tests protegen ahora:
 *   · que una carga nueva REEMPLACE a las que pisa (sin eso, subir el
 *     mes sobre tres semanas ya cargadas duplicaría las ventas);
 *   · que el mes se RECALCULE como la suma de sus períodos;
 *   · que un rango que cruza de mes se rechace (no se puede repartir:
 *     el reporte no trae fecha por fila).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const leer = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const action = leer("src/app/actions/product-sales-import.ts");

describe("acumulación por períodos", () => {
  it("una carga nueva borra los períodos que PISA, no todo el mes", () => {
    // Si esto se cae y vuelve a borrar por mes, subir una semana borra
    // el resto del mes — el bug original.
    expect(action).toMatch(/DELETE FROM product_period_sales/);
    expect(action).toMatch(/period_start <= \$\{pFin\}::date AND \$\{pIni\}::date <= period_end/);
  });

  it("el mes se recalcula sumando sus períodos", () => {
    expect(action).toMatch(/INSERT INTO product_month_sales[\s\S]{0,400}SELECT business_id, product_id/);
    expect(action).toMatch(/SUM\(units\), SUM\(revenue\)/);
    expect(action).toMatch(/FROM product_period_sales/);
  });

  it("agrupa los no matcheados por nombre para no partirlos en dos filas", () => {
    expect(action).toMatch(/CASE WHEN product_id IS NULL THEN lower\(product_name_raw\) ELSE NULL END/);
  });

  it("ya NO exige que el reporte empiece el día 1", () => {
    // La regla vieja. Si reaparece, se pierde la carga semanal.
    expect(action).not.toMatch(/periodStart !== inicioMes/);
  });
});

describe("rangos que cruzan de mes", () => {
  it("se rechazan pidiendo dos archivos", () => {
    expect(action).toMatch(/cruzaDeMes/);
    expect(action).toMatch(/DOS archivos/);
  });

  it("el mensaje explica POR QUÉ no se puede repartir", () => {
    expect(action).toMatch(/no trae el detalle por día/);
  });
});

describe("el modal manda el rango a la action", () => {
  const modal = leer("src/app/[negocio]/panel/import-control-modal.tsx");

  it("incluye periodStart y periodEnd en la llamada", () => {
    expect(modal).toContain("periodStart: rot.periodStart");
    expect(modal).toContain("periodEnd: rot.periodEnd");
  });
});
