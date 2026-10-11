import {NextResponse} from "next/server";import {requireCron} from "@/lib/security";import {processDueJobs} from "@/lib/job-worker";
export const maxDuration=120;
export async function GET(request:Request){if(!requireCron(request))return new NextResponse("Unauthorized",{status:401});try{return NextResponse.json(await processDueJobs(5))}catch{return NextResponse.json({error:"Job worker failed"},{status:500})}}
