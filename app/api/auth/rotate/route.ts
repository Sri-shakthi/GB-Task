import {rotateOwnerSession} from "@/lib/auth";
export async function POST(request:Request){const origin=request.headers.get("origin"),url=new URL(request.url);if(origin!==url.origin)return new Response("Invalid origin",{status:403});return await rotateOwnerSession()?Response.json({ok:true}):Response.json({error:"Unauthorized"},{status:401})}
