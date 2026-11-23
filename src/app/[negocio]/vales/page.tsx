import { redirect } from "next/navigation";

/** Los vales viven en Grupo desde el 23-nov-2026 (solo Jahnn los emite). El enlace viejo de la sede lleva allí. */
export default async function ValesSedePage({ params }: { params: Promise<{ negocio: string }> }) {
  const { negocio } = await params;
  redirect(negocio === "centro" ? "/grupo/vales?sede=centro" : "/grupo/vales?sede=fonavi");
}
