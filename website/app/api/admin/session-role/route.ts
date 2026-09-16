import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { PAYLOAD_SESSION_COOKIE_NAME, verifyAdminSessionCookie } from "@/lib/auth/verify-session";

/**
 * Kleine sessie-endpoint voor de custom Payload-navigatie.
 *
 * Payload's client-side useAuth() bevat niet in elke admin-render alle custom
 * uservelden (zoals `role`). Daarom bepalen we de adminrol hier op de server
 * vanuit de cryptografisch geverifieerde Payload-sessie. Dit endpoint geeft
 * bewust alleen een boolean terug en geen gebruikersgegevens.
 */
export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessie = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );

  return NextResponse.json(
    { isAdmin: isAdmin(sessie.user) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
