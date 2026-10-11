import test from "node:test";
import assert from "node:assert/strict";
import { sendTask, uploadVideoToMeta } from "../lib/whatsapp";
const saved = { ...process.env };
test.afterEach(() => {
  process.env = { ...saved };
});
test("development adapter never calls Meta", async () => {
  process.env.WHATSAPP_DEV_MODE = "true";
  let called = false;
  global.fetch = (async () => {
    called = true;
    throw new Error("unexpected");
  }) as typeof fetch;
  const result = await sendTask({
    assignmentId: crypto.randomUUID(),
    phone: "+919876543210",
    name: "Priya",
    deadline: "5 Oct, 4:30 pm",
    language: "ta",
    mediaId: "dev_media",
  });
  assert.equal(result.mode, "development");
  assert.equal(called, false);
});
test("live video template includes exact media and task-scoped replies", async () => {
  process.env.WHATSAPP_DEV_MODE = "false";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-1";
  process.env.WHATSAPP_ACCESS_TOKEN = "secret";
  process.env.WHATSAPP_VIDEO_TEMPLATE_EN = "gb_voice_en";
  process.env.WHATSAPP_QUICK_REPLY_BUTTONS = "true";
  const assignmentId = "11111111-1111-4111-8111-111111111111";
  let request: any;
  global.fetch = (async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({ messages: [{ id: "wamid.123" }] }), {
      status: 200,
    });
  }) as typeof fetch;
  const result = await sendTask({
    assignmentId,
    phone: "+919876543210",
    name: "Priya",
    deadline: "5 Oct, 4:30 pm",
    language: "en",
    mediaId: "media-123",
  });
  const body = JSON.parse(request.init.body);
  assert.match(request.url, /\/phone-1\/messages$/);
  assert.equal(body.template.name, "gb_voice_en");
  assert.equal(body.template.components[0].parameters[0].video.id, "media-123");
  const help = body.template.components.find(
    (c: any) => c.type === "button" && c.index === "1",
  );
  assert.equal(help.parameters[0].payload, `task:${assignmentId}:help`);
  assert.equal(result.id, "wamid.123");
});
test("video upload rejects files over Meta limit", async () => {
  process.env.WHATSAPP_DEV_MODE = "false";
  await assert.rejects(
    () => uploadVideoToMeta(new ArrayBuffer(16 * 1024 * 1024 + 1)),
    /16 MB/,
  );
});
test("approved Click Here Flow receives a task-scoped token", async () => {
  process.env.WHATSAPP_DEV_MODE = "false";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-1";
  process.env.WHATSAPP_ACCESS_TOKEN = "secret";
  process.env.WHATSAPP_VIDEO_TEMPLATE_EN = "gb_task_video_en";
  process.env.WHATSAPP_RESPONSE_MODE = "flow";
  process.env.WHATSAPP_QUICK_REPLY_BUTTONS = "false";
  const assignmentId = "22222222-2222-4222-8222-222222222222";
  let body: any;
  global.fetch = (async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ messages: [{ id: "wamid.flow" }] }), {
      status: 200,
    });
  }) as typeof fetch;
  await sendTask({
    assignmentId,
    phone: "+919876543210",
    name: "Usha",
    deadline: "Oct 4 2026",
    language: "en",
    mediaId: "media-flow",
  });
  const flow = body.template.components.find(
    (component: any) => component.sub_type === "flow",
  );
  assert.equal(body.template.name, "gb_task_video_en");
  assert.equal(flow.parameters[0].action.flow_token, `task:${assignmentId}`);
  assert.equal(
    flow.parameters[0].action.flow_action_data.assignment_id,
    assignmentId,
  );
});
