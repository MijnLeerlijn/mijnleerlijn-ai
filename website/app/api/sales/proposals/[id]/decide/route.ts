import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { beslisOverVoorstel, type AangepasteWaarde, type ProposalBeslissing } from "@/lib/sales/proposals";

// Sales-assistent V1 (2026-08-14) — accept/modify/reject (en de
// "bestaande_vervolgdatum"-variant: Maak Sales-actie/Andere datum/Negeer
// gebruiken dezelfde 3 onderliggende beslissingen). Bewust een eigen route
// i.p.v. Payload's REST-PATCH op sales-proposals (zie de collectie-config):
// een beslissing heeft altijd nevenerffecten (actie aanmaken, write-back,
// logboek) die hier gecontroleerd, getest en geauditeerd worden.
const GELDIGE_BESLISSINGEN: ProposalBeslissing[] = ["accepted", "modified", "rejected"];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposalId = Number(id);
  if (!Number.isInteger(proposalId) || proposalId <= 0) {
    return NextResponse.json({ error: "Ongeldig voorstel-ID." }, { status: 400 });
  }

  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen dit." }, { status: 403 });
  }

  try {
    const bestaat = await payload.findByID({ collection: "sales-proposals", id: proposalId, overrideAccess: true, depth: 0 }).catch(() => null);
    if (!bestaat) {
      return NextResponse.json({ error: "Voorstel niet gevonden." }, { status: 404 });
    }

    const body = (await request.json()) as { beslissing?: string; aangepasteWaarde?: AangepasteWaarde };
    if (!body.beslissing || !GELDIGE_BESLISSINGEN.includes(body.beslissing as ProposalBeslissing)) {
      return NextResponse.json({ error: "beslissing moet accepted, modified of rejected zijn." }, { status: 400 });
    }

    const resultaat = await beslisOverVoorstel(payload, proposalId, {
      beslissing: body.beslissing as ProposalBeslissing,
      gebruikerId: sessieControle.user!.id,
      aangepasteWaarde: body.aangepasteWaarde,
    });
    return NextResponse.json(resultaat);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/proposals/decide] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
