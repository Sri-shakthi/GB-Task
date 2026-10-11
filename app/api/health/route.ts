import {NextResponse} from "next/server";
export function GET(){return NextResponse.json({ok:true,service:"gb-tasks",database:Boolean(process.env.DATABASE_URL),whatsapp:process.env.WHATSAPP_DEV_MODE==="false"?"live":"development"},{headers:{"cache-control":"no-store"}})}
