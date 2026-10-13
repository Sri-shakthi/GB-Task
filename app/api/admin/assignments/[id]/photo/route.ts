import { and, eq, gte } from "drizzle-orm";
import { get } from "@vercel/blob";
import { getOwnerSession } from "@/lib/auth";
import { getDb } from "@/db";
import { assignments } from "@/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOwnerSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const [assignment] = await getDb()
    .select({ path: assignments.completionPhotoPath })
    .from(assignments)
    .where(
      and(
        eq(assignments.id, id),
        eq(assignments.restaurantId, session.restaurantId),
        gte(
          assignments.createdAt,
          new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        ),
      ),
    )
    .limit(1);
  if (!assignment?.path)
    return new Response("Completion photo not available", { status: 404 });
  const photo = await get(assignment.path, {
    access: "private",
    useCache: false,
  });
  if (!photo || photo.statusCode !== 200)
    return new Response("Completion photo not available", { status: 404 });
  return new Response(photo.stream, {
    headers: {
      "content-length": String(photo.blob.size),
      "content-type": photo.blob.contentType || "image/jpeg",
      "cache-control": "private, max-age=300",
    },
  });
}
