import { clearOwnerSession, getOwnerSession } from "@/lib/auth";

export async function POST(request: Request) {
  const origin = request.headers.get("origin"),
    forwardedHost = request.headers.get("x-forwarded-host"),
    host = forwardedHost || request.headers.get("host");
  if (origin && host && new URL(origin).host !== host)
    return new Response("Invalid origin", { status: 403 });
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite))
    return new Response("Invalid request", { status: 403 });
  const session = await getOwnerSession();
  await clearOwnerSession(session);
  return Response.redirect(new URL("/login?logged_out=1", request.url), 303);
}
