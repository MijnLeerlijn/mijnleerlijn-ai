import type { Payload } from "payload";
import { haalScholenPagina, haalRecenteUpdates, type MondaySchoolItem, type MondayUpdate } from "./monday-client";
import {
  SCHOLEN_BOARD_ID,
  SCHOLEN_KOLOM,
  isOpenstaandeRelatiestatus,
  isGemigreerdeUpdate,
  probeerGemigreerdeDatumTeExtraheren,
  LOGBOEK_SAMENVATTING_MAX_LENGTE,
} from "./monday-columns";
import { scrubPotentialPii } from "@/lib/support/pii-scrub";
import { beoordeelSchool } from "./backfill";
import { genereerEnCacheSchoolSamenvatting } from "./school-summary";
import { vindVariantVoorTypeSchool, haalVariantenVoorTypeSchoolMapping, type VariantVoorTypeSchoolMapping } from "./education-type-sync";
import { schrijfDatumLaatsteContactTerug } from "./writeback";

// Sales-assistent V1 (2026-08-14) — synchroniseert board "1: Scholen (Master
// Data)" naar sales-schools + sales-log-events. Monday blijft bron van
// waarheid: dit schrijft nooit terug (zie lib/sales/writeback.ts voor de
// enige, apart bevestigde write-back-paden).
//
// `onderwijstype` (Sales UX-ronde 3, 2026-08-14): WEL direct gesynchroniseerd
// wanneer Monday's "Type school"-dropdown een waarde heeft die 1-op-1 matcht
// met een bestaande variants.educationType (lib/sales/education-type-sync.ts,
// case-insensitief, levende databasequery — geen hardcoded label-tabel). Een
// lege Monday-cel laat een bestaande waarde altijd met rust (het `data`-veld
// wordt dan simpelweg niet meegegeven — Payload's update() is een partial
// update, geen ontbrekend veld wist nooit een bestaande waarde). Een
// onbekend/niet-mapbaar label wordt evenmin geschreven, maar wél expliciet
// gelogd via resultaat.onderwijstypeOnbekend — nooit stilzwijgend genegeerd.
// Dit vervangt NIET lib/sales/enrichment.ts (AI-inferentie uit vrije
// contactnotities, voor het geval de Monday-dropdown zelf leeg is) — dat
// pad blijft ongewijzigd en slaat zichzelf al over zodra onderwijstype gezet
// is, dus de twee mechanismen bijten elkaar nooit.
//
// `contactpersoonNaam` komt uitsluitend uit de `text`-representatie van de
// board_relation-kolom zelf (altijd beschikbaar, board-8-schema-onafhankelijk)
// — nooit een e-mail/telefoon-veld, board 8 is niet onderzocht.
//
// Dataminimalisatie (expliciete bouweis): een gesynchroniseerde Update wordt
// NOOIT met volledige ruwe tekst in sales-log-events.payload opgeslagen —
// alleen sourceExternalId + een korte, PII-gescrubde `summary` + een
// minimale technische snapshot. AI-functies die de volle Update-tekst nodig
// hebben (school-chat/verrijking/backfill-redenering) halen die LIVE op bij
// Monday op het moment zelf (lib/sales/context.ts), nooit uit deze
// geminimaliseerde lokale kopie.
function vindKolomTekst(item: MondaySchoolItem, kolomId: string): string | null {
  const waarde = item.column_values.find((c) => c.id === kolomId)?.text;
  return waarde && waarde.trim() ? waarde.trim() : null;
}

function maakSamenvatting(tekst: string): string {
  const geschoond = scrubPotentialPii(tekst.replace(/\s+/g, " ").trim());
  if (geschoond.length <= LOGBOEK_SAMENVATTING_MAX_LENGTE) return geschoond;
  return `${geschoond.slice(0, LOGBOEK_SAMENVATTING_MAX_LENGTE)}…`;
}

/**
 * Sales-logica productiecorrectie 2026-08-16 (punt 1/3) — vergelijkt
 * uitsluitend de 4 CRM-kernvelden (Relatiestatus/Salesfase/Datum volgende
 * actie/Type school) tussen de al lokaal bekende waarde en wat deze
 * sync-run net uit Monday las. `onderwijstype` staat alleen in `nieuw`
 * wanneer Monday's dropdown deze run matchte (zie verwerkSchoolItem) — een
 * afwezige sleutel betekent "deze run zegt hier niets over", geen wijziging.
 */
function isKernveldGewijzigd(
  oud: { relatiestatus?: string | null; salesfase?: string | null; mondayVolgendeActieDatum?: string | null; onderwijstype?: number | null },
  nieuw: { relatiestatus: string | null; salesfase: string | null; mondayVolgendeActieDatum: string | null; onderwijstype?: number }
): boolean {
  if ((oud.relatiestatus ?? null) !== nieuw.relatiestatus) return true;
  if ((oud.salesfase ?? null) !== nieuw.salesfase) return true;
  if ((oud.mondayVolgendeActieDatum ?? null) !== nieuw.mondayVolgendeActieDatum) return true;
  if ("onderwijstype" in nieuw && (oud.onderwijstype ?? null) !== nieuw.onderwijstype) return true;
  return false;
}

export interface SyncResultaat {
  scholenVerwerkt: number;
  scholenNieuw: number;
  scholenBijgewerkt: number;
  /**
   * Sales-logica productiecorrectie 2026-08-16 (punt 1/3) — scholen waarvan
   * minstens één CRM-kernveld (Relatiestatus/Salesfase/Type school/Datum
   * volgende actie) deze run een ANDERE waarde kreeg dan wat er lokaal al
   * stond. Bewust een striktere, betekenisvollere teller dan updatesNieuw
   * (een nieuwe Monday-comment zegt niets over of een CRM-kernveld ook echt
   * veranderde) — dit is de "N wijzigingen" op de sync-statusweergave.
   */
  scholenGewijzigd: number;
  updatesNieuw: number;
  updatesOvergeslagen: number;
  /**
   * Sales UX V2: scholen met nieuwe, betrouwbare activiteit die na
   * herevaluatie een (nieuw of — bij een school met al een pending
   * voorstel — ongewijzigd bestaand) AI-voorstel klaar hebben staan. Geen
   * scherp "N gloednieuwe voorstellen"-getal (beoordeelSchool's eigen
   * idempotentie bepaalt per school of er iets nieuws ontstaat), wél een
   * betrouwbare bovengrens/indicatie voor het sync-rapport.
   */
  nieuweVoorstellenViaSync: number;
  /** Sales UX V2: scholen waarvoor de gecachte "Waar staan we?"-samenvatting is vernieuwd. */
  samenvattingenVernieuwd: number;
  /**
   * Sales UX-ronde 3 — Monday "Type school"-labels die deze sync-run
   * tegenkwamen maar niet matchten met een bestaande variants.educationType
   * (zie lib/sales/education-type-sync.ts). Formaat: "Schoolnaam (label)" —
   * zichtbaar in het sync-rapport i.p.v. stilzwijgend genegeerd.
   */
  onderwijstypeOnbekend: string[];
  fouten: string[];
}

/** Geëxporteerd voor directe, ongemockte tests van de onderwijstype-sync-regressiescenario's (zelfde precedent als verwerkUpdate hieronder). */
export async function verwerkSchoolItem(payload: Payload, item: MondaySchoolItem, resultaat: SyncResultaat, varianten: VariantVoorTypeSchoolMapping[]): Promise<void> {
  const relatiestatus = vindKolomTekst(item, SCHOLEN_KOLOM.relatiestatus);
  const basisData = {
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

  const typeSchoolUitkomst = vindVariantVoorTypeSchool(vindKolomTekst(item, SCHOLEN_KOLOM.typeSchool), varianten);
  if (typeSchoolUitkomst.status === "onbekend") {
    resultaat.onderwijstypeOnbekend.push(`${item.name} (${typeSchoolUitkomst.mondayLabel})`);
  }
  // status "leeg" of "onbekend": onderwijstype blijft bewust ongezet — een
  // bestaande waarde mag nooit stil overschreven worden door een lege/
  // niet-mapbare Monday-cel.
  const data = typeSchoolUitkomst.status === "gematcht" ? { ...basisData, onderwijstype: typeSchoolUitkomst.variantId } : basisData;

  const bestaand = await payload.find({
    collection: "sales-schools",
    where: { mondayItemId: { equals: item.id } },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  });

  if (bestaand.docs.length > 0) {
    const oud = bestaand.docs[0] as unknown as { relatiestatus?: string | null; salesfase?: string | null; mondayVolgendeActieDatum?: string | null; onderwijstype?: number | null };
    if (isKernveldGewijzigd(oud, data)) {
      resultaat.scholenGewijzigd++;
    }
    await payload.update({ collection: "sales-schools", id: bestaand.docs[0]!.id, data, overrideAccess: true });
    resultaat.scholenBijgewerkt++;
  } else {
    await payload.create({ collection: "sales-schools", data, overrideAccess: true });
    resultaat.scholenNieuw++;
  }
  resultaat.scholenVerwerkt++;
}

async function synchroniseerScholen(payload: Payload, resultaat: SyncResultaat): Promise<void> {
  // Eén keer per sync-run opgehaald (niet per school) — zie education-type-sync.ts.
  const varianten = await haalVariantenVoorTypeSchoolMapping(payload);
  let cursor: string | null = null;
  const alleKolommen = Object.values(SCHOLEN_KOLOM);
  do {
    const pagina = await haalScholenPagina({ boardId: SCHOLEN_BOARD_ID, columnIds: alleKolommen, limit: 100, cursor });
    for (const item of pagina.items) {
      try {
        await verwerkSchoolItem(payload, item, resultaat, varianten);
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
  // Sales UX V2 (2026-08-14) — root cause "verkeerde datum in het logboek":
  // voor een gemigreerde Update is update.created_at de MIGRATIEdatum, niet
  // de echte historische contactdatum (die staat als platte tekst vooraan in
  // text_body). Alleen bij een betrouwbaar herkend patroon corrigeren (zie
  // monday-columns.ts) — bij twijfel/geen match blijft het bestaande gedrag
  // (migratiedatum) ongewijzigd. Verandert NIETS aan `gemigreerd` zelf: ook
  // met een correct herkende datum telt dit nooit als actuele activiteit
  // (zie hieronder, `laatsteEchteActiviteit` blijft uitsluitend niet-
  // gemigreerde Updates volgen).
  const herkendeDatum = gemigreerd ? probeerGemigreerdeDatumTeExtraheren(update.text_body) : null;
  const occurredAt = gemigreerd ? (herkendeDatum ?? update.created_at) : update.created_at;
  // datumOnzeker: alleen bij een gemigreerde Update zonder herkend patroon —
  // occurredAt valt dan terug op de migratiedatum, niet de echte
  // contactdatum. De UI (SalesSchooldetailView) toont dit expliciet i.p.v.
  // een datum te suggereren die er niet betrouwbaar is.
  const datumOnzeker = gemigreerd && !herkendeDatum;
  await payload.create({
    collection: "sales-log-events",
    data: {
      school: schoolId,
      occurredAt,
      type: "contact",
      source: "monday",
      sourceExternalId: update.id,
      summary: maakSamenvatting(update.text_body),
      // Sales UX-ronde 3 (2026-08-14) — "auteur" hier in het bestaande
      // payload-JSON-veld (GEEN nieuwe kolom/migratie): een naam is geen
      // volledige ruwe CRM-tekst en past dus binnen de dataminimalisatie-eis
      // (zie SalesLogEvents.ts). tekstlengte bestond al en is de trigger voor
      // "Lees volledig" in de UI (SalesSchooldetailView.tsx) — de volledige
      // tekst zelf wordt hier NOOIT opgeslagen, alleen on-demand live
      // opgehaald (zie monday-client.ts se haalUpdatesOpIds + de nieuwe
      // full-text-route).
      payload: { gemigreerd, datumOnzeker, tekstlengte: update.text_body.length, auteur: update.creator?.name ?? null },
    },
    overrideAccess: true,
  });
  resultaat.updatesNieuw++;
  return { occurredAt, gemigreerd, schoolId };
}

/** Geëxporteerd voor directe, ongemockte tests (zelfde precedent als verwerkUpdate/verwerkSchoolItem hierboven) — vermijdt de school-paginatie van synchroniseerScholen te moeten mocken om de write-back-wiring hieronder te testen. */
export async function synchroniseerUpdates(payload: Payload, resultaat: SyncResultaat, vanaf: Date): Promise<void> {
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
    const school = scholen.docs.find((s) => s.id === schoolId) as { mondayItemId: string; lastMondayActivityAt?: string | null } | undefined;
    const bestaandeWaarde = school?.lastMondayActivityAt ? new Date(school.lastMondayActivityAt).getTime() : 0;
    if (new Date(occurredAt).getTime() > bestaandeWaarde) {
      await payload.update({ collection: "sales-schools", id: schoolId, data: { lastMondayActivityAt: occurredAt }, overrideAccess: true });
    }

    // Relatie-analyse V1 (2026-08-15) — "Datum laatste contact" mag
    // automatisch worden bijgewerkt zodra het laatste ECHTE contact
    // betrouwbaar is vastgesteld (opdrachtseis). `laatsteEchteActiviteit`
    // bevat per-definitie uitsluitend niet-gemigreerde Updates (zie
    // synchroniseerUpdates hierboven) — precies het "betrouwbaar"-criterium.
    // schrijfDatumLaatsteContactTerug bewaakt zelf al de datumvergelijking/
    // conflictdetectie/logging — hier alleen de aanroep, geen dubbele logica.
    if (school) {
      try {
        await schrijfDatumLaatsteContactTerug(payload, schoolId, school.mondayItemId, occurredAt);
      } catch (error) {
        resultaat.fouten.push(`Write-back laatste contact school ${schoolId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  await herevalueerScholenMetNieuweActiviteit(payload, scholen.docs, laatsteEchteActiviteit, resultaat);
}

/**
 * Sales UX V2 (2026-08-14) — proactieve AI-herevaluatie (opdrachtseis: geen
 * per-school AI-knop nodig, wél altijd na relevante nieuwe sync-activiteit).
 * Draait UITSLUITEND voor scholen die deze sync-run echt nieuwe (niet-
 * gemigreerde) activiteit kregen — nooit voor alle scholen, nooit bij een
 * paginaweergave. Alleen voor actieve scholen (Lead/Prospect/Wacht op
 * handtekening) — Klant/Gestopt/Inactief krijgen hier geen automatische
 * AI-beoordeling.
 *
 * Hergebruikt beoordeelSchool() (lib/sales/backfill.ts) ongewijzigd: die
 * functie bewaakt zelf al "maximaal één pending voorstel per situatie"
 * (skipt als er al een open actie of pending volgende_actie/
 * bestaande_vervolgdatum-voorstel bestaat) en maakt nooit een geaccepteerde
 * actie aan — dezelfde garanties als bij handmatige backfill, hier alleen
 * per-school en event-gedreven i.p.v. in bulk.
 */
export async function herevalueerScholenMetNieuweActiviteit(
  payload: Payload,
  scholenDocs: unknown[],
  laatsteEchteActiviteit: Map<number, string>,
  resultaat: SyncResultaat
): Promise<void> {
  type SchoolVoorHerevaluatie = {
    id: number;
    schoolName: string;
    mondayItemId: string;
    mondayVolgendeActieDatum?: string | null;
    actief?: boolean;
    relatiestatus?: string | null;
    salesfase?: string | null;
    onderwijstype?: number | { id: number } | null;
  };
  const scholen = scholenDocs as SchoolVoorHerevaluatie[];

  for (const schoolId of laatsteEchteActiviteit.keys()) {
    const school = scholen.find((s) => s.id === schoolId);
    if (!school || !school.actief) continue; // Klant/Gestopt/Inactief: geen automatische AI-beoordeling.

    try {
      const uitkomst = await beoordeelSchool(payload, school);
      if (uitkomst.uitkomst === "ai_voorstel_klaar" && uitkomst.proposalId) {
        resultaat.nieuweVoorstellenViaSync++;
      }
    } catch (error) {
      resultaat.fouten.push(`AI-herevaluatie school ${schoolId} (${school.schoolName}): ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      await genereerEnCacheSchoolSamenvatting(payload, schoolId);
      resultaat.samenvattingenVernieuwd++;
    } catch (error) {
      resultaat.fouten.push(`Samenvatting vernieuwen school ${schoolId} (${school.schoolName}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Sales-logica productiecorrectie 2026-08-16 (punt 1) — schrijft de
 * sync-uitkomst weg op het sales-instellingen-global, zodat "Laatste sync"
 * zichtbaar is ONGEACHT wie/wat de sync triggerde (cron of een handmatige
 * knop, op elk scherm) — geen client-only React-state die verdwijnt zodra de
 * pagina ververst. Faalt deze opslag zelf, dan telt dat als een fout in het
 * sync-rapport, maar breekt de sync-run niet: de daadwerkelijke sync is dan
 * al gelukt, alleen het bijschrift niet. Geëxporteerd voor directe,
 * ongemockte tests (zelfde precedent als verwerkUpdate/verwerkSchoolItem
 * hierboven) — vermijdt de school-/updates-paginatie van
 * synchroniseerScholenBoard te moeten mocken om dit los te testen.
 */
export async function bewaarSyncStatus(payload: Payload, resultaat: SyncResultaat): Promise<void> {
  try {
    await payload.updateGlobal({
      slug: "sales-instellingen",
      data: {
        laatsteSyncOp: new Date().toISOString(),
        laatsteSyncScholenVerwerkt: resultaat.scholenVerwerkt,
        laatsteSyncWijzigingen: resultaat.scholenGewijzigd,
        laatsteSyncFouten: resultaat.fouten.length,
      },
      overrideAccess: true,
    });
  } catch (error) {
    resultaat.fouten.push(`Sync-status opslaan mislukt: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface LaatsteSyncStatus {
  laatsteSyncOp: string | null;
  scholenVerwerkt: number | null;
  scholenGewijzigd: number | null;
  fouten: number | null;
}

/** Leest de door bewaarSyncStatus() weggeschreven laatste-sync-info — gebruikt door GET /api/sales/sync/status voor de dashboard-/Overzicht-knop. */
export async function haalLaatsteSyncStatus(payload: Payload): Promise<LaatsteSyncStatus> {
  const instellingen = (await payload.findGlobal({ slug: "sales-instellingen", overrideAccess: true, depth: 0 })) as unknown as {
    laatsteSyncOp?: string | null;
    laatsteSyncScholenVerwerkt?: number | null;
    laatsteSyncWijzigingen?: number | null;
    laatsteSyncFouten?: number | null;
  };
  return {
    laatsteSyncOp: instellingen.laatsteSyncOp ?? null,
    scholenVerwerkt: instellingen.laatsteSyncScholenVerwerkt ?? null,
    scholenGewijzigd: instellingen.laatsteSyncWijzigingen ?? null,
    fouten: instellingen.laatsteSyncFouten ?? null,
  };
}

/**
 * Volledige sync-run: alle schoolitems (upsert) + recente Updates
 * (idempotent, geminimaliseerd opgeslagen). `updatesLookbackDagen` is een
 * vast venster (geen bewaarde "laatste sync"-cursor in V1) — royaal genoeg
 * om overlap te garanderen, duplicaten worden toch al gededupliceerd op
 * sourceExternalId.
 */
export async function synchroniseerScholenBoard(payload: Payload, updatesLookbackDagen = 365): Promise<SyncResultaat> {
  const resultaat: SyncResultaat = {
    scholenVerwerkt: 0,
    scholenNieuw: 0,
    scholenBijgewerkt: 0,
    scholenGewijzigd: 0,
    updatesNieuw: 0,
    updatesOvergeslagen: 0,
    nieuweVoorstellenViaSync: 0,
    samenvattingenVernieuwd: 0,
    onderwijstypeOnbekend: [],
    fouten: [],
  };
  await synchroniseerScholen(payload, resultaat);
  const vanaf = new Date(Date.now() - updatesLookbackDagen * 24 * 60 * 60 * 1000);
  await synchroniseerUpdates(payload, resultaat, vanaf);
  await bewaarSyncStatus(payload, resultaat);
  return resultaat;
}
