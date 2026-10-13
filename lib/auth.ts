import "server-only";
import { cookies, headers } from "next/headers";
import {
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { and, count, eq, gte, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  authAuditEvents,
  authSessions,
  loginAttempts,
  owners,
  passwordResetTokens,
} from "@/db/schema";
import {
  SESSION_COOKIE,
  signSession,
  verifySession,
  type OwnerSession,
} from "./session";
import { neonAuth } from "./neon-auth";
const SESSION_MS = 12 * 60 * 60 * 1000;
function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (value && value.length >= 32) return value;
  throw new Error("AUTH_SECRET must contain at least 32 characters");
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, expected] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const bytes = Buffer.from(expected, "hex");
  return bytes.length === actual.length && timingSafeEqual(bytes, actual);
}
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}
async function requestMeta() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  return {
    ipHash: hash(`${secret()}:${ip}`),
    userAgentHash: hash(h.get("user-agent") || "unknown"),
  };
}
function base32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
    clean = value.toUpperCase().replace(/=|\s/g, "");
  let bits = "",
    output = [] as number[];
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid MFA secret");
    bits += index.toString(2).padStart(5, "0");
  }
  for (let i = 0; i + 8 <= bits.length; i += 8)
    output.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(output);
}
function totp(secretValue: string, time = Date.now()) {
  const key = base32(secretValue),
    counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const digest = createHmac("sha1", key).update(counter).digest(),
    offset = digest[digest.length - 1] & 15;
  return String(
    (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000,
  ).padStart(6, "0");
}
function decryptMfa(value: string) {
  const encoded = process.env.MFA_ENCRYPTION_KEY;
  if (!encoded) throw new Error("MFA encryption key is missing");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("MFA encryption key must be 32 bytes");
  const [ivHex, tagHex, dataHex] = value.split(".");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
function verifyMfa(encrypted: string | null, code: string) {
  if (!encrypted || !/^\d{6}$/.test(code)) return false;
  const value = decryptMfa(encrypted);
  return [-30000, 0, 30000].some((offset) => {
    const expected = totp(value, Date.now() + offset);
    return timingSafeEqual(Buffer.from(expected), Buffer.from(code));
  });
}
export async function authenticateOwner(
  email: string,
  password: string,
  mfaCode: string,
) {
  const normalized = email.trim().toLowerCase();
  const db = getDb(),
    meta = await requestMeta(),
    identifierHash = hash(normalized),
    windowStart = new Date(Date.now() - 15 * 60 * 1000);
  const [[byOwner], [byIp]] = await Promise.all([
    db
      .select({ attempts: count() })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.success, false),
          gte(loginAttempts.attemptedAt, windowStart),
          eq(loginAttempts.identifierHash, identifierHash),
        ),
      ),
    db
      .select({ attempts: count() })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.success, false),
          gte(loginAttempts.attemptedAt, windowStart),
          eq(loginAttempts.ipHash, meta.ipHash),
        ),
      ),
  ]);
  if ((byOwner?.attempts || 0) >= 8 || (byIp?.attempts || 0) >= 40) {
    await db.insert(authAuditEvents).values({
      event: "login_rate_limited",
      ipHash: meta.ipHash,
      userAgentHash: meta.userAgentHash,
      metadata: { identifierHash },
    });
    throw new Error("RATE_LIMITED");
  }
  const [owner] = await db
    .select()
    .from(owners)
    .where(and(eq(owners.email, normalized), eq(owners.active, true)))
    .limit(1);
  const valid = Boolean(
    owner &&
    verifyPassword(password, owner.passwordHash) &&
    (!owner.mfaEnabled || verifyMfa(owner.mfaSecretEncrypted, mfaCode)),
  );
  await db
    .insert(loginAttempts)
    .values({ identifierHash, ipHash: meta.ipHash, success: valid });
  await db.insert(authAuditEvents).values({
    ownerId: owner?.id,
    restaurantId: owner?.restaurantId,
    event: valid ? "login_succeeded" : "login_failed",
    ipHash: meta.ipHash,
    userAgentHash: meta.userAgentHash,
    metadata: { mfaRequired: Boolean(owner?.mfaEnabled) },
  });
  if (!valid) return null;
  await db
    .update(owners)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(owners.id, owner!.id));
  return owner!;
}
export async function createOwnerSession(owner: {
  id: string;
  restaurantId: string;
  email: string;
  sessionVersion: number;
}) {
  const meta = await requestMeta(),
    sid = randomUUID(),
    payload: OwnerSession = {
      email: owner.email,
      ownerId: owner.id,
      restaurantId: owner.restaurantId,
      sid,
      version: owner.sessionVersion,
      exp: Date.now() + SESSION_MS,
    };
  if (process.env.DATABASE_URL)
    await getDb()
      .insert(authSessions)
      .values({
        id: sid,
        ownerId: owner.id,
        restaurantId: owner.restaurantId,
        tokenHash: hash(sid),
        sessionVersion: owner.sessionVersion,
        userAgentHash: meta.userAgentHash,
        ipHash: meta.ipHash,
        expiresAt: new Date(payload.exp),
      });
  const token = await signSession(payload, secret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
}
export async function getOwnerSession() {
  const { data } = await neonAuth.getSession();
  const email = data?.user?.email?.trim().toLowerCase(),
    session = data?.session;
  if (!email || !session) return null;
  const [owner] = await getDb()
    .select()
    .from(owners)
    .where(and(eq(owners.email, email), eq(owners.active, true)))
    .limit(1);
  if (!owner) return null;
  return {
    email,
    ownerId: owner.id,
    restaurantId: owner.restaurantId,
    sid: session.id,
    version: owner.sessionVersion,
    exp: new Date(session.expiresAt).getTime(),
  } satisfies OwnerSession;
}
export async function clearOwnerSession(payload?: OwnerSession | null) {
  if (payload === undefined) payload = await getOwnerSession();
  if (payload) {
    try {
      const meta = await requestMeta(),
        db = getDb();
      await db.insert(authAuditEvents).values({
        ownerId: payload.ownerId,
        restaurantId: payload.restaurantId,
        event: "logout",
        ipHash: meta.ipHash,
        userAgentHash: meta.userAgentHash,
      });
    } catch (error) {
      // An audit write must never prevent the user's session from being
      // cleared. Keep only the failure type out of the response.
      console.error("Logout audit failed", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
  try {
    await neonAuth.signOut();
  } catch (error) {
    // Local logout must still complete during an auth-provider outage.
    console.error("Neon Auth sign out failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    const cookieStore = await cookies();
    for (const name of [
      "__Secure-neon-auth.session_token",
      "__Secure-neon-auth.local.session_data",
      "__Secure-neon-auth.session_challenge",
      "__Secure-neon-auth.session_challange",
      SESSION_COOKIE,
    ]) {
      cookieStore.set(name, "", {
        expires: new Date(0),
        maxAge: 0,
        path: "/",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
      });
      // Clear a possible host-only development cookie as well.
      cookieStore.delete(name);
    }
  }
}
export function csrfToken(session: OwnerSession) {
  return createHmac("sha256", secret())
    .update(`logout:${session.sid}`)
    .digest("base64url");
}
export function verifyCsrf(session: OwnerSession, value: string) {
  const expected = csrfToken(session);
  return (
    value.length === expected.length &&
    timingSafeEqual(Buffer.from(value), Buffer.from(expected))
  );
}
export async function rotateOwnerSession() {
  return Boolean(await getOwnerSession());
}
export async function createPasswordReset(email: string) {
  if (!process.env.DATABASE_URL) return null;
  const db = getDb(),
    normalized = email.trim().toLowerCase(),
    [owner] = await db
      .select()
      .from(owners)
      .where(and(eq(owners.email, normalized), eq(owners.active, true)))
      .limit(1);
  if (!owner) return null;
  const raw = randomBytes(32).toString("base64url");
  await db.insert(passwordResetTokens).values({
    ownerId: owner.id,
    tokenHash: hash(raw),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
  await db.insert(authAuditEvents).values({
    ownerId: owner.id,
    restaurantId: owner.restaurantId,
    event: "password_reset_requested",
  });
  return { owner, raw };
}
export async function resetPassword(raw: string, password: string) {
  if (!process.env.DATABASE_URL || password.length < 12) return false;
  const db = getDb(),
    [record] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, hash(raw)),
          isNull(passwordResetTokens.usedAt),
          gte(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);
  if (!record) return false;
  const [owner] = await db
    .select()
    .from(owners)
    .where(eq(owners.id, record.ownerId))
    .limit(1);
  if (!owner) return false;
  await db.transaction(async (tx) => {
    await tx
      .update(owners)
      .set({
        passwordHash: hashPassword(password),
        sessionVersion: owner.sessionVersion + 1,
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(owners.id, owner.id));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, record.id));
    await tx
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(authSessions.ownerId, owner.id), isNull(authSessions.revokedAt)),
      );
    await tx.insert(authAuditEvents).values({
      ownerId: owner.id,
      restaurantId: owner.restaurantId,
      event: "password_reset_completed",
    });
  });
  return true;
}
export function authSecret() {
  return secret();
}
