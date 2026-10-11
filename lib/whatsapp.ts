type SendTask = {
  assignmentId: string;
  phone: string;
  name: string;
  deadline: string;
  language: "en" | "ta";
  mediaId?: string;
  body?: string;
};
const graphVersion = () => process.env.WHATSAPP_GRAPH_VERSION || "v23.0";
function credentials() {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID,
    token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneId || !token)
    throw new Error("WhatsApp credentials are incomplete");
  return { phoneId, token };
}
export async function uploadVideoToMeta(
  video: ArrayBuffer,
  mimeType = "video/mp4",
) {
  if (video.byteLength > 16 * 1024 * 1024)
    throw new Error("Generated WhatsApp video exceeds the 16 MB limit");
  if (mimeType !== "video/mp4" && mimeType !== "video/3gpp")
    throw new Error("Generated media must be MP4 or 3GPP video");
  if (process.env.WHATSAPP_DEV_MODE !== "false")
    return {
      mode: "development" as const,
      id: `dev_media_${crypto.randomUUID()}`,
    };
  const { phoneId, token } = credentials(),
    form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", mimeType);
  form.set("file", new Blob([video], { type: mimeType }), "gb-task.mp4");
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion()}/${phoneId}/media`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    },
  );
  const json = await response.json();
  if (!response.ok || !json.id)
    throw new Error(
      `WhatsApp media upload failed (${response.status}): ${json.error?.message || "unknown error"}`,
    );
  return { mode: "live" as const, id: String(json.id) };
}
export async function sendTask(input: SendTask) {
  if (process.env.WHATSAPP_DEV_MODE !== "false")
    return {
      mode: "development" as const,
      id: `dev_${crypto.randomUUID()}`,
      status: "queued",
    };
  const { phoneId, token } = credentials();
  const template = input.mediaId
    ? input.language === "ta"
      ? process.env.WHATSAPP_VIDEO_TEMPLATE_TA
      : process.env.WHATSAPP_VIDEO_TEMPLATE_EN
    : input.language === "ta"
      ? process.env.WHATSAPP_TEXT_TEMPLATE_TA
      : process.env.WHATSAPP_TEXT_TEMPLATE_EN;
  if (!phoneId || !token || !template)
    throw new Error("WhatsApp configuration is incomplete");
  const components: any[] = [
    {
      type: "body",
      parameters: [
        { type: "text", text: input.name },
        { type: "text", text: input.deadline },
      ],
    },
  ];
  if (input.mediaId)
    components.unshift({
      type: "header",
      parameters: [{ type: "video", video: { id: input.mediaId } }],
    });
  if (process.env.WHATSAPP_QUICK_REPLY_BUTTONS === "true")
    components.push(
      ...["accept", "help", "complete"].map((action, index) => ({
        type: "button",
        sub_type: "quick_reply",
        index: String(index),
        parameters: [
          { type: "payload", payload: `task:${input.assignmentId}:${action}` },
        ],
      })),
    );
  if (process.env.WHATSAPP_RESPONSE_MODE === "flow")
    components.push({
      type: "button",
      sub_type: "flow",
      index: "0",
      parameters: [
        {
          type: "action",
          action: {
            flow_token: `task:${input.assignmentId}`,
            flow_action_data: { assignment_id: input.assignmentId },
          },
        },
      ],
    });
  const language =
    input.language === "ta"
      ? process.env.WHATSAPP_LANGUAGE_TA || "ta"
      : process.env.WHATSAPP_LANGUAGE_EN || "en_US";
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion()}/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.phone,
        type: "template",
        template: { name: template, language: { code: language }, components },
      }),
    },
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      `WhatsApp send failed (${response.status}): ${json.error?.message || "unknown error"}`,
    );
  return {
    mode: "live" as const,
    id: json.messages?.[0]?.id as string,
    status: "accepted",
  };
}
