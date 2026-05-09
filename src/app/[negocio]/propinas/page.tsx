import { getTips, getTipsSummary, getCollaboratorNamesUsed } from "@/app/actions/tips";
import { TipsClient } from "./tips-client";

export const dynamic = "force-dynamic";

export default async function PropinasPage() {
  const [tips, summary, collaborators] = await Promise.all([
    getTips({ status: "pending" }),
    getTipsSummary(),
    getCollaboratorNamesUsed(),
  ]);
  return <TipsClient initialTips={tips} initialSummary={summary} collaborators={collaborators} />;
}
