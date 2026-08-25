import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isAdmin } from "@/payload/access/roles";
import { verifyAdminSessionCookie, PAYLOAD_SESSION_COOKIE_NAME } from "@/lib/auth/verify-session";
import { verwijderTrainerAccountAlsAdmin, zetTrainerActiefStatus } from "@/lib/trainers/trainer-account";

// Admin volledig traineraccountbeheer (vervolgronde) — bewust isAdmin, NIET
// isEditor: TrainerAccounts.ts se EIGEN access-blok (adminOnly = isAdmin)
// staat alleen volledige admins toe om dit account te lezen/wijzigen/
// verwijderen via Payload's generieke editor — deze route hergebruikt
// dezelfde, strengere bestaande grens (inloggegevens, geen verslagtekst).
// Trainer-eigen sessiecookie geeft hier structureel geen toegang (alleen
// verifyAdminSessionCookie wordt hier ooit gecontroleerd).
interface PatchBody {
  actief?: boolean;
}

async function geauthenticeerdeBeheerder(request: NextRequest) {
  const payload = await getPayload({ config });
  const sessieControle = await verifyAdminSessionCookie(payload, request.cookies.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);
  if (!isAdmin(sessieControle.user)) return null;
  return payload;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trainerId = Number(id);
  if (!Number.isInteger(trainerId)) {
    return NextResponse.json({ error: "Ongeldig trainer-ID." }, { status: 400 });
  }

  const payload = await geauthenticeerdeBeheerder(request);
  if (!payload) {
    return NextResponse.json({ error: "Alleen beheerders mogen dit." }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  if (typeof body.actief !== "boolean") {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  try {
    const uitkomst = await zetTrainerActiefStatus(payload, trainerId, body.actief);
    if (uitkomst.soort === "niet_gevonden") {
      return NextResponse.json({ error: "Trainer niet gevonden." }, { status: 404 });
    }
    return NextResponse.json({ actief: uitkomst.actief });
  } catch (error) {
    console.error("[api/admin/trainers/account/[id]] actief-status wijzigen mislukt:", error);
    return NextResponse.json({ error: "Wijzigen mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trainerId = Number(id);
  if (!Number.isInteger(trainerId)) {
    return NextResponse.json({ error: "Ongeldig trainer-ID." }, { status: 400 });
  }

  const payload = await geauthenticeerdeBeheerder(request);
  if (!payload) {
    return NextResponse.json({ error: "Alleen beheerders mogen dit." }, { status: 403 });
  }

  try {
    const uitkomst = await verwijderTrainerAccountAlsAdmin(payload, trainerId);
    if (uitkomst.soort === "niet_gevonden") {
      return NextResponse.json({ error: "Trainer niet gevonden." }, { status: 404 });
    }
    if (uitkomst.soort === "heeft_relaties") {
      const omschrijving = uitkomst.relaties.map((r) => `${r.aantal} ${r.label}`).join(", ");
      return NextResponse.json(
        { error: `Dit traineraccount kan niet verwijderd worden: er bestaat nog gekoppelde historie (${omschrijving}). Zet de trainer op inactief in plaats van te verwijderen.`, relaties: uitkomst.relaties },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/admin/trainers/account/[id]] verwijderen mislukt:", error);
    return NextResponse.json({ error: "Verwijderen mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
