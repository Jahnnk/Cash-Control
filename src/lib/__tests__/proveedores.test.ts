import { describe, expect, it } from "vitest";
import { ahorroPorSedeMes, compararSedes, diferenciasContraHabitual, preciosQueSuben, type CompraReal, claveNombre, unidadCanonica, nombreBonito, precioDesdeCompra, sedesDesdeNombres, factorInsumo, mejorParaInsumo, unidadDesdeInsumo, plural, compararProducto, dondeComprar, enlaceWhatsApp, precioUnitario, vigentes, type Oferta, type ProveedorCompra } from "../proveedores";

const hoy = "2026-11-20";
const caj: ProveedorCompra = { id: 1, nombre: "Packaging Cajamarca", costoEnvio: null, pedidoMinimo: null };
const lima: ProveedorCompra = { id: 2, nombre: "Packaging Lima", costoEnvio: 25, pedidoMinimo: 300 };
const MANTECA = 10, STICKER = 20;
const of = (proveedorId: number, productoId: number, cantidad: number, precio: number, fecha = "2026-11-10"): Oferta =>
  ({ proveedorId, productoId, cantidad, precio, fecha, presentacion: `x${cantidad}` });

// Papel manteca: Cajamarca S/ 0.10 la hoja, Lima S/ 0.06. Stickers: Cajamarca S/ 0.02, Lima S/ 0.03.
const ofertas = [of(1, MANTECA, 500, 50), of(2, MANTECA, 1000, 60), of(1, STICKER, 1000, 20), of(2, STICKER, 1000, 30)];

describe("comparar por producto (el caso de Jahnn)", () => {
  it("precio por unidad aunque las presentaciones sean distintas", () => {
    expect(precioUnitario({ precio: 50, cantidad: 500 })).toBe(0.1);
    expect(precioUnitario({ precio: 60, cantidad: 1000 })).toBe(0.06);
  });

  it("papel manteca → Lima; stickers redondos → Cajamarca", () => {
    const m = compararProducto(ofertas.filter((o) => o.productoId === MANTECA), [caj, lima], hoy);
    expect(m[0].proveedor.id).toBe(2);
    expect(m[0].esMejor).toBe(true);
    expect(m[1].sobreMejor).toBeCloseTo(66.67, 1);
    const s = compararProducto(ofertas.filter((o) => o.productoId === STICKER), [caj, lima], hoy);
    expect(s[0].proveedor.id).toBe(1);
    const donde = dondeComprar(ofertas, [caj, lima], hoy);
    expect(donde.get(2)).toEqual([MANTECA]);
    expect(donde.get(1)).toEqual([STICKER]);
  });

  it("con envío, dice desde cuántas unidades conviene el más barato", () => {
    const m = compararProducto(ofertas.filter((o) => o.productoId === MANTECA), [caj, lima], hoy);
    // 25 / (0.10 − 0.06) = 625 hojas
    expect(m[0].convieneDesde).toBe(625);
  });

  it("marca los precios de más de 90 días", () => {
    const m = compararProducto([of(1, MANTECA, 500, 50, "2026-07-01")], [caj], hoy);
    expect(m[0].viejo).toBe(true);
  });

  it("vigentes: se queda con el último precio de cada proveedor y producto", () => {
    const v = vigentes([{ ...of(1, MANTECA, 500, 50, "2026-10-01"), id: 1 }, { ...of(1, MANTECA, 500, 55, "2026-11-01"), id: 2 }]);
    expect(v).toHaveLength(1);
    expect(v[0].precio).toBe(55);
  });
});

describe("contacto", () => {
  it("WhatsApp agrega el 51 de Perú", () => {
    expect(enlaceWhatsApp("987 654 321")).toBe("https://wa.me/51987654321");
    expect(enlaceWhatsApp("+51 987654321")).toBe("https://wa.me/51987654321");
    expect(enlaceWhatsApp("076-36")).toBeNull();
  });
});

describe("plural", () => {
  it("hoja, unidad, kg", () => {
    expect(plural("hoja")).toBe("hojas");
    expect(plural("unidad")).toBe("unidades");
    expect(plural("kg")).toBe("kg");
  });
});

describe("conexión con insumos de Recetas", () => {
  it("convierte unidades compatibles y rechaza las que no", () => {
    expect(factorInsumo("kg", "kg")).toBe(1);
    expect(factorInsumo("g", "kg")).toBe(1000);
    expect(factorInsumo("ml", "l")).toBe(1000);
    expect(factorInsumo("Litro", "l")).toBe(1);
    expect(factorInsumo("hoja", "und")).toBe(1);
    expect(factorInsumo("kg", "und")).toBeNull();
    expect(factorInsumo("unidad", "kg")).toBeNull();
    expect(unidadDesdeInsumo("l")).toBe("litro");
  });

  it("el mejor precio solo entre proveedores de las sedes de ese insumo, en la unidad del insumo", () => {
    const provs = [{ ...caj, sedes: [1] }, { ...lima, sedes: [2, 3] }];
    // Para las cafeterías solo cuenta Lima (S/ 0.06 la hoja); para Atelier solo Cajamarca (S/ 0.10).
    expect(mejorParaInsumo(ofertas, provs, MANTECA, "Cafetería", 1)?.proveedorId).toBe(2);
    expect(mejorParaInsumo(ofertas, provs, MANTECA, "Atelier", 1)?.precioInsumo).toBe(0.1);
    // Por gramo → por kg
    const harina = [of(1, 30, 1000, 4.5)]; // S/ 4.50 por 1000 g
    expect(mejorParaInsumo(harina, provs, 30, "Atelier", 1000)?.precioInsumo).toBe(4.5);
  });
});

describe("datos de Control de Caja", () => {
  it("nombres en mayúsculas → legibles", () => {
    expect(nombreBonito("HARINA SANTA ROSA X 50KG")).toBe("Harina Santa Rosa x 50kg");
    expect(nombreBonito("  leche  DE vaca ")).toBe("Leche de Vaca");
  });
  it("sedes por nombre; sin compras, las 3", () => {
    expect(sedesDesdeNombres(["Fonavi", "Centro"])).toEqual([2, 3]);
    expect(sedesDesdeNombres(["Atelier"])).toEqual([1]);
    expect(sedesDesdeNombres([])).toEqual([1, 2, 3]);
  });
  it("una compra se guarda como precio por unidad", () => {
    expect(precioDesdeCompra({ cantidad: 3, precioTotal: 30, unidad: "KG" })).toEqual({ unidad: "kg", cantidad: 3, precio: 30, presentacion: "Compra de 3 kg" });
    expect(precioUnitario(precioDesdeCompra({ cantidad: 500, precioTotal: 52, unidad: "hoja" })!)).toBe(0.104);
    expect(precioDesdeCompra({ cantidad: 0, precioTotal: 5, unidad: "kg" })).toBeNull();
  });
});

describe("un solo criterio para nombres y unidades", () => {
  it("el mismo producto aunque cambie la tilde o las mayúsculas", () => {
    expect(claveNombre("Limón")).toBe(claveNombre("LIMON"));
    expect(claveNombre("  Ají  Limo ")).toBe("aji limo");
  });
  it("unidades a una sola forma; gramos a kilos; «en soles» fuera", () => {
    expect(unidadCanonica("und")).toEqual({ unidad: "unidad", factor: 1 });
    expect(unidadCanonica("PQTE")).toEqual({ unidad: "paquete", factor: 1 });
    expect(unidadCanonica("gr")).toEqual({ unidad: "kg", factor: 0.001 });
    expect(unidadCanonica("Litros")).toEqual({ unidad: "litro", factor: 1 });
    expect(unidadCanonica("galones")).toEqual({ unidad: "galón", factor: 1 });
    expect(unidadCanonica("soles")).toBeNull();
    expect(unidadCanonica("bandeja")).toEqual({ unidad: "bandeja", factor: 1 });
  });
  it("500 g a S/ 4 = S/ 8 el kilo; compra en soles no se usa", () => {
    expect(precioUnitario(precioDesdeCompra({ cantidad: 500, precioTotal: 4, unidad: "g" })!)).toBe(8);
    expect(precioDesdeCompra({ cantidad: 2, precioTotal: 2, unidad: "soles" })).toBeNull();
  });
});

describe("análisis de compras para la dirección", () => {
  const c = (productoId: number, sedeId: number, fecha: string, cantidad: number, precio: number, proveedorId = 1): CompraReal => ({ productoId, proveedorId, sedeId, fecha, cantidad, precio });
  // Limón: S/ 5 el kg tres veces; luego Fonavi paga S/ 6 (10 kg) y Centro S/ 4.50 (4 kg).
  const compras = [c(1, 2, "2026-10-01", 1, 5), c(1, 3, "2026-10-05", 1, 5), c(1, 2, "2026-10-08", 1, 5), c(1, 2, "2026-11-02", 10, 60), c(1, 3, "2026-11-03", 4, 18)];
  it("cada compra contra el habitual (mediana de las 3 anteriores)", () => {
    const d = diferenciasContraHabitual(compras);
    const nov = d.filter((x) => x.compra.fecha >= "2026-11-01");
    expect(nov[0]).toMatchObject({ habitual: 5, unitario: 6, soles: 10, pct: 20 });
    expect(nov[1]).toMatchObject({ habitual: 5, unitario: 4.5, soles: -2 });
  });
  it("ahorro y sobrecosto por sede y mes", () => {
    const a = ahorroPorSedeMes(compras).filter((x) => x.mes === "2026-11");
    expect(a.find((x) => x.sedeId === 2)).toMatchObject({ deMas: 10, ahorro: 0 });
    expect(a.find((x) => x.sedeId === 3)).toMatchObject({ deMas: 0, ahorro: 2 });
  });
  it("la misma compra en las sedes: quién paga más y cuánto se pudo ahorrar", () => {
    const s = compararSedes(compras, "2026-11-20");
    expect(s[0].porSede.map((x) => x.sedeId)).toEqual([3, 2]);
    expect(s[0].brecha).toBeCloseTo(33.33, 1);
    // Contra S/ 4.50: Fonavi (6 − 4.5) × 10 + 2 × 0.5, Centro 0.5 de octubre = 16.50
    expect(s[0].ahorroPosible).toBe(16.5);
  });
  it("precios que suben", () => {
    const p = preciosQueSuben([...compras, c(2, 2, "2026-10-01", 1, 10), c(2, 2, "2026-11-01", 1, 12)], "2026-11-20");
    // El limón bajó (5 → 4.50): no sale. La harina subió 20%.
    expect(p.map((x) => x.productoId)).toEqual([2]);
    expect(p[0].pct).toBe(20);
  });
});
