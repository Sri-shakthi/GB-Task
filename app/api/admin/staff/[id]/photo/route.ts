import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { staff } from "@/db/schema";
import { getOwnerSession } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOwnerSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const [person] = await getDb()
    .select({ photoPath: staff.photoPath })
    .from(staff)
    .where(and(eq(staff.id, id), eq(staff.restaurantId, session.restaurantId)))
    .limit(1);
  if (!person?.photoPath) return new Response("Not found", { status: 404 });
  const photo = await get(person.photoPath, { access: "private" });
  if (!photo || photo.statusCode !== 200)
    return new Response("Not found", { status: 404 });
  return new Response(photo.stream, {
    headers: {
      "content-type": photo.blob.contentType || "image/jpeg",
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
