import { clearOwnerSession, getOwnerSession, verifyCsrf } from "@/lib/auth";

export async function POST(request: Request) {
  const origin = request.headers.get("origin"),
    forwardedHost = request.headers.get("x-forwarded-host"),
    host = forwardedHost || request.headers.get("host");
  if (origin && host && new URL(origin).host !== host)
    return new Response("Invalid origin", { status: 403 });
  const session = await getOwnerSession(),
    data = await request.formData(),
    token = String(data.get("csrf") || "");
  if (!session || !verifyCsrf(session, token))
    return new Response("Invalid CSRF token", { status: 403 });
  await clearOwnerSession(session);
  return Response.redirect(new URL("/login", request.url), 303);
}
