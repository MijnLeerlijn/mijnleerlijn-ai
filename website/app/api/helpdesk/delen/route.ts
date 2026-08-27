import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { maakDeelLink } from "@/lib/helpdesk/delen";
import { maakRateLimiter } from "@/lib/contact/validate";

// Chat delen via URL (2026-08-24) — publiek, net als app/api/helpdesk/ask/
// route.ts: geen login (de Helpdesk-chat zelf heeft er geen, zie
// lib/assistant/process-public-question.ts). De toegangsgrens zit in
// maakDeelLink() zelf (uitsluitend source: "helpdesk"-conversaties) — zie de
// toelichting daar. Zelfde rate limiter/IP-herkenning als ask/feedback,
// tegen misbruik (onnodige databaserijen aanmaken).
const rateLimiter = maakRateLimiter(10 * 60 * 1000, 20);

function klantIp(request: NextRequest): string {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "onbekend"
  );
}

export async function POST(request: NextRequest) {
  const ip = klantIp(request);
  if (!rateLimiter.magVerder(ip)) {
    return NextResponse.json({ error: "Te veel pogingen. Probeer het straks opnieuw." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }
  const { conversationIds, parentToken } = (body ?? {}) as { conversationIds?: unknown; parentToken?: unknown };

  if (!Array.isArray(conversationIds) || conversationIds.some((id) => typeof id !== "number")) {
    return NextResponse.json({ error: "conversationIds moet een lijst getallen zijn." }, { status: 400 });
  }
  // Gesprek delen — vervolgen (2026-09-01): optioneel — de token van het
  // gesprek waaronder deze berichten net verder gepraat zijn (zie
  // lib/helpdesk/delen.ts se maakDeelLink-toelichting).
  if (parentToken !== undefined && (typeof parentToken !== "string" || !parentToken.trim())) {
    return NextResponse.json({ error: "parentToken is ongeldig." }, { status: 400 });
  }

  try {
    const payload = await getPayload({ config });
    const uitkomst = await maakDeelLink(payload, {
      conversationIds: conversationIds as number[],
      parentToken: parentToken ? (parentToken as string).trim() : undefined,
    });

    switch (uitkomst.soort) {
      case "ok":
        return NextResponse.json({ token: uitkomst.token });
      case "leeg":
        return NextResponse.json({ error: "Er is nog niets om te delen." }, { status: 400 });
      case "te_veel_berichten":
        return NextResponse.json({ error: "Dit gesprek is te lang om in één keer te delen." }, { status: 400 });
      case "geen_geldige_conversaties":
        return NextResponse.json({ error: "Dit gesprek kan niet gedeeld worden." }, { status: 400 });
      case "ongeldige_bron":
        return NextResponse.json({ error: "Het oorspronkelijke gedeelde gesprek is niet meer beschikbaar." }, { status: 400 });
    }
  } catch (error) {
    console.error("[api/helpdesk/delen] Aanmaken mislukt:", error);
    return NextResponse.json({ error: "Delen is nu niet mogelijk. Probeer het later opnieuw." }, { status: 500 });
  }
}
