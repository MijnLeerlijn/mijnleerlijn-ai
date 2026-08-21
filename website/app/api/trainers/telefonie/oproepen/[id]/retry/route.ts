import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { verwerkTelefonieHandmatigeRetry } from "@/lib/trainers/telefonie/gesprek";
import { telnyxProvider } from "@/lib/trainers/telefonie/telnyx-provider";

// Admin-getriggerde "probeer nu opnieuw"-knop (2026-08-25) op het
// telefonie-oproep-detailscherm in Payload Admin — zie
// payload/components/RetryTelefonieButton.tsx (het type:"ui"-veld op
// payload/collections/TrainerTelefonieOproepen.ts) en
// lib/trainers/telefonie/gesprek.ts se verwerkTelefonieHandmatigeRetry voor
// de volledige toelichting over de bewuste beperking tot uitsluitend
// status='transcriptie_mislukt_herstelbaar'.
//
// Admin-sessie-authenticatie via verifyAdminSessionCookie i.p.v.
// payload.auth() — zelfde, al bewezen patroon en reden als
// app/api/gmail/sync/route.ts (payload.auth() se cookie-extractie verwerpt
// een overigens geldige sessiecookie stilzwijgend zodra de Origin-header
// niet exact overeenkomt met NEXT_PUBLIC_SERVER_URL, wat een fetch()-POST
// vanuit een adminknop altijd meestuurt).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config });

  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isAdmin(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen een retry starten." }, { status: 403 });
  }

  const { id } = await params;
  const oproepId = Number.parseInt(id, 10);
  if (!Number.isFinite(oproepId)) {
    return NextResponse.json({ error: "Ongeldig oproep-ID." }, { status: 400 });
  }

  try {
    const uitkomst = await verwerkTelefonieHandmatigeRetry(payload, telnyxProvider(), oproepId);
    return NextResponse.json({ uitkomst });
  } catch (error) {
    console.error(`[telefonie/retry] handmatige retry mislukt (oproepId=${oproepId}):`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Retry mislukt door een onverwachte fout." }, { status: 500 });
  }
}
