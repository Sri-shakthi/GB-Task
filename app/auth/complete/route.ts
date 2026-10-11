import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { owners } from "@/db/schema";
import { neonAuth } from "@/lib/neon-auth";

export async function GET() {
  const { data } = await neonAuth.getSession();
  const email = data?.user?.email?.trim().toLowerCase();
  if (!email) redirect("/login?error=google");
  const [member] = await getDb()
    .select({ id: owners.id })
    .from(owners)
    .where(and(eq(owners.email, email), eq(owners.active, true)))
    .limit(1);
  if (!member) {
    await neonAuth.signOut();
    redirect("/login?error=unauthorized");
  }
  redirect("/");
}
