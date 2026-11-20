import { describe, expect, it } from "vitest";
import { plural, armarPedido, compararProducto, dondeComprar, enlaceWhatsApp, precioUnitario, vigentes, type Oferta, type ProveedorCompra } from "../proveedores";

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

describe("armar un pedido", () => {
  it("pedido grande: manteca a Lima (supera el mínimo) y stickers a Cajamarca", () => {
    const plan = armarPedido([{ productoId: MANTECA, cantidad: 5000 }, { productoId: STICKER, cantidad: 2000 }], ofertas, [caj, lima]);
    const porProv = new Map(plan.pedidos.map((p) => [p.proveedor.id, p.lineas.map((l) => l.productoId)]));
    expect(porProv.get(2)).toEqual([MANTECA]); // 5 paquetes × 60 = 300 + 25 envío
    expect(porProv.get(1)).toEqual([STICKER]); // 2 × 20 = 40
    expect(plan.total).toBe(365);
  });

  it("pedido chico: no llega al mínimo de Lima, todo a Cajamarca y lo explica", () => {
    const plan = armarPedido([{ productoId: MANTECA, cantidad: 1000 }, { productoId: STICKER, cantidad: 1000 }], ofertas, [caj, lima]);
    expect(plan.pedidos.map((p) => p.proveedor.id)).toEqual([1]);
    expect(plan.total).toBe(120); // 2 × 50 + 20
    expect(plan.minimosQueMandaron).toEqual([2]);
  });

  it("el envío se cobra una vez por proveedor y puede volver más caro al barato", () => {
    const sinMin = { ...lima, pedidoMinimo: null, costoEnvio: 50 };
    const plan = armarPedido([{ productoId: MANTECA, cantidad: 1000 }], ofertas, [caj, sinMin]);
    // Lima 60 + 50 = 110 contra Cajamarca 2 × 50 = 100
    expect(plan.pedidos[0].proveedor.id).toBe(1);
    expect(plan.unSoloProveedor?.total).toBe(100);
  });

  it("productos sin precio quedan aparte", () => {
    const plan = armarPedido([{ productoId: 99, cantidad: 3 }], ofertas, [caj, lima]);
    expect(plan.sinPrecio).toEqual([99]);
    expect(plan.pedidos).toEqual([]);
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
