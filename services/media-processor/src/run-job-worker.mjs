const endpoint = process.env.JOB_WORKER_URL;
const secret = process.env.CRON_SECRET;

if (!endpoint || !secret) {
  console.error("JOB_WORKER_URL and CRON_SECRET are required");
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(endpoint, {
      headers: { authorization: `Bearer ${secret}` },
      // Vercel stops the target function at 120 seconds. Give this caller a
      // small margin so a timeout is reported accurately by the scheduler.
      signal: AbortSignal.timeout(115_000),
    });
    const body = await response.text();
    console.log(`Worker trigger ${response.status}: ${body}`);
    if (!response.ok) process.exitCode = 1;
  } catch (error) {
    console.error("Worker trigger failed", error);
    process.exitCode = 1;
  }
}
