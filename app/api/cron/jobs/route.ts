import { NextResponse } from "next/server";
import { processDueJobs, purgeExpiredTaskHistory } from "@/lib/job-worker";
import { requireCron } from "@/lib/security";

export const maxDuration = 120;

export async function GET(request: Request) {
  if (!requireCron(request))
    return new NextResponse("Unauthorized", { status: 401 });
  try {
    const jobs = await processDueJobs(5),
      retention = await purgeExpiredTaskHistory(8);
    return NextResponse.json({ ...jobs, retention });
  } catch {
    return NextResponse.json({ error: "Job worker failed" }, { status: 500 });
  }
}
