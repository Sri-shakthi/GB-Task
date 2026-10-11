import {createHash,createHmac,timingSafeEqual} from "node:crypto";
export const sha256=(value:string)=>createHash("sha256").update(value).digest("hex");
export function verifyMetaSignature(raw:Buffer,signature:string|null){const secret=process.env.WHATSAPP_APP_SECRET;if(!secret||!signature?.startsWith("sha256="))return false;const expected=`sha256=${createHmac("sha256",secret).update(raw).digest("hex")}`;return expected.length===signature.length&&timingSafeEqual(Buffer.from(expected),Buffer.from(signature))}
export function requireCron(request:Request){const secret=process.env.CRON_SECRET;return Boolean(secret&&request.headers.get("authorization")===`Bearer ${secret}`)}
