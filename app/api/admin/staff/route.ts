import { and, eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { getOwnerSession } from "@/lib/auth";
import { getDb } from "@/db";
import { departments, staff } from "@/db/schema";
import { staffSchema } from "@/lib/validation";
import {
  blobStorageConfigurationMessage,
  isBlobStorageConfigured,
} from "@/lib/blob";
export async function GET() {
  const session = await getOwnerSession();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await getDb()
    .select({
      id: staff.id,
      name: staff.name,
      phone: staff.phone,
      role: staff.role,
      address: staff.address,
      photoPath: staff.photoPath,
      language: staff.language,
      active: staff.active,
      department: departments.name,
      departmentId: departments.id,
    })
    .from(staff)
    .leftJoin(departments, eq(staff.departmentId, departments.id))
    .where(
      and(eq(staff.restaurantId, session.restaurantId), eq(staff.active, true)),
    )
    .orderBy(staff.name);
  return Response.json({
    staff: rows.map((row) => ({
      ...row,
      staffCode: `GB-${row.id.slice(0, 8).toUpperCase()}`,
      photoUrl: row.photoPath ? `/api/admin/staff/${row.id}/photo` : null,
      initials: row.name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
      department: row.department || "Other",
      role: row.role || "Staff",
      language: row.language === "ta" ? "Tamil" : "English",
    })),
  });
}

export async function POST(request: Request) {
  const session = await getOwnerSession();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const parsed = staffSchema.safeParse({
    name: form.get("name"),
    phone: form.get("phone"),
    role: String(form.get("role") || "").trim() || undefined,
    workCategory: form.get("workCategory"),
    address: String(form.get("address") || "").trim() || undefined,
    language: form.get("language"),
    shift: String(form.get("shift") || "").trim() || undefined,
    consent: form.get("consent") === "true",
  });
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message || "Invalid staff details" },
      { status: 400 },
    );

  const db = getDb();
  const [existing] = await db
    .select({
      id: staff.id,
      active: staff.active,
      photoPath: staff.photoPath,
    })
    .from(staff)
    .where(
      and(
        eq(staff.restaurantId, session.restaurantId),
        eq(staff.phone, parsed.data.phone),
      ),
    )
    .limit(1);
  if (existing?.active)
    return Response.json(
      {
        error: "That WhatsApp number already belongs to an active staff member",
      },
      { status: 409 },
    );
  let [department] = await db
    .select({
      id: departments.id,
      name: departments.name,
      active: departments.active,
    })
    .from(departments)
    .where(
      and(
        eq(departments.name, parsed.data.workCategory),
        eq(departments.restaurantId, session.restaurantId),
      ),
    )
    .limit(1);
  if (department && !department.active) {
    const [restored] = await db
      .update(departments)
      .set({ active: true, updatedAt: new Date() })
      .where(eq(departments.id, department.id))
      .returning({
        id: departments.id,
        name: departments.name,
        active: departments.active,
      });
    department = restored;
  }
  if (!department) {
    [department] = await db
      .insert(departments)
      .values({
        restaurantId: session.restaurantId,
        name: parsed.data.workCategory,
      })
      .onConflictDoNothing()
      .returning({
        id: departments.id,
        name: departments.name,
        active: departments.active,
      });
    if (!department) {
      [department] = await db
        .select({
          id: departments.id,
          name: departments.name,
          active: departments.active,
        })
        .from(departments)
        .where(
          and(
            eq(departments.restaurantId, session.restaurantId),
            eq(departments.name, parsed.data.workCategory),
          ),
        )
        .limit(1);
    }
  }

  const photo = form.get("photo");
  let photoPath: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    if (!photo.type.startsWith("image/") || photo.size > 5 * 1024 * 1024)
      return Response.json(
        { error: "Photo must be an image under 5 MB" },
        { status: 400 },
      );
    if (!isBlobStorageConfigured())
      return Response.json(
        { error: blobStorageConfigurationMessage },
        { status: 503 },
      );
    let blob: Awaited<ReturnType<typeof put>>;
    try {
      blob = await put(
        `restaurants/${session.restaurantId}/staff/${crypto.randomUUID()}`,
        photo,
        { access: "private", addRandomSuffix: false, contentType: photo.type },
      );
    } catch {
      return Response.json(
        { error: "Photo upload could not be completed. Please try again." },
        { status: 502 },
      );
    }
    photoPath = blob.pathname;
  }

  try {
    const values = {
        departmentId: department.id,
        name: parsed.data.name,
        phone: parsed.data.phone,
        role: parsed.data.role,
        address: parsed.data.address,
        photoPath: photoPath || existing?.photoPath || null,
        language: parsed.data.language,
        shift: parsed.data.shift,
        active: true,
        consentedAt: new Date(),
        updatedAt: new Date(),
      },
      [created] = existing
        ? await db
            .update(staff)
            .set(values)
            .where(
              and(
                eq(staff.id, existing.id),
                eq(staff.restaurantId, session.restaurantId),
              ),
            )
            .returning()
        : await db
            .insert(staff)
            .values({ restaurantId: session.restaurantId, ...values })
            .returning();
    return Response.json(
      {
        staff: {
          ...created,
          staffCode: `GB-${created.id.slice(0, 8).toUpperCase()}`,
          initials: created.name
            .split(/\s+/)
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase(),
          department: department.name,
          departmentId: department.id,
          role: created.role || "Staff",
          language: created.language === "ta" ? "Tamil" : "English",
          photoUrl: created.photoPath
            ? `/api/admin/staff/${created.id}/photo`
            : null,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const databaseError = error as { code?: string; constraint?: string };
    if (
      databaseError.code === "23505" ||
      databaseError.constraint === "staff_restaurant_phone" ||
      String(error).includes("staff_restaurant_phone")
    )
      return Response.json(
        { error: "That WhatsApp number already belongs to a staff member" },
        { status: 409 },
      );
    console.error("Staff creation failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      code: databaseError.code || null,
    });
    return Response.json(
      { error: "Staff member could not be saved. Please try again." },
      { status: 500 },
    );
  }
}
