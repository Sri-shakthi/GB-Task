import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
export const taskStatus = pgEnum("task_status", [
  "assigned",
  "accepted",
  "in_progress",
  "completed",
  "declined",
  "cancelled",
]);
export const jobStatus = pgEnum("job_status", [
  "pending",
  "leased",
  "completed",
  "failed",
  "uncertain",
]);
const audit = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};
export const restaurants = pgTable("restaurants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 160 }).notNull(),
  timezone: varchar("timezone", { length: 64 })
    .notNull()
    .default("Asia/Kolkata"),
  settings: jsonb("settings").notNull().default({}),
  ...audit,
});
export const owners = pgTable(
  "owner_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: varchar("role", { length: 32 }).notNull().default("owner"),
    active: boolean("active").notNull().default(true),
    sessionVersion: integer("session_version").notNull().default(1),
    mfaSecretEncrypted: text("mfa_secret_encrypted"),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...audit,
  },
  (t) => [
    uniqueIndex("owner_email_unique").on(t.email),
    index("owner_restaurant_active").on(t.restaurantId, t.active),
  ],
);
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    sessionVersion: integer("session_version").notNull(),
    userAgentHash: varchar("user_agent_hash", { length: 64 }),
    ipHash: varchar("ip_hash", { length: 64 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("auth_session_token").on(t.tokenHash),
    index("auth_session_owner").on(t.ownerId, t.expiresAt),
  ],
);
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("password_reset_token_hash").on(t.tokenHash),
    index("password_reset_owner").on(t.ownerId, t.expiresAt),
  ],
);
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifierHash: varchar("identifier_hash", { length: 64 }).notNull(),
    ipHash: varchar("ip_hash", { length: 64 }).notNull(),
    success: boolean("success").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("login_attempt_identifier").on(t.identifierHash, t.attemptedAt),
    index("login_attempt_ip").on(t.ipHash, t.attemptedAt),
  ],
);
export const authAuditEvents = pgTable(
  "auth_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => owners.id),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id),
    event: varchar("event", { length: 80 }).notNull(),
    ipHash: varchar("ip_hash", { length: 64 }),
    userAgentHash: varchar("user_agent_hash", { length: 64 }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("auth_audit_owner_time").on(t.ownerId, t.createdAt),
    index("auth_audit_restaurant_time").on(t.restaurantId, t.createdAt),
  ],
);
export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id),
    name: varchar("name", { length: 100 }).notNull(),
    active: boolean("active").notNull().default(true),
    ...audit,
  },
  (t) => [uniqueIndex("department_restaurant_name").on(t.restaurantId, t.name)],
);
export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id),
    departmentId: uuid("department_id").references(() => departments.id),
    name: varchar("name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 18 }).notNull(),
    role: varchar("role", { length: 100 }),
    address: text("address"),
    photoPath: text("photo_path"),
    language: varchar("language", { length: 5 }).notNull().default("en"),
    shift: varchar("shift", { length: 80 }),
    active: boolean("active").notNull().default(true),
    consentedAt: timestamp("consented_at", { withTimezone: true }),
    ...audit,
  },
  (t) => [
    uniqueIndex("staff_restaurant_phone").on(t.restaurantId, t.phone),
    index("staff_restaurant_active").on(t.restaurantId, t.active),
  ],
);
export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurants.id),
  kind: varchar("kind", { length: 30 }).notNull(),
  blobUrl: text("blob_url"),
  providerMediaId: text("provider_media_id"),
  mimeType: varchar("mime_type", { length: 100 }),
  sizeBytes: integer("size_bytes"),
  durationSeconds: integer("duration_seconds"),
  ...audit,
});
export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => staff.id),
    departmentId: uuid("department_id").references(() => departments.id),
    title: varchar("title", { length: 240 }),
    instructions: text("instructions"),
    recordingId: uuid("recording_id").references(() => mediaAssets.id),
    videoPath: text("video_path"),
    status: taskStatus("status").notNull().default("assigned"),
    priority: varchar("priority", { length: 20 }).notNull().default("normal"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    ...audit,
  },
  (t) => [
    index("assignment_dashboard").on(t.restaurantId, t.dueAt, t.status),
    index("assignment_assignee").on(t.assigneeId, t.dueAt),
  ],
);
export const assignmentEvents = pgTable("assignment_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id")
    .notNull()
    .references(() => assignments.id, { onDelete: "cascade" }),
  // `owner:` / `staff:` plus a 36-character UUID needs 42 characters.
  actor: varchar("actor", { length: 64 }).notNull(),
  type: varchar("type", { length: 80 }).notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const helpRequests = pgTable("help_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id")
    .notNull()
    .references(() => assignments.id, { onDelete: "cascade" }),
  message: text("message"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  ...audit,
});
export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id").references(() => assignments.id, {
      onDelete: "cascade",
    }),
    providerId: text("provider_id"),
    direction: varchar("direction", { length: 10 }).notNull(),
    status: varchar("status", { length: 40 }).notNull(),
    templateName: text("template_name"),
    errorCode: text("error_code"),
    errorDetail: text("error_detail"),
    ...audit,
  },
  (t) => [uniqueIndex("whatsapp_provider_id").on(t.providerId)],
);
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerEventId: text("provider_event_id").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("webhook_provider_event").on(t.providerEventId)],
);
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id),
    assignmentId: uuid("assignment_id").references(() => assignments.id, {
      onDelete: "cascade",
    }),
    type: varchar("type", { length: 50 }).notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: jobStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    runAfter: timestamp("run_after", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    lastError: text("last_error"),
    ...audit,
  },
  (t) => [index("job_worker_queue").on(t.status, t.runAfter)],
);
export const staffTaskLinks = pgTable(
  "staff_task_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("staff_link_token_hash").on(t.tokenHash)],
);
export const taskPresets = pgTable("task_presets", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurants.id),
  departmentId: uuid("department_id").references(() => departments.id),
  title: varchar("title", { length: 240 }).notNull(),
  instructions: text("instructions"),
  active: boolean("active").notNull().default(true),
  ...audit,
});
export const recurringSchedules = pgTable("recurring_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurants.id),
  presetId: uuid("preset_id")
    .notNull()
    .references(() => taskPresets.id),
  assigneeId: uuid("assignee_id")
    .notNull()
    .references(() => staff.id),
  schedule: varchar("schedule", { length: 100 }).notNull(),
  active: boolean("active").notNull().default(true),
  lastGeneratedAt: timestamp("last_generated_at", { withTimezone: true }),
  ...audit,
});
