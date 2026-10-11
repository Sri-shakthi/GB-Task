"use server";
import {redirect} from "next/navigation";
import {authenticateOwner,createOwnerSession} from "@/lib/auth";
export async function loginAction(formData:FormData){const email=String(formData.get("email")||"").slice(0,320),password=String(formData.get("password")||"").slice(0,256),mfa=String(formData.get("mfa")||"").slice(0,6);try{const owner=await authenticateOwner(email,password,mfa);if(!owner)redirect("/login?error=invalid");await createOwnerSession(owner);redirect("/")}catch(error){if(error instanceof Error&&error.message==="RATE_LIMITED")redirect("/login?error=limited");throw error}}
