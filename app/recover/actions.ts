"use server";
import {redirect} from "next/navigation";
import {createPasswordReset,resetPassword} from "@/lib/auth";
import {sendPasswordReset} from "@/lib/email";
export async function requestResetAction(formData:FormData){const started=Date.now(),email=String(formData.get("email")||"").slice(0,320),result=await createPasswordReset(email);if(result){const base=process.env.NEXT_PUBLIC_APP_URL;if(base)try{await sendPasswordReset(result.owner.email,result.owner.name,`${base}/reset-password?token=${encodeURIComponent(result.raw)}`)}catch{console.error("Password recovery delivery failed")}}const remaining=400-(Date.now()-started);if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));redirect("/recover?sent=1")}
export async function resetPasswordAction(formData:FormData){const token=String(formData.get("token")||""),password=String(formData.get("password")||"");if(password!==String(formData.get("confirm")||""))redirect(`/reset-password?token=${encodeURIComponent(token)}&error=mismatch`);if(!await resetPassword(token,password))redirect(`/reset-password?token=${encodeURIComponent(token)}&error=invalid`);redirect("/login?reset=1")}
