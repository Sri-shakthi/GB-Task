import { put } from "@vercel/blob";
import { getOwnerSession } from "@/lib/auth";
import { getDb } from "@/db";
import { mediaAssets } from "@/db/schema";
import {
  blobStorageConfigurationMessage,
  isBlobStorageConfigured,
} from "@/lib/blob";
export const maxDuration = 30;
// FFmpeg in the media processor normalizes these into H.264/AAC MP4 before
// they ever reach WhatsApp, so browser-recorded WebM is safe here too.
const recordingTypes = new Set([
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/amr",
  "audio/ogg",
  "audio/opus",
  "audio/webm",
]);
export async function POST(request: Request) {
  const session = await getOwnerSession();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const data = await request.formData(),
    file = data.get("file");
  const mimeType = file instanceof File ? file.type.split(";", 1)[0] : "";
  if (!(file instanceof File) || !recordingTypes.has(mimeType))
    return Response.json(
      {
        error:
          "Upload AAC, M4A, MP3, AMR, OGG, OPUS, or WebM audio.",
      },
      { status: 400 },
    );
  if (file.size <= 0 || file.size > 10 * 1024 * 1024)
    return Response.json(
      { error: "Recording must be under 10 MB" },
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
      `restaurants/${session.restaurantId}/recordings/${crypto.randomUUID()}`,
      file,
      { access: "private", addRandomSuffix: false, contentType: mimeType },
    );
  } catch (error) {
    // Do not return the provider error to the browser: it can contain upstream
    // details. Keep it in the server log so a 502 can be diagnosed.
    console.error("Vercel Blob recording upload failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
      cause:
        error instanceof Error && error.cause instanceof Error
          ? error.cause.message
          : undefined,
    });
    return Response.json(
      {
        error:
          "Recording upload could not be completed. Check the server log for the Vercel Blob error.",
      },
      { status: 502 },
    );
  }
  const [asset] = await getDb()
    .insert(mediaAssets)
    .values({
      restaurantId: session.restaurantId,
      kind: "voice_recording",
      blobUrl: blob.pathname,
      mimeType,
      sizeBytes: file.size,
    })
    .returning({ id: mediaAssets.id });
  return Response.json({ id: asset.id }, { status: 201 });
}
