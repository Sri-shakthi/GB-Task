const SENSITIVE_ENV_NAME = /(secret|token|password|key|database_url)/i;

export function safeErrorDetails(error: unknown) {
  const value =
    error instanceof Error
      ? `${error.name}: ${error.message}\n${error.stack || ""}`
      : String(error);

  return redact(value).slice(0, 4_000);
}

export function safeErrorMessage(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  return redact(value).slice(0, 1_000);
}

function redact(value: string) {
  let redacted = value
    .replace(/\bBearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/([?&](?:token|secret|key|password)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\+?\d[\d\s()-]{7,}\d/g, "[redacted-phone]");

  // Errors from SDKs sometimes echo configured credentials. Remove the
  // actual runtime values without ever including their names or values in logs.
  for (const [name, secret] of Object.entries(process.env)) {
    if (!SENSITIVE_ENV_NAME.test(name) || !secret || secret.length < 8)
      continue;
    redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}
