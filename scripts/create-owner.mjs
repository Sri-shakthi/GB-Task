import {neon} from "@neondatabase/serverless";
import {randomBytes,randomUUID,scryptSync} from "node:crypto";
const [emailArg,nameArg,password]=process.argv.slice(2),databaseUrl=process.env.DATABASE_URL,restaurantId=process.env.RESTAURANT_ID;
if(!databaseUrl||!restaurantId){console.error("DATABASE_URL and RESTAURANT_ID are required.");process.exit(1)}
if(!emailArg||!nameArg||!password||password.length<12){console.error('Usage: npm run auth:create-owner -- "owner@example.com" "Owner Name" "long password"');process.exit(1)}
const email=emailArg.trim().toLowerCase(),salt=randomBytes(16).toString("hex"),passwordHash=`scrypt$${salt}$${scryptSync(password,salt,64).toString("hex")}`,sql=neon(databaseUrl);
await sql`insert into owner_memberships (id, restaurant_id, email, name, password_hash, role, active, session_version, mfa_enabled, password_changed_at, created_at, updated_at) values (${randomUUID()}, ${restaurantId}, ${email}, ${nameArg.trim()}, ${passwordHash}, 'owner', true, 1, false, now(), now(), now()) on conflict (email) do nothing`;
console.log(`Owner provisioned for ${email}. Existing accounts were left unchanged.`);
