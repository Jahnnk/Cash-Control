import { notFound } from "next/navigation";
import { getClientsWithBalance } from "@/app/actions/clients";
import { ClientsList } from "./clients-list";
import { ClientesAtelier } from "./clientes-atelier";

export const dynamic = "force-dynamic";

export default async function ClientesPage({
  params,
}: {
  params: Promise<{ negocio: string }>;
}) {
  const { negocio } = await params;
  // Sección exclusiva de Atelier (cross-tenant guard a nivel de ruta).
  if (negocio !== "atelier") notFound();
  const clients = await getClientsWithBalance();
  return <ClientesAtelier listaManual={<ClientsList clients={clients} embebida />} />;
}
