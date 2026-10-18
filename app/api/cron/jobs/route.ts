import { NextResponse } from "next/server";
import { processDueJobs, purgeExpiredTaskHistory } from "@/lib/job-worker";
import { requireCron } from "@/lib/security";
import { safeErrorDetails } from "@/lib/safe-error";

export const maxDuration = 120;

export async function GET(request: Request) {
  if (!requireCron(request))
    return new NextResponse("Unauthorized", { status: 401 });

  let jobs;
  try {
    // One potentially slow media job keeps the whole invocation inside the
    // 120-second serverless deadline. The five-minute scheduler drains retries.
    jobs = await processDueJobs(1);
  } catch (error) {
    console.error("Cron job processing failed", {
      stage: "job_processing",
      error: safeErrorDetails(error),
    });
    return NextResponse.json(
      { error: "Job worker failed", stage: "job_processing" },
      { status: 500 },
    );
  }

  try {
    const retention = await purgeExpiredTaskHistory(8);
    return NextResponse.json({ ...jobs, retention });
  } catch (error) {
    console.error("Cron retention cleanup failed", {
      stage: "retention_cleanup",
      error: safeErrorDetails(error),
    });
    return NextResponse.json(
      { error: "Job worker failed", stage: "retention_cleanup", jobs },
      { status: 500 },
    );
  }
}
