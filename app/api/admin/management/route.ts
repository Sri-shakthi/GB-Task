import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { authAuditEvents, owners } from "@/db/schema";
import { getOwnerSession } from "@/lib/auth";

const inviteInput = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(320),
});

export async function GET() {
  const session = await getOwnerSession();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const members = await getDb()
    .select({
      id: owners.id,
      name: owners.name,
      email: owners.email,
      role: owners.role,
      active: owners.active,
    })
    .from(owners)
    .where(eq(owners.restaurantId, session.restaurantId))
    .orderBy(owners.name);
  return Response.json({ members });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const session = await getOwnerSession();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = inviteInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Enter a valid name and email" },
      { status: 400 },
    );
  const db = getDb();
  const [actor] = await db
    .select({ role: owners.role })
    .from(owners)
    .where(
      and(
        eq(owners.id, session.ownerId),
        eq(owners.restaurantId, session.restaurantId),
        eq(owners.active, true),
      ),
    )
    .limit(1);
  if (actor?.role !== "owner")
    return Response.json(
      { error: "Only an owner can approve management access" },
      { status: 403 },
    );
  const email = parsed.data.email.toLowerCase();
  const [member] = await db
    .insert(owners)
    .values({
      restaurantId: session.restaurantId,
      email,
      name: parsed.data.name,
      passwordHash: "google-oauth-only",
      role: "manager",
      active: true,
    })
    .onConflictDoNothing()
    .returning({
      id: owners.id,
      name: owners.name,
      email: owners.email,
      role: owners.role,
      active: owners.active,
    });
  if (!member)
    return Response.json(
      { error: "That email already has an account" },
      { status: 409 },
    );
  await db.insert(authAuditEvents).values({
    ownerId: session.ownerId,
    restaurantId: session.restaurantId,
    event: "management_access_approved",
    metadata: { approvedEmail: email, memberId: member.id },
  });
  return Response.json({ member }, { status: 201 });
}
