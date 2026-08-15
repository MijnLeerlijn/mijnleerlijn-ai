import type { Payload } from "payload";
import { leesKolomWaarde } from "./monday-client";
import { SCHOLEN_KOLOM } from "./monday-columns";
import { schrijfTypeSchoolTerug, type WriteBackResultaat } from "./writeback";

// Relatie-analyse V1.1 (2026-08-15) — "Onderwijstype zelf instellen":
// hergebruikt bewust de AL BESTAANDE variants-data (geen tweede,
// hardcoded lijst) en de AL BESTAANDE, geteste write-back-service
// (schrijfTypeSchoolTerug, lib/sales/writeback.ts) — exact hetzelfde
// read-then-write/conflictpad als het bevestigen van een AI-veldvoorstel,
// nu ook bereikbaar zonder dat er eerst een AI-voorstel hoeft te bestaan.
//
// Monday blijft bron van waarheid (zelfde principe als SalesSchools.ts):
// de lokale sales-schools.onderwijstype wordt UITSLUITEND bijgewerkt als de
// write-back daadwerkelijk is gelukt (status "geschreven") — bij conflict/
// nog-niet-geactiveerd/mislukt blijft de lokale waarde ongewijzigd, nooit
// een schijnwerkelijkheid die een volgende sync alsnog zou terugdraaien.
export interface OnderwijstypeHandmatigResultaat {
  writeback: WriteBackResultaat;
  lokaalBijgewerkt: boolean;
}

interface SchoolRecord {
  id: number;
  mondayItemId: string;
}

interface VariantRecord {
  id: number;
  educationType: string;
}

export async function stelOnderwijstypeHandmatigIn(payload: Payload, schoolId: number, variantId: number, actorId: number): Promise<OnderwijstypeHandmatigResultaat> {
  const school = (await payload.findByID({ collection: "sales-schools", id: schoolId, overrideAccess: true, depth: 0 }).catch(() => null)) as unknown as SchoolRecord | null;
  if (!school) throw new Error("School niet gevonden.");

  const variant = (await payload.findByID({ collection: "variants", id: variantId, overrideAccess: true, depth: 0 }).catch(() => null)) as unknown as VariantRecord | null;
  if (!variant) throw new Error("Onderwijstype (variant) niet gevonden.");

  const huidig = await leesKolomWaarde(school.mondayItemId, SCHOLEN_KOLOM.typeSchool);
  const writeback = await schrijfTypeSchoolTerug(payload, schoolId, school.mondayItemId, variant.educationType, huidig?.text ?? null, actorId);

  let lokaalBijgewerkt = false;
  if (writeback.status === "geschreven") {
    await payload.update({ collection: "sales-schools", id: schoolId, data: { onderwijstype: variantId }, overrideAccess: true });
    lokaalBijgewerkt = true;

    // Een eventueel nog openstaand AI-veldvoorstel voor Type school is nu achterhaald door deze handmatige keuze.
    const bestaandeVoorstellen = await payload.find({
      collection: "sales-proposals",
      where: {
        school: { equals: schoolId },
        proposalType: { equals: "veld_correctie" },
        targetColumnId: { equals: SCHOLEN_KOLOM.typeSchool },
        status: { in: ["pending", "conflict"] },
      },
      limit: 10,
      overrideAccess: true,
      depth: 0,
    });
    for (const voorstel of bestaandeVoorstellen.docs) {
      await payload.update({ collection: "sales-proposals", id: voorstel.id, data: { status: "superseded" }, overrideAccess: true });
    }
  }

  return { writeback, lokaalBijgewerkt };
}
