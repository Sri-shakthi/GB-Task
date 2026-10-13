import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth";
import { getDb } from "@/db";
import {
  assignmentEvents,
  assignments,
  departments,
  jobs,
  mediaAssets,
  staff,
  whatsappMessages,
} from "@/db/schema";
import { processDueJobs } from "@/lib/job-worker";

export async function GET() {
  const session = await getOwnerSession();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const rows = await db
    .select({
      assignment: assignments,
      person: staff,
      department: departments.name,
    })
    .from(assignments)
    .innerJoin(staff, eq(assignments.assigneeId, staff.id))
    .leftJoin(departments, eq(assignments.departmentId, departments.id))
    .where(
      and(
        eq(assignments.restaurantId, session.restaurantId),
        gte(
          assignments.createdAt,
          new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        ),
      ),
    )
    .orderBy(desc(assignments.createdAt))
    .limit(200);
  const ids = rows.map((row) => row.assignment.id);
  const [messages, events] = ids.length
    ? await Promise.all([
        db
          .select({
            assignmentId: whatsappMessages.assignmentId,
            status: whatsappMessages.status,
            updatedAt: whatsappMessages.updatedAt,
          })
          .from(whatsappMessages)
          .where(inArray(whatsappMessages.assignmentId, ids))
          .orderBy(desc(whatsappMessages.updatedAt)),
        db
          .select({
            assignmentId: assignmentEvents.assignmentId,
            type: assignmentEvents.type,
            createdAt: assignmentEvents.createdAt,
          })
          .from(assignmentEvents)
          .where(inArray(assignmentEvents.assignmentId, ids))
          .orderBy(desc(assignmentEvents.createdAt)),
      ])
    : [[], []];
  const latestMessage = new Map<string, (typeof messages)[number]>();
  for (const message of messages)
    if (message.assignmentId && !latestMessage.has(message.assignmentId))
      latestMessage.set(message.assignmentId, message);
  const latestResponse = new Map<string, (typeof events)[number]>();
  for (const event of events)
    if (
      event.type.startsWith("whatsapp_") &&
      !latestResponse.has(event.assignmentId)
    )
      latestResponse.set(event.assignmentId, event);
  return Response.json({
    assignments: rows.map(({ assignment, person, department }) => ({
      id: assignment.id,
      name: person.name,
      initials: person.name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
      title: assignment.title || "Voice instructions",
      department: department || "Other",
      dueAt: assignment.dueAt.toISOString(),
      assignedAt: assignment.createdAt.toISOString(),
      status: assignment.status,
      instructions: assignment.instructions,
      hasRecording: Boolean(assignment.recordingId),
      hasVideo: Boolean(assignment.videoPath),
      hasCompletionPhoto: Boolean(assignment.completionPhotoPath),
      deliveryStatus: latestMessage.get(assignment.id)?.status || "queued",
      deliveryUpdatedAt:
        latestMessage.get(assignment.id)?.updatedAt.toISOString() || null,
      staffResponse: latestResponse.get(assignment.id)?.type || null,
    })),
  });
}
const input = z
  .object({
    staffId: z.string().uuid(),
    departmentId: z.string().uuid().optional(),
    dueAt: z.coerce.date(),
    priority: z.enum(["low", "normal", "high"]).default("normal"),
    title: z.string().trim().max(240).optional(),
    instructions: z.string().trim().max(4000).optional(),
    recordingId: z.string().uuid().optional(),
    clientRequestId: z.string().uuid().optional(),
  })
  .refine(
    (v) =>
      v.dueAt.getTime() > Date.now() &&
      Boolean(v.title || v.instructions || v.recordingId),
  );
export async function POST(request: Request) {
  const session = await getOwnerSession();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Invalid assignment", details: parsed.error.flatten() },
      { status: 400 },
    );
  const db = getDb();
  const personPromise = db
      .select({ id: staff.id })
      .from(staff)
      .where(
        and(
          eq(staff.id, parsed.data.staffId),
          eq(staff.restaurantId, session.restaurantId),
          eq(staff.active, true),
        ),
      )
      .limit(1),
    mediaPromise = parsed.data.recordingId
      ? db
          .select({ blobUrl: mediaAssets.blobUrl })
          .from(mediaAssets)
          .where(
            and(
              eq(mediaAssets.id, parsed.data.recordingId),
              eq(mediaAssets.restaurantId, session.restaurantId),
              eq(mediaAssets.kind, "voice_recording"),
            ),
          )
          .limit(1)
      : Promise.resolve([]);
  const [[person], [media]] = await Promise.all([personPromise, mediaPromise]);
  if (!person)
    return Response.json(
      { error: "Active staff member not found" },
      { status: 404 },
    );
  if (parsed.data.recordingId && !media?.blobUrl)
    return Response.json({ error: "Recording not found" }, { status: 404 });
  const recordingPath = media?.blobUrl || undefined;
  let created: typeof assignments.$inferSelect;
  try {
    created = await db.transaction(async (tx) => {
      const [assignment] = await tx
        .insert(assignments)
        .values({
          id: parsed.data.clientRequestId,
          restaurantId: session.restaurantId,
          assigneeId: person.id,
          departmentId: parsed.data.departmentId,
          title: parsed.data.title,
          instructions: parsed.data.instructions,
          recordingId: parsed.data.recordingId,
          status: "assigned",
          priority: parsed.data.priority,
          dueAt: parsed.data.dueAt,
        })
        .returning();
      await tx.insert(assignmentEvents).values({
        assignmentId: assignment.id,
        actor: `owner:${session.ownerId}`,
        type: "assigned",
      });
      await tx.insert(jobs).values({
        restaurantId: session.restaurantId,
        assignmentId: assignment.id,
        // The worker converts each recording to a template-compatible MP4,
        // uploads it to Meta once, then sends the resulting media ID.
        type: recordingPath ? "prepare_video" : "send_whatsapp",
        payload: {
          recordingPath,
          recordingId: parsed.data.recordingId,
          title: assignment.title,
        },
        status: "pending",
      });
      return assignment;
    });
  } catch (error) {
    // Normal requests no longer pay for an idempotency lookup. Only a rare
    // client retry does the extra read after its UUID already exists.
    if (
      parsed.data.clientRequestId &&
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      const [existing] = await db
        .select()
        .from(assignments)
        .where(
          and(
            eq(assignments.id, parsed.data.clientRequestId),
            eq(assignments.restaurantId, session.restaurantId),
          ),
        )
        .limit(1);
      if (existing) return Response.json({ assignment: existing });
    }
    throw error;
  }
  // Start delivery as soon as the assignment response has been returned. The
  // scheduled worker remains the durable retry path if this background run is
  // interrupted by a serverless instance shutdown.
  after(async () => {
    try {
      await processDueJobs(1);
    } catch (error) {
      console.error("Immediate assignment delivery failed", error);
    }
  });
  return Response.json({ assignment: created }, { status: 201 });
}
