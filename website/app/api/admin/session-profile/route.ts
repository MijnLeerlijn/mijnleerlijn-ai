import { cookies } from "next/headers";
import { getPayload } from "payload";
import config from "@payload-config";
import { NextResponse } from "next/server";
import { PAYLOAD_SESSION_COOKIE_NAME, verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { getVisibleNavGroups } from "@/lib/admin-nav/nav-groups";

export async function GET() {
  const payload = await getPayload({ config });
  const cookieStore = await cookies();
  const sessie = await verifyAdminSessionCookie(payload, cookieStore.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);

  if (!sessie.user) {
    return NextResponse.json({ authenticated: false, restricted: false, firstHref: null }, { status: 401 });
  }

  const user = sessie.user as typeof sessie.user & { permissionMode?: "full" | "restricted" | null };
  const restricted = user.permissionMode === "restricted";
  const firstHref = restricted
    ? getVisibleNavGroups(undefined, user)
        .flatMap((groep) => [...groep.items, ...groep.mutedItems])
        .at(0)?.href ?? null
    : null;

  return NextResponse.json({ authenticated: true, restricted, firstHref });
}
