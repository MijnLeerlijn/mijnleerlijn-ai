import { cookies } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";
import { NextResponse } from "next/server";
import { PAYLOAD_SESSION_COOKIE_NAME, verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { NAV_GROUPS, navItemPermissionId } from "@/lib/admin-nav/nav-groups";
import { heeftAdminPermissie } from "@/payload/access/menu-permissions";

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
    ? NAV_GROUPS.flatMap((groep) => [...groep.items, ...(groep.mutedItems ?? [])].map((item) => ({ groep, item })))
        .find(({ groep, item }) => heeftAdminPermissie(user, navItemPermissionId(groep.id, item)))?.item.href ?? null
    : null;

  return NextResponse.json({ authenticated: true, restricted, firstHref });
}
