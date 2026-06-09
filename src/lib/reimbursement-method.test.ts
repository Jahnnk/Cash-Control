import { describe, it, expect } from "vitest";
import {
  isReimbursementMethod,
  reimbursementHitsBank,
  reimbursementMirrorMethod,
  REIMBURSEMENT_METHODS,
} from "./reimbursement-method";

describe("reimbursement-method", () => {
  it("acepta solo los métodos válidos", () => {
    expect(REIMBURSEMENT_METHODS).toEqual(["transferencia", "efectivo", "yape_plin"]);
    expect(isReimbursementMethod("transferencia")).toBe(true);
    expect(isReimbursementMethod("efectivo")).toBe(true);
    expect(isReimbursementMethod("yape_plin")).toBe(true);
    expect(isReimbursementMethod("cheque")).toBe(false);
    expect(isReimbursementMethod("")).toBe(false);
  });

  it("efectivo NO entra al banco; transferencia/yape SÍ (regla canónica)", () => {
    expect(reimbursementHitsBank("efectivo")).toBe(false);
    expect(reimbursementHitsBank("transferencia")).toBe(true);
    expect(reimbursementHitsBank("yape_plin")).toBe(true);
  });

  it("mapea el método del gasto-espejo de Fonavi a valores de expenses.payment_method", () => {
    // efectivo → 'efectivo' (no toca el banco de Fonavi)
    expect(reimbursementMirrorMethod("efectivo")).toBe("efectivo");
    // transferencia → 'transferencia' (gasto bancario de Fonavi, como hoy)
    expect(reimbursementMirrorMethod("transferencia")).toBe("transferencia");
    // yape_plin → 'yape' (entra al banco de Fonavi)
    expect(reimbursementMirrorMethod("yape_plin")).toBe("yape");
  });

  it("solo el método 'efectivo' produce un espejo que no afecta el banco", () => {
    // El espejo NO debe afectar el banco de Fonavi sólo cuando es efectivo.
    for (const m of REIMBURSEMENT_METHODS) {
      const mirror = reimbursementMirrorMethod(m);
      const mirrorHitsBank = mirror !== "efectivo";
      expect(mirrorHitsBank).toBe(reimbursementHitsBank(m));
    }
  });
});
