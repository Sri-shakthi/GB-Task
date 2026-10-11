import Dashboard from "@/components/dashboard";
import { redirect } from "next/navigation";
import { csrfToken, getOwnerSession } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function Page() {
  const session = await getOwnerSession();
  if (!session) redirect("/login");
  return <Dashboard csrf={csrfToken(session)} expiresAt={session.exp} />;
}
