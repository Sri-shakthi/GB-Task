import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { staff } from "@/db/schema";
import { getOwnerSession } from "@/lib/auth";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOwnerSession();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const origin = request.headers.get("origin"),
    host =
      request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (origin && host && new URL(origin).host !== host)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const { id } = await params;
  const [removed] = await getDb()
    .update(staff)
    .set({ active: false, updatedAt: new Date() })
    .where(
      and(
        eq(staff.id, id),
        eq(staff.restaurantId, session.restaurantId),
        eq(staff.active, true),
      ),
    )
    .returning({ id: staff.id });
  if (!removed)
    return Response.json({ error: "Staff member not found" }, { status: 404 });
  return Response.json({ removed: true });
}
