import { z } from "zod";
export const staffSchema = z.object({
  name: z.string().trim().min(2).max(160),
  phone: z
    .string()
    .regex(
      /^\+[1-9]\d{7,14}$/,
      "Use international format, for example +919876543210",
    ),
  role: z.string().trim().max(100).optional(),
  workCategory: z.string().trim().min(2).max(100),
  address: z.string().trim().max(500).optional(),
  language: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const normalized = value.trim().toLowerCase();
      if (normalized === "english") return "en";
      if (normalized === "tamil") return "ta";
      return normalized;
    },
    z.enum(["en", "ta"]),
  ),
  shift: z.string().trim().max(80).optional(),
  consent: z.literal(true),
});
export const departmentSchema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters").max(100),
});
export const assignmentSchema = z
  .object({
    staffId: z.string().uuid(),
    departmentId: z.string().uuid().optional(),
    dueAt: z.coerce
      .date()
      .refine(
        (d) => d.getTime() > Date.now(),
        "Deadline must be in the future",
      ),
    priority: z.enum(["low", "normal", "high"]).default("normal"),
    title: z.string().trim().max(240).optional(),
    instructions: z.string().trim().max(4000).optional(),
    recordingId: z.string().uuid().optional(),
  })
  .refine(
    (v) => Boolean(v.title || v.instructions || v.recordingId),
    "Add written or voice instructions",
  );
export const staffActionSchema = z.object({
  action: z.enum(["accept", "start", "complete", "help", "decline"]),
  message: z.string().trim().max(500).optional(),
});
