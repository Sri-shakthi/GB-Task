import { and, eq, gte } from "drizzle-orm";
import { get, put } from "@vercel/blob";
import { getOwnerSession } from "@/lib/auth";
import { getDb } from "@/db";
import { assignments, mediaAssets } from "@/db/schema";

export const maxDuration = 30;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOwnerSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const db = getDb();
  const [assignment] = await db
    .select({
      videoPath: assignments.videoPath,
      providerMediaId: mediaAssets.providerMediaId,
    })
    .from(assignments)
    .leftJoin(mediaAssets, eq(assignments.recordingId, mediaAssets.id))
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
  if (!assignment) return new Response("Video not available", { status: 404 });
  let videoPath = assignment.videoPath;
  if (!videoPath && assignment.providerMediaId) {
    videoPath = await recoverMetaVideo(
      assignment.providerMediaId,
      session.restaurantId,
      id,
    );
    if (videoPath)
      await db
        .update(assignments)
        .set({ videoPath, updatedAt: new Date() })
        .where(eq(assignments.id, id));
  }
  if (!videoPath) return new Response("Video not available", { status: 404 });
  const video = await get(videoPath, {
    access: "private",
    useCache: false,
  });
  if (!video || video.statusCode !== 200)
    return new Response("Video not available", { status: 404 });
  const contentType = video.blob.contentType || "video/mp4",
    size = video.blob.size,
    range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match)
      return new Response(null, {
        status: 416,
        headers: { "content-range": `bytes */${size}` },
      });
    const requestedStart = match[1] ? Number(match[1]) : 0,
      requestedEnd = match[2] ? Number(match[2]) : size - 1,
      start = Math.min(requestedStart, size - 1),
      end = Math.min(Math.max(requestedEnd, start), size - 1),
      bytes = await new Response(video.stream).arrayBuffer(),
      chunk = bytes.slice(start, end + 1);
    return new Response(chunk, {
      status: 206,
      headers: {
        "accept-ranges": "bytes",
        "content-range": `bytes ${start}-${end}/${size}`,
        "content-length": String(chunk.byteLength),
        "content-type": contentType,
        "cache-control": "private, max-age=300",
      },
    });
  }
  return new Response(video.stream, {
    headers: {
      "accept-ranges": "bytes",
      "content-length": String(size),
      "content-type": contentType,
      "cache-control": "private, max-age=300",
    },
  });
}

async function recoverMetaVideo(
  mediaId: string,
  restaurantId: string,
  assignmentId: string,
) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || mediaId.startsWith("dev_media_")) return null;
  const authorization = `Bearer ${token}`,
    graphVersion = process.env.WHATSAPP_GRAPH_VERSION || "v23.0",
    metadataResponse = await fetch(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(mediaId)}`,
      { headers: { authorization }, cache: "no-store" },
    );
  if (!metadataResponse.ok) return null;
  const metadata = (await metadataResponse.json()) as { url?: string };
  if (!metadata.url) return null;
  const mediaResponse = await fetch(metadata.url, {
    headers: { authorization },
    cache: "no-store",
  });
  if (!mediaResponse.ok) return null;
  const bytes = await mediaResponse.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 16 * 1024 * 1024) return null;
  const stored = await put(
    `restaurants/${restaurantId}/task-videos/${assignmentId}.mp4`,
    bytes,
    {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "video/mp4",
    },
  );
  return stored.pathname;
}
