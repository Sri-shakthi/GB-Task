import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { departments } from "@/db/schema";
import { getOwnerSession } from "@/lib/auth";
import { departmentSchema } from "@/lib/validation";

export async function GET() {
  const session = await getOwnerSession();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await getDb()
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(
      and(
        eq(departments.restaurantId, session.restaurantId),
        eq(departments.active, true),
      ),
    )
    .orderBy(asc(departments.name));
  return Response.json({ departments: rows });
}

export async function POST(request: Request) {
  const session = await getOwnerSession();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = departmentSchema.safeParse(await request.json());
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message || "Invalid department" },
      { status: 400 },
    );

  const db = getDb();
  const [existing] = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(
      and(
        eq(departments.restaurantId, session.restaurantId),
        eq(sql`lower(${departments.name})`, parsed.data.name.toLowerCase()),
      ),
    )
    .limit(1);

  if (existing) {
    if (!(await isActive(existing.id))) {
      const [restored] = await db
        .update(departments)
        .set({ active: true, updatedAt: new Date() })
        .where(eq(departments.id, existing.id))
        .returning({ id: departments.id, name: departments.name });
      return Response.json({ department: restored });
    }
    return Response.json(
      { error: "That department already exists" },
      { status: 409 },
    );
  }

  const [created] = await db
    .insert(departments)
    .values({
      restaurantId: session.restaurantId,
      name: parsed.data.name,
    })
    .returning({ id: departments.id, name: departments.name });
  return Response.json({ department: created }, { status: 201 });
}

async function isActive(id: string) {
  const [row] = await getDb()
    .select({ active: departments.active })
    .from(departments)
    .where(eq(departments.id, id))
    .limit(1);
  return row?.active === true;
}
