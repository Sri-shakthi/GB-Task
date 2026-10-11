import { neonAuth } from "@/lib/neon-auth";

export default neonAuth.middleware({ loginUrl: "/login" });

export const config = { matcher: ["/", "/auth/complete"] };
