import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isEditor } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";

// Sales UX V2 (2026-08-14) — minimale Mail↔School-koppeling in het
// Sales-logboek (expliciete opdrachtseis). Wordt aangeroepen vanuit
// CreatorView.tsx se MailFlow, uitsluitend de EERSTE keer dat een nieuw
// mailconcept met schoolcontext wordt opgeslagen (niet bij elke latere
// bewerking) — zie het "isNieuw"-pad in slaMailOp().
//
// Legt bewust GEEN mailtekst vast — alleen een korte, statische
// samenvatting ("Mailconcept gemaakt · <onderwerp>") + een relatie naar het
// bestaande mail-drafts-record (sales-log-events.relatedMailDraft). De
// volledige inhoud blijft uitsluitend in mail-drafts staan — geen
// duplicatie van persoonsgegevens/mailtekst.
const MAX_ONDERWERP_LENGTE = 120;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const schoolId = Number(id);
  if (!Number.isInteger(schoolId) || schoolId <= 0) {
    return NextResponse.json({ error: "Ongeldig school-ID." }, { status: 400 });
  }

  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isEditor(sessieControle.user)) {
    return NextResponse.json({ error: "Alleen beheerders mogen dit." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { mailDraftId?: number; onderwerp?: string };
    const mailDraftId = Number(body.mailDraftId);
    if (!Number.isInteger(mailDraftId) || mailDraftId <= 0) {
      return NextResponse.json({ error: "mailDraftId is verplicht." }, { status: 400 });
    }

    const [school, mailDraft] = await Promise.all([
      payload.findByID({ collection: "sales-schools", id: schoolId, overrideAccess: true, depth: 0 }).catch(() => null),
      payload.findByID({ collection: "mail-drafts", id: mailDraftId, overrideAccess: true, depth: 0 }).catch(() => null),
    ]);
    if (!school) return NextResponse.json({ error: "School niet gevonden." }, { status: 404 });
    if (!mailDraft) return NextResponse.json({ error: "Mailconcept niet gevonden." }, { status: 404 });

    const onderwerp = (body.onderwerp ?? "").trim().slice(0, MAX_ONDERWERP_LENGTE) || "(zonder onderwerp)";
    const logEvent = await payload.create({
      collection: "sales-log-events",
      data: {
        school: schoolId,
        occurredAt: new Date().toISOString(),
        type: "mail",
        source: "creator",
        summary: `Mailconcept gemaakt · ${onderwerp}`,
        relatedMailDraft: mailDraftId,
        actor: sessieControle.user!.id,
      },
      overrideAccess: true,
    });

    return NextResponse.json({ id: logEvent.id });
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    console.error("[api/sales/school/log-mail-draft] mislukt:", boodschap);
    return NextResponse.json({ error: boodschap }, { status: 500 });
  }
}
