import { and, eq, sql } from "drizzle-orm";
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
    .where(
      and(
        eq(owners.restaurantId, session.restaurantId),
        eq(owners.active, true),
      ),
    )
    .orderBy(owners.name);
  return Response.json({ members });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin"),
    host =
      request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (origin && host && new URL(origin).host !== host)
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

export async function DELETE(request: Request) {
  const origin = request.headers.get("origin"),
    host =
      request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (origin && host && new URL(origin).host !== host)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const session = await getOwnerSession();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const input = z
    .object({ id: z.string().uuid() })
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return Response.json({ error: "Invalid member" }, { status: 400 });
  const db = getDb(),
    [actor] = await db
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
      { error: "Only an owner can remove management access" },
      { status: 403 },
    );
  if (input.data.id === session.ownerId)
    return Response.json(
      { error: "You cannot remove your own access" },
      { status: 400 },
    );
  const [member] = await db
    .update(owners)
    .set({
      active: false,
      sessionVersion: sql`${owners.sessionVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(owners.id, input.data.id),
        eq(owners.restaurantId, session.restaurantId),
        eq(owners.role, "manager"),
        eq(owners.active, true),
      ),
    )
    .returning({ id: owners.id, email: owners.email });
  if (!member)
    return Response.json(
      { error: "Active management member not found" },
      { status: 404 },
    );
  await db.insert(authAuditEvents).values({
    ownerId: session.ownerId,
    restaurantId: session.restaurantId,
    event: "management_access_removed",
    metadata: { removedEmail: member.email, memberId: member.id },
  });
  return Response.json({ removed: true });
}
