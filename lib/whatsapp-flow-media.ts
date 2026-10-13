import "server-only";
import {
  createDecipheriv,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { put } from "@vercel/blob";

export type FlowPhoto = {
  file_name: string;
  cdn_url: string;
  encryption_metadata: {
    encryption_key: string;
    hmac_key: string;
    iv: string;
    plaintext_hash: string;
    encrypted_hash: string;
  };
};

const MAX_ENCRYPTED_BYTES = 6 * 1024 * 1024 + 64;

export function parseFlowPhoto(value: unknown): FlowPhoto | null {
  const item = Array.isArray(value) ? value[0] : null;
  if (!item || typeof item !== "object") return null;
  const candidate = item as Record<string, unknown>,
    metadata = candidate.encryption_metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const keys = metadata as Record<string, unknown>;
  if (
    typeof candidate.file_name !== "string" ||
    typeof candidate.cdn_url !== "string" ||
    ![
      "encryption_key",
      "hmac_key",
      "iv",
      "plaintext_hash",
      "encrypted_hash",
    ].every((key) => typeof keys[key] === "string")
  )
    return null;
  const url = new URL(candidate.cdn_url);
  if (
    url.protocol !== "https:" ||
    !(
      url.hostname === "whatsapp.net" ||
      url.hostname.endsWith(".whatsapp.net") ||
      url.hostname === "fbcdn.net" ||
      url.hostname.endsWith(".fbcdn.net")
    )
  )
    return null;
  return candidate as FlowPhoto;
}

export async function storeFlowPhoto(
  photo: FlowPhoto,
  restaurantId: string,
  assignmentId: string,
) {
  const response = await fetch(photo.cdn_url, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new Error(`Flow photo download failed (${response.status})`);
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_ENCRYPTED_BYTES)
    throw new Error("Flow photo exceeds the size limit");
  const encrypted = Buffer.from(await response.arrayBuffer());
  if (!encrypted.length || encrypted.length > MAX_ENCRYPTED_BYTES)
    throw new Error("Flow photo is empty or exceeds the size limit");

  const metadata = photo.encryption_metadata;
  verifyHash(encrypted, metadata.encrypted_hash, "encrypted");
  if (encrypted.length <= 10) throw new Error("Invalid encrypted flow photo");
  const ciphertext = encrypted.subarray(0, -10),
    receivedMac = encrypted.subarray(-10),
    iv = decode(metadata.iv),
    key = decode(metadata.encryption_key),
    hmacKey = decode(metadata.hmac_key),
    expectedMac = createHmac("sha256", hmacKey)
      .update(Buffer.concat([iv, ciphertext]))
      .digest()
      .subarray(0, 10);
  if (!safeEqual(receivedMac, expectedMac))
    throw new Error("Flow photo integrity check failed");
  if (iv.length !== 16 || ![16, 24, 32].includes(key.length))
    throw new Error("Invalid flow photo encryption metadata");
  const decipher = createDecipheriv(`aes-${key.length * 8}-cbc`, key, iv),
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  verifyHash(plaintext, metadata.plaintext_hash, "plaintext");
  const contentType = detectImageType(plaintext);
  if (!contentType) throw new Error("Unsupported completion photo format");
  const extension =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : "jpg";
  const stored = await put(
    `restaurants/${restaurantId}/completion-photos/${assignmentId}.${extension}`,
    plaintext,
    {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
    },
  );
  return stored.pathname;
}

function decode(value: string) {
  return Buffer.from(value, "base64");
}

function verifyHash(bytes: Buffer, encoded: string, label: string) {
  const expected = decode(encoded),
    actual = createHash("sha256").update(bytes).digest();
  if (!safeEqual(actual, expected))
    throw new Error(`Flow photo ${label} hash did not match`);
}

function safeEqual(a: Buffer, b: Buffer) {
  return a.length === b.length && timingSafeEqual(a, b);
}

function detectImageType(bytes: Buffer) {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
    return "image/png";
  if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  return null;
}
