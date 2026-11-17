import { describe, it, expect } from "vitest";
import { clasificarGasto, reglaFirme, repartirDeliveryYFletes, tipoDeCategoria, CATEGORIAS_GASTO, DELIVERY_Y_FLETES } from "../reglas-gasto";
import { resolverGrupoDelGasto } from "../excel-importer";
import { clasificarEgreso } from "../clasificador-gasto";
import { lineaDePresupuesto, AREAS } from "../presupuesto";

// Jahnn (17-nov-2026): «DELIVERY Y FLETES» se separa en FLETES, DELIVERY COMPRAS y DELIVERY CLIENTES.
const cat = (concepto: string) => reglaFirme(concepto)?.categoria ?? clasificarGasto(concepto);

describe("delivery y fletes, separados", () => {
  it("las tres son variables y la vieja ya no se ofrece", () => {
    for (const c of ["FLETES", "DELIVERY COMPRAS", "DELIVERY CLIENTES"]) expect(tipoDeCategoria(c)).toBe("Variable");
    expect(CATEGORIAS_GASTO.map((c) => c.nombre)).not.toContain(DELIVERY_Y_FLETES);
    // Los gastos de abril a julio siguen con el nombre viejo: sigue siendo variable.
    expect(tipoDeCategoria(DELIVERY_Y_FLETES)).toBe("Variable");
  });

  it("conceptos reales de ago–oct caen en la que corresponde", () => {
    const casos: [string, string][] = [
      ["Envío a Trujillo (AGENCIA)", "FLETES"],
      ["Felte envío Aceite de oliva (AGENCIA)", "FLETES"],
      ["Fletes (CAJA CHICA)", "FLETES"],
      ["CARRETILLA FRUTAS Y VERDURAS (ELENA CUEVA)", "FLETES"],
      ["TRASLADO DE CONGELADORA (MANUEL CAHVEZ)", "FLETES"],
      ["Cajas envío de Trujillo (EMTRAFESA)", "FLETES"],
      ["DELIVERY METRO (JORMAR)", "DELIVERY COMPRAS"],
      ["DELIVERY AKEMY (ROSARIO REYES)", "DELIVERY COMPRAS"],
      ["DELIVERY HARINA INTEGRAL (SEBASTIAN ROJAS)", "DELIVERY COMPRAS"],
      ["Deliverys (CAJA CHICA)", "DELIVERY COMPRAS"],
      ["COMBUSTIBLE FABIO – 19.10 (FABIO DELIVERY)", "DELIVERY COMPRAS"],
      ["DELIVERY CLIENTE (Fabio esta en compras centro) (MERCADO)", "DELIVERY CLIENTES"],
      ["Delivery tortas BAÑOS DEL INCA (DELIVERY)", "DELIVERY CLIENTES"],
      ["MOCHILA DELIVERY (SERVCIOS GASTRONOMICOS SAC)", "DELIVERY CLIENTES"],
      ["SALDO MOCHILA DELIVERY (JUANI TERRONES)", "DELIVERY CLIENTES"],
      ["Delivery centro del 28 al 11 de octubre (ROSARIO REYES)", "DELIVERY CLIENTES"],
      ["Delivery del 12 al 18 Centro (Incluye recojo de huevos)", "DELIVERY CLIENTES"],
    ];
    for (const [concepto, esperada] of casos) expect(cat(concepto), concepto).toBe(esperada);
  });

  it("si el Excel aún dice DELIVERY Y FLETES, el concepto decide; si no dice nada, es de compras", () => {
    expect(resolverGrupoDelGasto("DELIVERY Y FLETES", "Envío a Trujillo", "AGENCIA", "expense").canonica).toBe("FLETES");
    expect(resolverGrupoDelGasto("DELIVERY Y FLETES", "DELIVERY CLIENTE sábado", "", "expense").canonica).toBe("DELIVERY CLIENTES");
    expect(resolverGrupoDelGasto("Delivery", "Pago Sr David", "", "expense").canonica).toBe("DELIVERY COMPRAS");
    expect(repartirDeliveryYFletes("Pago Sr David")).toBe("DELIVERY COMPRAS");
  });

  it("un gasto viejo guardado como DELIVERY Y FLETES no es una duda", () => {
    const c = clasificarEgreso({ concepto: "DELIVERY METRO (JORMAR)", categoria: DELIVERY_Y_FLETES, grupoExcel: "DELIVERY Y FLETES", deExcel: true, decidido: false, monto: 7 });
    expect(c.confianza).not.toBe("baja");
  });

  it("el presupuesto sigue con una sola línea (la suma de las tres)", () => {
    for (const c of ["FLETES", "DELIVERY COMPRAS", "DELIVERY CLIENTES"]) expect(lineaDePresupuesto(c)).toBe(DELIVERY_Y_FLETES);
    expect(AREAS.find((a) => a.id === "produccion")?.categorias).toContain(DELIVERY_Y_FLETES);
  });
});
