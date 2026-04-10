import { getClientsWithBalance } from "@/app/actions/clients";
import { formatCurrency } from "@/lib/utils";
import { ClientsList } from "./clients-list";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const clients = await getClientsWithBalance();
  return <ClientsList clients={clients} />;
}
