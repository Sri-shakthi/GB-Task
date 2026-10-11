import {neon} from "@neondatabase/serverless";
import {createCipheriv,randomBytes} from "node:crypto";
const email=process.argv[2]?.trim().toLowerCase(),databaseUrl=process.env.DATABASE_URL,key=Buffer.from(process.env.MFA_ENCRYPTION_KEY||"","base64");
if(!email||!databaseUrl||key.length!==32){console.error("Provide an owner email and set DATABASE_URL plus a 32-byte base64 MFA_ENCRYPTION_KEY.");process.exit(1)}
const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",raw=randomBytes(20);let bits=[...raw].map(byte=>byte.toString(2).padStart(8,"0")).join(""),secret="";for(let i=0;i<bits.length;i+=5)secret+=alphabet[parseInt(bits.slice(i,i+5).padEnd(5,"0"),2)];
const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv),encrypted=Buffer.concat([cipher.update(secret,"utf8"),cipher.final()]),stored=`${iv.toString("hex")}.${cipher.getAuthTag().toString("hex")}.${encrypted.toString("hex")}`,sql=neon(databaseUrl);
const rows=await sql`update owner_memberships set mfa_secret_encrypted=${stored}, mfa_enabled=true, updated_at=now() where email=${email} and active=true returning email`;
if(!rows.length){console.error("No active owner found.");process.exit(1)}
console.log(`Add this TOTP URI to the owner's authenticator, then store it securely:\notpauth://totp/Ganesh%20Bhavan:${encodeURIComponent(email)}?secret=${secret}&issuer=Ganesh%20Bhavan&digits=6&period=30`);
