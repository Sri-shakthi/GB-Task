export const SESSION_COOKIE="gb_owner_session";
const encoder=new TextEncoder();
const b64=(bytes:Uint8Array)=>{let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")};
const fromB64=(value:string)=>{const normalized=value.replace(/-/g,"+").replace(/_/g,"/");const binary=atob(normalized+"=".repeat((4-normalized.length%4)%4));return Uint8Array.from(binary,c=>c.charCodeAt(0))};
async function key(secret:string){return crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"])}
export type OwnerSession={email:string;ownerId:string;restaurantId:string;sid:string;version:number;exp:number};
export async function signSession(payload:OwnerSession,secret:string){const body=b64(encoder.encode(JSON.stringify(payload)));const signature=new Uint8Array(await crypto.subtle.sign("HMAC",await key(secret),encoder.encode(body)));return `${body}.${b64(signature)}`}
export async function verifySession(token:string|undefined,secret:string|undefined){try{if(!token||!secret||secret.length<32)return null;const [body,signature,...rest]=token.split(".");if(!body||!signature||rest.length)return null;const valid=await crypto.subtle.verify("HMAC",await key(secret),fromB64(signature),encoder.encode(body));if(!valid)return null;const payload=JSON.parse(new TextDecoder().decode(fromB64(body))) as OwnerSession;if(!payload.email||!payload.restaurantId||payload.exp<=Date.now())return null;return payload}catch{return null}}
