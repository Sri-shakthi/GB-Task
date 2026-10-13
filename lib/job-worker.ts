import "server-only";
import { del, put } from "@vercel/blob";
import { and, eq, lt, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  assignments,
  jobs,
  mediaAssets,
  staff,
  webhookEvents,
  whatsappMessages,
} from "@/db/schema";
import { prepareTaskVideo } from "./media";
import { sendTask, uploadVideoToMeta } from "./whatsapp";
type Payload = {
  recordingPath?: string;
  recordingId?: string;
  title?: string;
  mediaId?: string;
};
export async function processDueJobs(limit = 5) {
  const db = getDb(),
    result = { processed: 0, completed: 0, failed: 0, uncertain: 0 };
  for (let i = 0; i < limit; i++) {
    const leased = await db.transaction(async (tx) => {
      const [job] = await tx
        .select()
        .from(jobs)
        .where(
          and(
            or(
              eq(jobs.status, "pending"),
              and(eq(jobs.status, "leased"), lt(jobs.leaseUntil, new Date())),
            ),
            lte(jobs.runAfter, new Date()),
          ),
        )
        .orderBy(jobs.runAfter)
        .limit(1)
        .for("update", { skipLocked: true });
      if (!job) return null;
      await tx
        .update(jobs)
        .set({
          status: "leased",
          // FFmpeg can take longer than an ordinary API call. Keep the lease
          // beyond the processor timeout so a second worker cannot duplicate
          // an in-progress conversion.
          leaseUntil: new Date(Date.now() + 240_000),
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));
      return job;
    });
    if (!leased) break;
    result.processed++;
    try {
      if (leased.type === "prepare_video")
        await prepareVideo(
          leased.id,
          leased.assignmentId!,
          leased.restaurantId,
          leased.payload as Payload,
        );
      else if (leased.type === "send_whatsapp") {
        const payload = leased.payload as Payload;
        // Jobs created before the video pipeline used this type but still
        // carry the source recording. Upgrade them in place instead of
        // silently sending a text-only template.
        if (payload.recordingPath && !payload.mediaId)
          await prepareVideo(
            leased.id,
            leased.assignmentId!,
            leased.restaurantId,
            payload,
          );
        else await send(leased.id, leased.assignmentId!, payload);
      } else throw new Error(`Unknown job type: ${leased.type}`);
      result.completed++;
    } catch (error) {
      const uncertain =
          leased.type === "send_whatsapp" &&
          (error instanceof TypeError ||
            (error instanceof Error && error.name === "AbortError")),
        attempts = leased.attempts + 1,
        status = uncertain ? "uncertain" : attempts >= 5 ? "failed" : "pending";
      await db
        .update(jobs)
        .set({
          status,
          attempts,
          leaseUntil: null,
          lastError: safeError(error),
          runAfter: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000),
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, leased.id));
      if (uncertain) result.uncertain++;
      else result.failed++;
    }
  }
  return result;
}
async function prepareVideo(
  jobId: string,
  assignmentId: string,
  restaurantId: string,
  payload: Payload,
) {
  const db = getDb();
  if (!payload.recordingPath)
    throw new Error("Video preparation job has no recording");

  const [assignment] = await db
    .select({
      recordingId: assignments.recordingId,
      videoPath: assignments.videoPath,
    })
    .from(assignments)
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  const recordingId = payload.recordingId || assignment?.recordingId;
  if (!recordingId) throw new Error("Video preparation job has no recording");

  // A Meta media ID is reusable. Reusing this recording skips both FFmpeg and
  // the media upload; only the lightweight template send runs per staff task.
  const [recording] = await db
    .select({
      providerMediaId: mediaAssets.providerMediaId,
      updatedAt: mediaAssets.updatedAt,
    })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.id, recordingId),
        eq(mediaAssets.restaurantId, restaurantId),
      ),
    )
    .limit(1);
  // Meta media IDs expire. Refresh conservatively before the documented
  // roughly-30-day lifetime rather than failing a staff notification.
  const freshEnough =
    recording?.updatedAt &&
    recording.updatedAt.getTime() > Date.now() - 25 * 24 * 60 * 60 * 1000;
  let mediaId = freshEnough
    ? recording?.providerMediaId || undefined
    : undefined;
  let video: ArrayBuffer | undefined;
  // Saving a dashboard copy is independent from Meta's reusable media ID.
  // Otherwise a reused Meta upload leaves this assignment without a preview.
  if (!assignment?.videoPath)
    video = await prepareTaskVideo({
      recordingPath: payload.recordingPath,
      assignmentId,
      title: payload.title || "Today's tasks",
    });
  if (!mediaId) {
    video ??= await prepareTaskVideo({
      recordingPath: payload.recordingPath,
      assignmentId,
      title: payload.title || "Today's tasks",
    });
    mediaId = (await uploadVideoToMeta(video)).id;
  }
  if (video) {
    const storedVideo = await put(
      `restaurants/${restaurantId}/task-videos/${assignmentId}.mp4`,
      video,
      {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "video/mp4",
      },
    );
    await db
      .update(assignments)
      .set({ videoPath: storedVideo.pathname, updatedAt: new Date() })
      .where(eq(assignments.id, assignmentId));
    await db
      .update(mediaAssets)
      .set({ providerMediaId: mediaId, blobUrl: null, updatedAt: new Date() })
      .where(eq(mediaAssets.id, recordingId));
    await del(payload.recordingPath);
  }
  await db
    .update(jobs)
    .set({
      type: "send_whatsapp",
      status: "pending",
      payload: { mediaId, title: payload.title },
      leaseUntil: null,
      runAfter: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId));
}

export async function purgeExpiredTaskHistory(retentionDays = 8) {
  const db = getDb(),
    cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000),
    expired = await db
      .select({ id: assignments.id, videoPath: assignments.videoPath })
      .from(assignments)
      .where(lt(assignments.createdAt, cutoff));
  const videoPaths = expired.flatMap((row) =>
    row.videoPath ? [row.videoPath] : [],
  );
  if (videoPaths.length) await del(videoPaths);
  const removed = await db
    .delete(assignments)
    .where(lt(assignments.createdAt, cutoff))
    .returning({ recordingId: assignments.recordingId });
  for (const row of removed) {
    if (!row.recordingId) continue;
    const [asset] = await db
      .select({ id: mediaAssets.id, blobUrl: mediaAssets.blobUrl })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, row.recordingId))
      .limit(1);
    if (asset?.blobUrl) await del(asset.blobUrl);
    if (asset) await db.delete(mediaAssets).where(eq(mediaAssets.id, asset.id));
  }
  await db.delete(webhookEvents).where(lt(webhookEvents.createdAt, cutoff));
  return { deleted: expired.length };
}
async function send(jobId: string, assignmentId: string, payload: Payload) {
  const db = getDb(),
    [row] = await db
      .select({ assignment: assignments, person: staff })
      .from(assignments)
      .innerJoin(staff, eq(assignments.assigneeId, staff.id))
      .where(eq(assignments.id, assignmentId))
      .limit(1);
  if (!row) throw new Error("Assignment or assignee no longer exists");
  if (row.assignment.cancelledAt || row.assignment.status === "cancelled")
    throw new Error("Assignment was cancelled");
  const response = await sendTask({
    assignmentId,
    phone: row.person.phone,
    name: row.person.name,
    deadline: new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(row.assignment.dueAt),
    language: row.person.language === "ta" ? "ta" : "en",
    mediaId: payload.mediaId,
    body: row.assignment.instructions || undefined,
  });
  await db.transaction(async (tx) => {
    await tx.insert(whatsappMessages).values({
      assignmentId,
      direction: "outbound",
      providerId: response.id,
      status: response.status,
      templateName: payload.mediaId
        ? row.person.language === "ta"
          ? process.env.WHATSAPP_VIDEO_TEMPLATE_TA
          : process.env.WHATSAPP_VIDEO_TEMPLATE_EN
        : row.person.language === "ta"
          ? process.env.WHATSAPP_TEXT_TEMPLATE_TA
          : process.env.WHATSAPP_TEXT_TEMPLATE_EN,
    });
    await tx
      .update(jobs)
      .set({
        status: "completed",
        leaseUntil: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
  });
}
function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Unknown job error")
    .replace(/\+?\d[\d\s-]{7,}/g, "[redacted-phone]")
    .slice(0, 1000);
}
