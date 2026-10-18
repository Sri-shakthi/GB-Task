import test from "node:test";
import assert from "node:assert/strict";
import { safeErrorDetails, safeErrorMessage } from "../lib/safe-error.ts";

test("production error formatting redacts credentials and phone numbers", () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "super-secret-value";
  try {
    const error = new Error(
      "request Bearer abc.def.ghi failed for +91 98765 43210 " +
        "with super-secret-value at https://example.test/?token=query-secret",
    );
    const details = safeErrorDetails(error);
    assert.doesNotMatch(details, /abc\.def\.ghi/);
    assert.doesNotMatch(details, /98765/);
    assert.doesNotMatch(details, /super-secret-value/);
    assert.doesNotMatch(details, /query-secret/);
    assert.match(details, /\[redacted\]/);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});

test("database job errors remain short and useful", () => {
  assert.equal(
    safeErrorMessage(new Error("connection unavailable")),
    "connection unavailable",
  );
  assert.ok(safeErrorMessage("x".repeat(2_000)).length <= 1_000);
});
