import { getClients } from "@/app/actions/clients";
import { RegistroForm } from "./registro-form";

export const dynamic = "force-dynamic";

export default async function RegistroPage() {
  const clients = await getClients(true);
  return <RegistroForm clients={clients} />;
}
