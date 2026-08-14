import type { Payload } from "payload";
import { haalScholenPagina, haalRecenteUpdates, type MondaySchoolItem, type MondayUpdate } from "./monday-client";
import { SCHOLEN_BOARD_ID, SCHOLEN_KOLOM, isOpenstaandeRelatiestatus, isGemigreerdeUpdate } from "./monday-columns";
import { scrubPotentialPii } from "@/lib/support/pii-scrub";

// Sales-assistent V1 (2026-08-14) — synchroniseert board "1: Scholen (Master
// Data)" naar sales-schools + sales-log-events. Monday blijft bron van
// waarheid: dit schrijft nooit terug (zie lib/sales/writeback.ts voor de
// enige, apart bevestigde write-back-paden).
//
// `onderwijstype` wordt hier NOOIT gezet — alleen handmatig of via een
// bevestigd AI-veldvoorstel (§9 van de opdracht: "geen aannames over
// onbekende/afgeleide velden bij sync"). `contactpersoonNaam` komt
// uitsluitend uit de `text`-representatie van de board_relation-kolom zelf
// (altijd beschikbaar, board-8-schema-onafhankelijk) — nooit een e-mail/
// telefoon-veld, board 8 is niet onderzocht.
//
// Dataminimalisatie (expliciete bouweis): een gesynchroniseerde Update wordt
// NOOIT met volledige ruwe tekst in sales-log-events.payload opgeslagen —
// alleen sourceExternalId + een korte, PII-gescrubde `summary` + een
// minimale technische snapshot. AI-functies die de volle Update-tekst nodig
// hebben (school-chat/verrijking/backfill-redenering) halen die LIVE op bij
// Monday op het moment zelf (lib/sales/context.ts), nooit uit deze
// geminimaliseerde lokale kopie.
const SAMENVATTING_MAX_LENGTE = 160;

function vindKolomTekst(item: MondaySchoolItem, kolomId: string): string | null {
  const waarde = item.column_values.find((c) => c.id === kolomId)?.text;
  return waarde && waarde.trim() ? waarde.trim() : null;
}

function maakSamenvatting(tekst: string): string {
  const geschoond = scrubPotentialPii(tekst.replace(/\s+/g, " ").trim());
  if (geschoond.length <= SAMENVATTING_MAX_LENGTE) return geschoond;
  return `${geschoond.slice(0, SAMENVATTING_MAX_LENGTE)}…`;
}

export interface SyncResultaat {
  scholenVerwerkt: number;
  scholenNieuw: number;
  scholenBijgewerkt: number;
  updatesNieuw: number;
  updatesOvergeslagen: number;
  fouten: string[];
}

async function verwerkSchoolItem(payload: Payload, item: MondaySchoolItem, resultaat: SyncResultaat): Promise<void> {
  const relatiestatus = vindKolomTekst(item, SCHOLEN_KOLOM.relatiestatus);
  const data = {
    mondayItemId: item.id,
    mondayBoardId: SCHOLEN_BOARD_ID,
    schoolName: item.name,
    plaats: vindKolomTekst(item, SCHOLEN_KOLOM.location),
    contactpersoonNaam: vindKolomTekst(item, SCHOLEN_KOLOM.hoofdcontactpersoon),
    relatiestatus,
    salesfase: vindKolomTekst(item, SCHOLEN_KOLOM.salesfase),
    mondayVolgendeActieDatum: vindKolomTekst(item, SCHOLEN_KOLOM.datumVolgendeActie),
    lastMondaySyncAt: new Date().toISOString(),
    actief: isOpenstaandeRelatiestatus(relatiestatus),
  };

  const bestaand = await payload.find({
    collection: "sales-schools",
    where: { mondayItemId: { equals: item.id } },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  });

  if (bestaand.docs.length > 0) {
    await payload.update({ collection: "sales-schools", id: bestaand.docs[0]!.id, data, overrideAccess: true });
    resultaat.scholenBijgewerkt++;
  } else {
    await payload.create({ collection: "sales-schools", data, overrideAccess: true });
    resultaat.scholenNieuw++;
  }
  resultaat.scholenVerwerkt++;
}

async function synchroniseerScholen(payload: Payload, resultaat: SyncResultaat): Promise<void> {
  let cursor: string | null = null;
  const alleKolommen = Object.values(SCHOLEN_KOLOM);
  do {
    const pagina = await haalScholenPagina({ boardId: SCHOLEN_BOARD_ID, columnIds: alleKolommen, limit: 100, cursor });
    for (const item of pagina.items) {
      try {
        await verwerkSchoolItem(payload, item, resultaat);
      } catch (error) {
        resultaat.fouten.push(`School-item ${item.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    cursor = pagina.cursor;
  } while (cursor);
}

/**
 * Verwerkt één Monday Update tot (hoogstens) één sales-log-events-record.
 * Idempotent: een Update met een `id` die al als sourceExternalId bestaat
 * wordt overgeslagen — voorkomt duplicaten bij overlappende sync-vensters.
 * Geëxporteerd voor directe, ongemockte tests.
 */
export async function verwerkUpdate(
  payload: Payload,
  update: MondayUpdate,
  schoolIdPerMondayItem: Map<string, number>,
  resultaat: SyncResultaat
): Promise<{ occurredAt: string; gemigreerd: boolean; schoolId: number } | null> {
  const schoolId = schoolIdPerMondayItem.get(update.item_id);
  if (!schoolId) return null; // Update op een item dat niet (meer) als sales-school gesynchroniseerd is.

  const bestaand = await payload.find({
    collection: "sales-log-events",
    where: { sourceExternalId: { equals: update.id } },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  });
  if (bestaand.docs.length > 0) {
    resultaat.updatesOvergeslagen++;
    return null;
  }

  const gemigreerd = isGemigreerdeUpdate(update.text_body);
  await payload.create({
    collection: "sales-log-events",
    data: {
      school: schoolId,
      occurredAt: update.created_at,
      type: "contact",
      source: "monday",
      sourceExternalId: update.id,
      summary: maakSamenvatting(update.text_body),
      payload: { gemigreerd, tekstlengte: update.text_body.length },
    },
    overrideAccess: true,
  });
  resultaat.updatesNieuw++;
  return { occurredAt: update.created_at, gemigreerd, schoolId };
}

async function synchroniseerUpdates(payload: Payload, resultaat: SyncResultaat, vanaf: Date): Promise<void> {
  const scholen = await payload.find({
    collection: "sales-schools",
    where: { mondayBoardId: { equals: SCHOLEN_BOARD_ID } },
    limit: 5000,
    overrideAccess: true,
    depth: 0,
  });
  const schoolIdPerMondayItem = new Map<string, number>(
    scholen.docs.map((s) => [String((s as { mondayItemId: string }).mondayItemId), s.id as number])
  );

  const updates = await haalRecenteUpdates({ boardId: SCHOLEN_BOARD_ID, vanaf, limit: 500 });

  const laatsteEchteActiviteit = new Map<number, string>();
  for (const update of updates) {
    try {
      const verwerkt = await verwerkUpdate(payload, update, schoolIdPerMondayItem, resultaat);
      if (verwerkt && !verwerkt.gemigreerd) {
        const huidig = laatsteEchteActiviteit.get(verwerkt.schoolId);
        if (!huidig || new Date(verwerkt.occurredAt).getTime() > new Date(huidig).getTime()) {
          laatsteEchteActiviteit.set(verwerkt.schoolId, verwerkt.occurredAt);
        }
      }
    } catch (error) {
      resultaat.fouten.push(`Update ${update.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const [schoolId, occurredAt] of laatsteEchteActiviteit) {
    const school = scholen.docs.find((s) => s.id === schoolId) as { lastMondayActivityAt?: string | null } | undefined;
    const bestaandeWaarde = school?.lastMondayActivityAt ? new Date(school.lastMondayActivityAt).getTime() : 0;
    if (new Date(occurredAt).getTime() > bestaandeWaarde) {
      await payload.update({ collection: "sales-schools", id: schoolId, data: { lastMondayActivityAt: occurredAt }, overrideAccess: true });
    }
  }
}

/**
 * Volledige sync-run: alle schoolitems (upsert) + recente Updates
 * (idempotent, geminimaliseerd opgeslagen). `updatesLookbackDagen` is een
 * vast venster (geen bewaarde "laatste sync"-cursor in V1) — royaal genoeg
 * om overlap te garanderen, duplicaten worden toch al gededupliceerd op
 * sourceExternalId.
 */
export async function synchroniseerScholenBoard(payload: Payload, updatesLookbackDagen = 365): Promise<SyncResultaat> {
  const resultaat: SyncResultaat = { scholenVerwerkt: 0, scholenNieuw: 0, scholenBijgewerkt: 0, updatesNieuw: 0, updatesOvergeslagen: 0, fouten: [] };
  await synchroniseerScholen(payload, resultaat);
  const vanaf = new Date(Date.now() - updatesLookbackDagen * 24 * 60 * 60 * 1000);
  await synchroniseerUpdates(payload, resultaat, vanaf);
  return resultaat;
}
