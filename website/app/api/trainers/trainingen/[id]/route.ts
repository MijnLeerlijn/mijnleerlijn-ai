import { NextResponse, type NextRequest } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { verifyTrainerSessionCookie, TRAINER_SESSION_COOKIE_NAME } from "@/lib/trainers/auth";
import { werkTrainingBij, type TrainingWijzigingsVerzoek } from "@/lib/trainers/writeback";
import type { TrainingRecord } from "@/lib/trainers/monday-columns";
import type { TrainingStatus } from "@/lib/trainers/monday-links";
import { maakRateLimiter } from "@/lib/contact/validate";

// Traineromgeving V1, Ronde 2 (2026-08-19) — eerste trainer-facing API-route
// in dit project (app/api/trainers/** bestond nog niet). Sessieverificatie
// via de Route Handler-vorm die lib/trainers/session.ts se eigen toelichting
// al voorschrijft (request.cookies.get(...), niet next/headers se cookies()
// — dat is uitsluitend voor Server Components). Dun: alle eigendoms-
// herverificatie/conflictdetectie/dual-write-orchestratie zit in
// lib/trainers/writeback.ts, deze route parseert/valideert alleen de
// binnenkomende vorm en vertaalt de uitkomst naar een HTTP-status.
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;
const GELDIGE_STATUSSEN: readonly TrainingStatus[] = ["open", "gepland", "gedaan", "geannuleerd"];
const GELDIGE_RECORDS: readonly TrainingRecord[] = ["trainerboard", "centraal"];

const beperkAanvragen = maakRateLimiter(60_000, 20);

interface RequestBody {
  datum?: { nieuweWaarde: string | null; verwachteHuidigeWaarde: string | null };
  status?: { nieuweWaarde: string; verwachteHuidigeRuweTekst: string | null };
  alleenRecord?: string;
}

function valideerBody(body: RequestBody): TrainingWijzigingsVerzoek | null {
  if (!body.datum && !body.status) return null; // minstens één veld vereist

  const verzoek: TrainingWijzigingsVerzoek = {};

  if (body.datum) {
    const { nieuweWaarde, verwachteHuidigeWaarde } = body.datum;
    if (nieuweWaarde !== null && (typeof nieuweWaarde !== "string" || !ISO_DATUM.test(nieuweWaarde))) return null;
    if (verwachteHuidigeWaarde !== null && typeof verwachteHuidigeWaarde !== "string") return null;
    verzoek.datum = { nieuweWaarde, verwachteHuidigeWaarde };
  }

  if (body.status) {
    const { nieuweWaarde, verwachteHuidigeRuweTekst } = body.status;
    if (typeof nieuweWaarde !== "string" || !GELDIGE_STATUSSEN.includes(nieuweWaarde as TrainingStatus)) return null;
    if (verwachteHuidigeRuweTekst !== null && typeof verwachteHuidigeRuweTekst !== "string") return null;
    verzoek.status = { nieuweWaarde: nieuweWaarde as TrainingStatus, verwachteHuidigeRuweTekst };
  }

  if (body.alleenRecord !== undefined) {
    if (typeof body.alleenRecord !== "string" || !GELDIGE_RECORDS.includes(body.alleenRecord as TrainingRecord)) return null;
    verzoek.alleenRecord = body.alleenRecord as TrainingRecord;
  }

  return verzoek;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await getPayload({ config });

  const sessieControle = await verifyTrainerSessionCookie(payload, request.cookies.get(TRAINER_SESSION_COOKIE_NAME)?.value);
  if (!sessieControle.trainer) {
    // TIJDELIJKE PRODUCTIEDIAGNOSE (Ronde 2, vervolg — te verwijderen zodra
    // de "Niet ingelogd"-meldingen bij trainers verklaard zijn). Logt
    // uitsluitend de afwijzingsreden en niet-geheime requestcontext — NOOIT
    // de cookie-waarde/JWT, wachtwoorden of andere secrets. De client blijft
    // dezelfde generieke 401 zien; alleen dit serverlog is specifieker.
    // Vindbaar in Vercel door te zoeken op "[trainer-sessie-diagnose]".
    console.warn("[trainer-sessie-diagnose] sessie geweigerd", {
      reden: sessieControle.reden,
      cookieAanwezig: sessieControle.cookieAanwezig,
      trainingId: id,
      host: request.headers.get("host"),
      origin: request.headers.get("origin"),
      tijdstip: new Date().toISOString(),
    });
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }
  const trainer = sessieControle.trainer;

  if (!beperkAanvragen.magVerder(String(trainer.id))) {
    return NextResponse.json({ error: "Te veel aanvragen — probeer het over een minuut opnieuw." }, { status: 429 });
  }

  let ruweBody: RequestBody;
  try {
    ruweBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  const verzoek = valideerBody(ruweBody);
  if (!verzoek) {
    return NextResponse.json({ error: "Ongeldige aanvraag — geef minstens datum of status op, in geldige vorm." }, { status: 400 });
  }

  try {
    const uitkomst = await werkTrainingBij(payload, trainer, id, verzoek);

    if (uitkomst.soort === "niet_gevonden") {
      // 404, nooit 403 — zelfde privacy-patroon als haalSchoolDetail: een
      // trainer mag nooit kunnen afleiden of een training-ID van een andere
      // trainer bestaat.
      return NextResponse.json({ error: "Training niet gevonden." }, { status: 404 });
    }
    if (uitkomst.soort === "niet_bewerkbaar") {
      return NextResponse.json({ error: uitkomst.boodschap }, { status: 422 });
    }
    return NextResponse.json(uitkomst.resultaat);
  } catch (error) {
    console.error("[api/trainers/trainingen/[id]] mislukt:", error);
    return NextResponse.json({ error: "Bijwerken mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
