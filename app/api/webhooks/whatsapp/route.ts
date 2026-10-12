import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  assignments,
  assignmentEvents,
  helpRequests,
  staff,
  webhookEvents,
  whatsappMessages,
} from "@/db/schema";
import { verifyMetaSignature } from "@/lib/security";
export function GET(request: Request) {
  const u = new URL(request.url);
  if (
    u.searchParams.get("hub.verify_token") !== process.env.WHATSAPP_VERIFY_TOKEN
  )
    return new Response("Forbidden", { status: 403 });
  return new Response(u.searchParams.get("hub.challenge") || "", {
    status: 200,
  });
}
export async function POST(request: Request) {
  const raw = Buffer.from(await request.arrayBuffer());
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256")))
    return new Response("Invalid signature", { status: 401 });
  let body: any;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const db = getDb();
  for (const entry of body.entry || [])
    for (const change of entry.changes || []) {
      const value = change.value || {};
      for (const status of value.statuses || []) {
        const eventId = `status:${status.id}:${status.status}:${status.timestamp}`;
        const inserted = await db
          .insert(webhookEvents)
          .values({ providerEventId: eventId, payload: status })
          .onConflictDoNothing()
          .returning({ id: webhookEvents.id });
        if (!inserted.length) continue;
        const [message] = await db
          .select()
          .from(whatsappMessages)
          .where(eq(whatsappMessages.providerId, status.id))
          .limit(1);
        if (message && shouldAdvance(message.status, status.status))
          await db
            .update(whatsappMessages)
            .set({
              status: status.status,
              errorCode: String(status.errors?.[0]?.code || "") || null,
              errorDetail:
                String(status.errors?.[0]?.error_data?.details || "") || null,
              updatedAt: new Date(),
            })
            .where(eq(whatsappMessages.id, message.id));
        await db
          .update(webhookEvents)
          .set({ processedAt: new Date() })
          .where(eq(webhookEvents.id, inserted[0].id));
      }
      for (const message of value.messages || []) {
        const inserted = await db
          .insert(webhookEvents)
          .values({
            providerEventId: `message:${message.id}`,
            payload: message,
          })
          .onConflictDoNothing()
          .returning({ id: webhookEvents.id });
        if (!inserted.length) continue;
        await processReply(message);
        await db
          .update(webhookEvents)
          .set({ processedAt: new Date() })
          .where(eq(webhookEvents.id, inserted[0].id));
      }
    }
  return Response.json({ received: true });
}
async function processReply(message: any) {
  const contextId = message.context?.id;
  if (!contextId) return;
  const quickReply =
    /^task:([0-9a-f-]{36}):(accept|complete|help|decline)$/.exec(
      message.interactive?.button_reply?.id || "",
    );
  let assignmentId = quickReply?.[1],
    action = quickReply?.[2];
  if (message.interactive?.type === "nfm_reply") {
    try {
      const response = JSON.parse(
        message.interactive.nfm_reply.response_json || "{}",
      );
      const token = String(response.flow_token || response.assignment_id || "");
      assignmentId = token.startsWith("task:") ? token.slice(5) : token;
      const answer = String(
        response.answer ||
          response.response ||
          response.selection ||
          response.completed ||
          Object.entries(response).find(
            ([key, value]) =>
              !["flow_token", "assignment_id"].includes(key) &&
              typeof value === "string",
          )?.[1] ||
          "",
      )
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        // WhatsApp Flows may prefix option values with their list position,
        // for example `1_No` or `2_Need help`.
        .replace(/^\d+_/, "");
      action = [
        "yes",
        "completed",
        "complete",
        "done",
        "i_m_done",
        "im_done",
      ].includes(answer)
        ? "complete"
        : [
              "doing",
              "in_progress",
              "i_am_doing_it",
              "i_m_doing_it",
              "im_doing_it",
              "started",
            ].includes(answer)
          ? "start"
          : [
                "no",
                "not_completed",
                "not_complete",
                "not_yet",
                "not_started",
                "not_started_yet",
              ].includes(answer)
            ? "not_yet"
            : ["need_help", "help", "needs_help", "help_needed"].includes(
                  answer,
                )
              ? "help"
              : ["accept", "accepted"].includes(answer)
                ? "accept"
                : undefined;
    } catch {
      return;
    }
  }
  if (!assignmentId || !action || !/^[0-9a-f-]{36}$/.test(assignmentId)) return;
  const db = getDb(),
    [outbound] = await db
      .select()
      .from(whatsappMessages)
      .where(
        and(
          eq(whatsappMessages.providerId, contextId),
          eq(whatsappMessages.assignmentId, assignmentId),
        ),
      )
      .limit(1);
  if (!outbound) return;
  const [row] = await db
    .select({ assignment: assignments, person: staff })
    .from(assignments)
    .innerJoin(staff, eq(assignments.assigneeId, staff.id))
    .where(eq(assignments.id, assignmentId))
    .limit(1);
  if (
    !row ||
    digits(row.person.phone) !== digits(message.from) ||
    row.assignment.cancelledAt
  )
    return;
  await db.transaction(async (tx) => {
    if (action === "help")
      await tx
        .insert(helpRequests)
        .values({ assignmentId, message: "Requested through WhatsApp" });
    else if (action !== "not_yet") {
      const next =
        action === "accept"
          ? "accepted"
          : action === "start"
            ? "in_progress"
            : action === "complete"
              ? "completed"
              : "declined";
      await tx
        .update(assignments)
        .set({ status: next, updatedAt: new Date() })
        .where(eq(assignments.id, assignmentId));
    }
    await tx.insert(assignmentEvents).values({
      assignmentId,
      actor: `staff:${row.person.id}`,
      type: `whatsapp_${action}`,
      metadata: { providerMessageId: message.id, response: action },
    });
  });
}
const digits = (value: string) => String(value || "").replace(/\D/g, "");
function shouldAdvance(current: string, next: string) {
  const order: Record<string, number> = {
    queued: 0,
    accepted: 1,
    sent: 2,
    delivered: 3,
    read: 4,
    failed: 5,
  };
  return (order[next] ?? 0) >= (order[current] ?? 0);
}
