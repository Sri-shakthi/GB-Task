const endpoint = process.env.JOB_WORKER_URL;
const secret = process.env.CRON_SECRET;
const retryDelays = [0, 2_000, 5_000];

if (!endpoint || !secret) {
  console.error("JOB_WORKER_URL and CRON_SECRET are required");
  process.exitCode = 1;
} else {
  let transientFailure;
  for (let attempt = 0; attempt < retryDelays.length; attempt++) {
    if (retryDelays[attempt])
      await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
    try {
      const response = await fetch(endpoint, {
        headers: { authorization: `Bearer ${secret}` },
        // Vercel stops the target function at 120 seconds. Give this caller a
        // small margin so a timeout is reported accurately by the scheduler.
        signal: AbortSignal.timeout(115_000),
      });
      const body = await response.text();
      console.log(
        `Worker trigger ${response.status} (attempt ${attempt + 1}/${retryDelays.length}): ${body}`,
      );
      if (response.ok) {
        transientFailure = undefined;
        break;
      }
      // A 4xx response is a durable configuration/authentication problem. It
      // must stop the deployment so it cannot fail silently forever.
      if (response.status < 500) {
        transientFailure = undefined;
        process.exitCode = 1;
        break;
      }
      transientFailure = `HTTP ${response.status}: ${body}`;
    } catch (error) {
      transientFailure = error instanceof Error ? error.message : String(error);
      console.error(
        `Worker trigger attempt ${attempt + 1}/${retryDelays.length} failed`,
        error,
      );
    }
  }

  if (transientFailure) {
    // Railway disables future cron invocations when a single run exits 1.
    // Preserve the schedule after transient 5xx/network failures; the next
    // five-minute run is itself the durable retry.
    console.warn(
      `Worker trigger remained unavailable; leaving cron active for the next scheduled retry: ${transientFailure}`,
    );
  }
}
