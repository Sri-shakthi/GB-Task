import "server-only";
import { get } from "@vercel/blob";
export async function prepareTaskVideo(input: {
  recordingPath: string;
  assignmentId: string;
  title: string;
}) {
  const endpoint = process.env.MEDIA_PROCESSOR_URL,
    secret = process.env.MEDIA_PROCESSOR_SECRET;
  if (!endpoint || !secret)
    throw new Error("Managed media processor is not configured");
  const recording = await get(input.recordingPath, {
    access: "private",
    useCache: false,
  });
  if (!recording || recording.statusCode !== 200)
    throw new Error("Private recording could not be read");
  const bytes = await new Response(recording.stream).arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > 10 * 1024 * 1024)
    throw new Error("Recording has an invalid size");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": recording.blob.contentType || "application/octet-stream",
      "content-length": String(bytes.byteLength),
      "x-assignment-id": input.assignmentId,
      "x-task-title": input.title.slice(0, 240),
    },
    body: bytes,
    // Leave enough time for the worker to persist a retry before Vercel's
    // 120-second function deadline.
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok)
    throw new Error(`Media processor failed (${response.status})`);
  const type = response.headers.get("content-type")?.split(";")[0];
  if (type !== "video/mp4")
    throw new Error("Media processor returned an incompatible video");
  const video = await response.arrayBuffer();
  if (video.byteLength === 0 || video.byteLength > 16 * 1024 * 1024)
    throw new Error("Generated WhatsApp video has an invalid size");
  return video;
}
