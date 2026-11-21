import { redirect } from "next/navigation";

/**
 * Desde el 21-nov-2026 los administradores gestionan proveedores y compras solo en Control de Caja (un solo lugar).
 * La vista de análisis está en Grupo → Precios de compra. Este enlace viejo vuelve al Panel de Sede.
 */
export default async function ProveedoresMovido({ params }: { params: Promise<{ negocio: string }> }) {
  const { negocio } = await params;
  redirect(`/${negocio}/panel`);
}
