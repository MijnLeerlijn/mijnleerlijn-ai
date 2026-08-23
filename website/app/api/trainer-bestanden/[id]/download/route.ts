import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { genereerBestandDownloadUrlAlsAdmin } from "@/lib/trainers/bestanden";

// Traineromgeving V2, Fase 3 (2026-08-23) — admin-downloadvariant (spec §13:
// "Admin mag altijd downloaden"). Bewust een APARTE route van
// app/api/trainers/bestanden/[id]/download (trainer-sessiecookie, andere
// (sub)domein trainers.mijnleerlijn.chat) i.p.v. één route die beide
// cookietypen probeert: de admin-sessiecookie wordt nooit naar de
// trainersportal-subdomein gestuurd en andersom, dus een gedeelde route zou
// vanuit de admin-omgeving domweg nooit de juiste cookie zien. Zelfde
// scheiding als overal elders in dit project (verifyAdminSessionCookie vs.
// verifyTrainerSessionCookie, twee losse cookies/mechanismen).
//
// Productiecontrole (2026-08-23): een storagefout geeft hier, net als de
// trainer-downloadroute, een 502 met veilige server-side logging i.p.v. een
// kale 500 — zie genereerBestandDownloadUrlAlsAdmin (lib/trainers/bestanden.ts).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bestandId = Number(id);
  if (!Number.isInteger(bestandId)) {
    return NextResponse.json({ error: "Ongeldig bestand-ID." }, { status: 400 });
  }

  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders/redacteuren mogen dit." }, { status: 403 });
  }

  const uitkomst = await genereerBestandDownloadUrlAlsAdmin(payload, bestandId);
  if (uitkomst.soort === "fout") {
    return NextResponse.json({ error: "Downloaden is nu niet mogelijk. Probeer het later opnieuw." }, { status: 502 });
  }
  if (uitkomst.soort !== "ok") {
    return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  }

  return NextResponse.redirect(uitkomst.url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}
