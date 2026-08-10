import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin, type AuthUser } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { stuurCurriculumBeheerVerzoek } from "@/lib/curriculum-beheer/client";

// Eén catch-all proxy naar Curriculum Werkplaats' /api/beheer/** (Helpdesk-
// beheerkoppeling 2026, punt 4-8). De BROWSER praat uitsluitend met deze
// Helpdesk-route — nooit rechtstreeks met Curriculum Werkplaats — zodat het
// gedeelde ADMIN_API_SECRET nooit richting de client lekt. Admin-only via
// dezelfde sessieverificatie als app/api/knowledge/embed (rechtstreekse,
// Origin-onafhankelijke cookieverificatie — zie lib/auth/verify-session.ts
// voor waarom dit nodig is i.p.v. payload.auth()).
//
// `beheerderNaam` wordt hier, server-side, uit de ingelogde Payload-
// gebruiker afgeleid en bij elk muterend verzoek in de body meegestuurd —
// nooit door de client zelf opgegeven. Zo kan een aanroeper zich in
// Curriculum Werkplaats' auditlog (punt 8) niet als iemand anders voordoen;
// de Curriculum-kant kent geen eigen beheerder-identiteitensysteem en
// vertrouwt deze waarde omdat het verzoek al via het gedeelde secret
// geauthenticeerd is (zie ARCHITECTUUR-HELPDESK-BEHEERKOPPELING.md).

interface PayloadGebruikerMetNaam {
  id: number;
  name?: string | null;
  email?: string | null;
}

function beheerderNaamVoor(user: AuthUser): string {
  const metNaam = user as unknown as PayloadGebruikerMetNaam;
  const naam = typeof metNaam.name === "string" && metNaam.name.trim() ? metNaam.name.trim() : undefined;
  const email = typeof metNaam.email === "string" && metNaam.email ? metNaam.email : undefined;
  return naam ?? email ?? `beheerder #${metNaam.id}`;
}

async function geauthenticeerdeBeheerder(request: NextRequest): Promise<AuthUser | NextResponse> {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(
    payload,
    request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value
  );
  const user = sessieControle.user;
  if (!user || !isAdmin(user)) {
    return NextResponse.json(
      { error: "Alleen beheerders mogen Curriculum Werkplaats-omgevingen beheren." },
      { status: 403 }
    );
  }
  return user;
}

// Technische details (bv. netwerkfout, foutieve CURRICULUM_ADMIN_API_URL/
// -SECRET, non-2xx-respons van Curriculum Werkplaats) gaan uitsluitend naar
// de serverlogs — nooit als kale foutmelding of stacktrace in de JSON-
// respons, die immers rechtstreeks in de Helpdesk-admin-UI terecht kan komen.
// De client krijgt bewust alleen een generieke, niet-technische melding.
function foutRespons(error: unknown, context: string): NextResponse {
  console.error(`[curriculum-beheer proxy] ${context}:`, error);
  return NextResponse.json(
    { error: "De Curriculum Werkplaats kan op dit moment niet worden bereikt." },
    { status: 502 }
  );
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ pad: string[] }> }) {
  const beheerder = await geauthenticeerdeBeheerder(request);
  if (beheerder instanceof NextResponse) return beheerder;

  const { pad } = await params;
  const url = new URL(request.url);
  const zoek: Record<string, string> = {};
  url.searchParams.forEach((waarde, sleutel) => {
    zoek[sleutel] = waarde;
  });

  try {
    const resultaat = await stuurCurriculumBeheerVerzoek(pad.join("/"), { method: "GET", zoek });
    return NextResponse.json(resultaat.body, { status: resultaat.status });
  } catch (error) {
    return foutRespons(error, `GET ${pad.join("/")}`);
  }
}

async function handleMuterendVerzoek(request: NextRequest, pad: string[], method: "POST" | "DELETE") {
  const beheerder = await geauthenticeerdeBeheerder(request);
  if (beheerder instanceof NextResponse) return beheerder;

  let clientBody: Record<string, unknown> = {};
  try {
    const gelezen: unknown = await request.json();
    if (typeof gelezen === "object" && gelezen !== null) clientBody = gelezen as Record<string, unknown>;
  } catch {
    // Lege body toegestaan — bv. blokkeren/heropenen/archiveren sturen zelf
    // niets extra's mee.
  }

  const body = { ...clientBody, beheerderNaam: beheerderNaamVoor(beheerder) };

  try {
    const resultaat = await stuurCurriculumBeheerVerzoek(pad.join("/"), { method, body });
    return NextResponse.json(resultaat.body, { status: resultaat.status });
  } catch (error) {
    return foutRespons(error, `${method} ${pad.join("/")}`);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ pad: string[] }> }) {
  const { pad } = await params;
  return handleMuterendVerzoek(request, pad, "POST");
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ pad: string[] }> }) {
  const { pad } = await params;
  return handleMuterendVerzoek(request, pad, "DELETE");
}
