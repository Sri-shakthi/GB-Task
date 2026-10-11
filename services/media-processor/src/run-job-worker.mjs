const endpoint = process.env.JOB_WORKER_URL;
const secret = process.env.CRON_SECRET;

if (!endpoint || !secret) {
  console.error("JOB_WORKER_URL and CRON_SECRET are required");
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(endpoint, {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(240_000),
    });
    const body = await response.text();
    console.log(`Worker trigger ${response.status}: ${body}`);
    if (!response.ok) process.exitCode = 1;
  } catch (error) {
    console.error("Worker trigger failed", error);
    process.exitCode = 1;
  }
}
