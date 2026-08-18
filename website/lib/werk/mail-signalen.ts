import type { Payload } from "payload";
import {
  haalKandidaatBerichten,
  bouwKandidaatQuery,
  haalThreadBerichtenSamenvatting,
  laatsteThreadBericht,
  type GmailKandidaatBericht,
  type ThreadBerichtSamenvatting,
} from "@/lib/google-gmail/api";
import { classificeerKandidaatBerichten, type MailClassificatie, type MailCategorie } from "./mail-classificatie";
import { matchSchoolBetrouwbaar, type SchoolOptie } from "./school-matching";

// Mijn Werk Fase 3 (2026-08-17, productiecorrecties 2026-08-18 en 2026-08-19)
// — orchestreert het "welke mail vraagt aandacht"-signaal.
//
// Productiecorrectie 2026-08-19 — centrale regel: "een Gmail-signaal mag
// alleen actief blijven als Michel op dit moment nog aan zet is in de
// actuele thread." Vóór deze wijziging trackte dit bestand uitsluitend een
// los Gmail-BERICHT (de oorspronkelijke inkomende mail): die blijft
// permanent `in:inbox`, dus permanent kandidaat, en een herclassificatie
// beoordeelde alleen dát ene, statische bericht — er was geen enkel signaal
// in de data waaruit bleek dat er intussen al geantwoord was (rechtstreeks
// in Gmail, of via MijnLeerlijn). Root cause van "beantwoorde mail blijft
// op het dashboard staan, ook na 'Mail opnieuw controleren'".
//
// Nieuwe architectuur, twee fasen, beide bij ELKE lezing (zie
// haalMailSignalen):
//   Fase 1 — threadstatus-synchronisatie (synchroniseerThreadstatus).
//     Voor elk ACTIEF ("gesignaleerd") signaal: haal de actuele thread op
//     (lib/google-gmail/api.ts se haalThreadBerichtenSamenvatting) en bepaal
//     wie het chronologisch laatste bericht stuurde (Gmail's eigen
//     SENT-label — michelIsAanZet). Stuurde Michel zelf het laatste bericht
//     (rechtstreeks in Gmail óf via MijnLeerlijn's "Verstuur"-knop, geen
//     onderscheid, zie de opdracht: "moet exact hetzelfde gebeuren"), dan is
//     het signaal afgehandeld: status → "beantwoord" (hetzelfde statusmodel,
//     dezelfde plek als markeerBeantwoord() hieronder), NOOIT hard
//     verwijderd (audit/history blijft staan), nooit een taak/Sales-record
//     aangeraakt. Volledig deterministisch, geen AI-aanroep. Faalt de
//     Gmail-aanroep voor één specifieke thread, dan blijft dát signaal
//     ONGEWIJZIGD actief (fail-safe: nooit ten onrechte sluiten).
//   Fase 2 — kandidatenscan + classificatie (optioneel, zie
//     opties.scanNieuweKandidaten). Grotendeels de bestaande aanpak (vind
//     kandidaten → kruis met bestaande rijen → classificeer wat nodig is),
//     nu met twee toevoegingen: (a) een kandidaat waarvan de eigen rij al
//     "gesignaleerd" is wordt NOOIT meer herclassificeerd — fase 1 heeft 'm
//     al beoordeeld, opnieuw dezelfde statische inhoud aan de AI voorleggen
//     loste nooit iets op (dat WAS de bug); (b) thread-dedup: een nieuw
//     bericht in een thread die al een ander open signaal heeft (of waarin
//     de andere partij vóór Michels eerste antwoord nogmaals schreef) levert
//     nooit een tweede signaal op — de opdracht is expliciet dat een thread
//     niet permanent "open" of "gesloten" is, maar dat zolang Michel nog
//     niet heeft geantwoord het bij ÉÉN signaal blijft (zie
//     laatsteKandidaatPerThread).
//
// Punt 6 van de opdracht (voorkom dat elke dashboardlezing de hele inbox
// scant/AI aanroept): fase 1 draait ALTIJD (goedkoop, begrensd tot het
// aantal actieve signalen). Fase 2 draait altijd bij een handmatige "Mail
// opnieuw controleren", en bij een gewone dashboardlezing alleen als de
// vorige scan langer dan NIEUWE_KANDIDATEN_SCAN_MINUTEN geleden is (zie
// bepaalOfKandidatenScanNodigIs) — een begrensde periodieke sync i.p.v. een
// scan bij elke pageview.

/** Ruimer dan de oorspronkelijke 3 dagen — een week "nog relevant om op te vangen" zonder een volledige mailboxscan te worden. */
export const MAIL_LOOKBACK_DAGEN = 7;
const MAX_KANDIDATEN = 40;

/** Productiecorrectie 2026-08-19 (punt 6) — begrensde periodieke sync: een gewone dashboardlezing scant de inbox opnieuw op nieuwe kandidaten als de vorige scan langer dan dit geleden is; anders draait uitsluitend de goedkope threadstatus-sync (fase 1). Een handmatige "Mail opnieuw controleren" negeert dit altijd (zie de route). */
export const NIEUWE_KANDIDATEN_SCAN_MINUTEN = 15;

interface MailSignaalRij {
  id: number;
  gmailMessageId: string;
  gmailThreadId: string;
  status: "niet_relevant" | "gesignaleerd" | "gedempt" | "taak_aangemaakt" | "beantwoord";
  reden: string | null;
  categorie: MailCategorie | null;
  school: number | null;
}

/** Statussen die het resultaat zijn van een BEWUSTE gebruikersactie (niet van classificatie) — die overschrijft een herclassificatie nooit. */
const AL_VERWERKT_STATUSSEN = new Set<MailSignaalRij["status"]>(["gedempt", "taak_aangemaakt", "beantwoord"]);

/** Puur: welke kandidaten hebben nog GEEN mail-signalen-rij. */
export function bepaalNieuweKandidaten(kandidaten: GmailKandidaatBericht[], bestaandeIds: Set<string>): GmailKandidaatBericht[] {
  return kandidaten.filter((k) => !bestaandeIds.has(k.gmailMessageId));
}

/**
 * Puur (productiecorrectie 2026-08-19, punt 2) — per Gmail-thread blijft
 * uitsluitend het chronologisch laatste kandidaatbericht over. Voorkomt een
 * dubbel signaal wanneer de andere partij binnen dezelfde, nog geheel
 * onbehandelde thread meermaals schreef vóórdat er ooit een signaal voor
 * bestond — precies zo'n thread hoort bij ÉÉN openstaande kwestie, niet bij
 * één kaart per bericht.
 */
export function laatsteKandidaatPerThread(kandidaten: GmailKandidaatBericht[]): GmailKandidaatBericht[] {
  const laatstePerThread = new Map<string, GmailKandidaatBericht>();
  for (const kandidaat of kandidaten) {
    const huidige = laatstePerThread.get(kandidaat.gmailThreadId);
    if (!huidige || kandidaat.ontvangenOp > huidige.ontvangenOp) laatstePerThread.set(kandidaat.gmailThreadId, kandidaat);
  }
  return [...laatstePerThread.values()];
}

/**
 * Puur (productiecorrectie 2026-08-19, punt 1) — de centrale regel: is
 * Michel (de gekoppelde account) op dit moment nog aan zet in deze thread?
 * Kijkt uitsluitend naar wie het chronologisch laatste bericht stuurde —
 * geen AI, geen aanname op basis van de oorspronkelijke mail of een eerder
 * gecachete classificatie. Een lege/onbekende thread telt als "nog aan
 * zet" — fail-safe, nooit onterecht sluiten bij twijfel.
 */
export function michelIsAanZet(berichten: ThreadBerichtSamenvatting[]): boolean {
  const laatste = laatsteThreadBericht(berichten);
  return !laatste || !laatste.vanEigenAccount;
}

/** Puur (punt 6) — moet de kostbare kandidatenscan (Gmail-inboxquery + eventuele AI-classificatie) deze lezing meedraaien? Nog nooit gescand telt als "ja". */
export function bepaalOfKandidatenScanNodigIs(laatsteScanOp: string | null, nu: Date = new Date()): boolean {
  if (!laatsteScanOp) return true;
  const verstrekenMinuten = (nu.getTime() - new Date(laatsteScanOp).getTime()) / 60_000;
  return verstrekenMinuten >= NIEUWE_KANDIDATEN_SCAN_MINUTEN;
}

export interface NieuwSignaalData {
  status: "gesignaleerd" | "niet_relevant";
  reden: string | null;
  categorie: MailCategorie | null;
  schoolId: number | null;
}

/** Puur: bepaalt de op te slaan status/reden/categorie/school voor één ECHT geclassificeerd bericht — school-matching draait uitsluitend als actie nodig is. Ontbreekt classificatie.categorie, dan valt dit terug op de meest generieke badge "antwoord_nodig" — nooit een lege badge. */
export function bepaalNieuwSignaalData(kandidaat: GmailKandidaatBericht, classificatie: MailClassificatie, scholen: SchoolOptie[]): NieuwSignaalData {
  if (!classificatie.actieNodig) {
    return { status: "niet_relevant", reden: classificatie.reden, categorie: null, schoolId: null };
  }
  const match = matchSchoolBetrouwbaar(`${kandidaat.van} ${kandidaat.onderwerp} ${kandidaat.snippet}`, scholen);
  return { status: "gesignaleerd", reden: classificatie.reden, categorie: classificatie.categorie ?? "antwoord_nodig", schoolId: match.school?.id ?? null };
}

export interface MailSignaalWeergave {
  gmailMessageId: string;
  gmailThreadId: string;
  van: string;
  onderwerp: string;
  ontvangenOp: string;
  reden: string;
  categorie: MailCategorie;
  school: SchoolOptie | null;
  signaalId: number;
}

export interface HaalMailSignalenOpties {
  /**
   * "Mail opnieuw controleren" — herclassificeert eerder als "niet_relevant"
   * gecachete kandidaten (fout-negatieven herstellen). Raakt NOOIT een
   * actief ("gesignaleerd") signaal aan — dat wordt uitsluitend via de
   * threadstatus-sync (fase 1) gesloten, nooit via herclassificatie (dat was
   * precies de bug: dezelfde statische inhoud levert altijd dezelfde
   * AI-uitkomst op). Standaard false.
   */
  forceerHerclassificatie?: boolean;
  /**
   * Standaard true (achterwaarts compatibel). Op false: sla de Gmail-
   * lijstquery + AI-classificatie van nieuwe kandidaten over — uitsluitend
   * de threadstatus-sync (fase 1) draait dan. Voor het lichte, passieve
   * dashboard-pad (punt 6): zie bepaalOfKandidatenScanNodigIs.
   */
  scanNieuweKandidaten?: boolean;
}

export interface HaalMailSignalenResultaat {
  signalen: MailSignaalWeergave[];
  /** Totaal aantal kandidaten dat de deterministische query opleverde (0 als fase 2 niet meedraaide, zie scanNieuweKandidaten). */
  bekeken: number;
  /** Hiervan: nieuw als "gesignaleerd" beoordeeld (deze lezing). */
  actieNodig: number;
  /** Hiervan: nieuw als "niet_relevant" beoordeeld (deze lezing). */
  genegeerd: number;
  /** Hiervan: had al vóór deze lezing een bewuste gebruikersstatus (gedempt/taak_aangemaakt/beantwoord) — met rust gelaten. */
  algVerwerkt: number;
  /** NIEUW (2026-08-19) — actieve signalen die deze lezing via de Gmail-threadstatus (geen AI) op "beantwoord" gezet zijn omdat Michel zelf het laatste bericht in de thread stuurde. */
  automatischBeantwoord: number;
  /** NIEUW — bekeken kandidaten/signalen die niets veranderden: nog actief (de ander is nog niet gevolgd door een eigen antwoord), of een kandidaat die al bij een ander, nog open signaal in dezelfde thread hoort. */
  ongewijzigd: number;
}

/** Nooit door laten gooien naar de aanroeper — een classificatiefout mag de rest van Mijn Dag nooit blokkeren, en mag nooit als "niet_relevant" gecachet worden (zie moduletoelichting). */
async function classificeerVeilig(kandidaten: GmailKandidaatBericht[]): Promise<MailClassificatie[]> {
  if (kandidaten.length === 0) return [];
  try {
    return await classificeerKandidaatBerichten(kandidaten);
  } catch (error) {
    console.error("[mail-signalen] classificatie mislukt — kandidaten blijven ongeclassificeerd, worden bij een volgende poging opnieuw geprobeerd:", error);
    return [];
  }
}

interface WeergaveMetadata {
  van: string;
  onderwerp: string;
  ontvangenOp: string;
}

function naarWeergave(rij: MailSignaalRij, metadata: WeergaveMetadata, schoolPerId: Map<number, SchoolOptie>): MailSignaalWeergave {
  return {
    gmailMessageId: rij.gmailMessageId,
    gmailThreadId: rij.gmailThreadId,
    van: metadata.van,
    onderwerp: metadata.onderwerp,
    ontvangenOp: metadata.ontvangenOp,
    reden: rij.reden ?? "",
    categorie: rij.categorie ?? "antwoord_nodig",
    school: rij.school ? (schoolPerId.get(rij.school) ?? null) : null,
    signaalId: rij.id,
  };
}

/**
 * Fase 1 — zie moduletoelichting. Geeft, naast hoeveel signalen automatisch
 * beantwoord zijn, ook terug welke rijen NA deze sync nog actief zijn (voor
 * fase 2 se thread-dedup) en de weergavemetadata die deze aanroep al toch
 * ophaalde (voorkomt een dubbele Gmail-aanroep voor hetzelfde bericht).
 */
async function synchroniseerThreadstatus(
  payload: Payload,
  accessToken: string,
  actieveRijen: MailSignaalRij[]
): Promise<{ open: Map<number, MailSignaalRij>; metadata: Map<number, WeergaveMetadata>; automatischBeantwoord: number }> {
  const open = new Map<number, MailSignaalRij>();
  const metadata = new Map<number, WeergaveMetadata>();
  let automatischBeantwoord = 0;

  for (const rij of actieveRijen) {
    let berichten: ThreadBerichtSamenvatting[];
    try {
      berichten = await haalThreadBerichtenSamenvatting(accessToken, rij.gmailThreadId);
    } catch (error) {
      // Gmail (tijdelijk) onbereikbaar voor déze thread — signaal blijft
      // ongewijzigd actief. NOOIT ten onrechte als beantwoord markeren.
      console.error(`[mail-signalen] threadstatus-check mislukt voor signaal ${rij.id} — blijft actief:`, error);
      open.set(rij.id, rij);
      continue;
    }

    if (michelIsAanZet(berichten)) {
      open.set(rij.id, rij);
      const eigenBericht = berichten.find((b) => b.gmailMessageId === rij.gmailMessageId);
      if (eigenBericht) metadata.set(rij.id, { van: eigenBericht.van, onderwerp: eigenBericht.onderwerp, ontvangenOp: eigenBericht.ontvangenOp });
      continue;
    }

    // Michel stuurde zelf het laatste bericht (rechtstreeks in Gmail óf via
    // MijnLeerlijn — geen onderscheid) — exact hetzelfde statusmodel/dezelfde
    // plek als markeerBeantwoord() hieronder. Nooit hard verwijderd, nooit
    // een taak/Sales-record aangeraakt.
    const laatste = laatsteThreadBericht(berichten)!;
    await payload.update({
      collection: "mail-signalen",
      id: rij.id,
      overrideAccess: true,
      data: { status: "beantwoord", beantwoordOp: laatste.ontvangenOp },
    });
    automatischBeantwoord++;
  }

  return { open, metadata, automatischBeantwoord };
}

function bouwSignalenWeergave(open: Map<number, MailSignaalRij>, metadata: Map<number, WeergaveMetadata>, schoolPerId: Map<number, SchoolOptie>): MailSignaalWeergave[] {
  const signalen: MailSignaalWeergave[] = [];
  for (const rij of open.values()) {
    const meta = metadata.get(rij.id);
    // Geen geslaagde live-Gmail-aanroep deze lezing voor dit signaal (zie
    // synchroniseerThreadstatus) — er is niets te tonen (er wordt nooit
    // mailinhoud bewaard); komt terug zodra dat wel lukt. Het signaal zelf
    // blijft intussen gewoon "gesignaleerd" in de database.
    if (!meta) continue;
    signalen.push(naarWeergave(rij, meta, schoolPerId));
  }
  return signalen.sort((a, b) => (a.ontvangenOp < b.ontvangenOp ? 1 : -1));
}

/**
 * Payload-aware orchestrator — zie moduletoelichting. `scholen` wordt door
 * de aanroeper meegegeven (dezelfde al-opgehaalde actieve-scholenlijst als
 * elders in Mijn Werk, bv. lib/werk/mijn-werk-chat.ts se haalActieveScholen)
 * — geen extra query hier.
 */
export async function haalMailSignalen(
  payload: Payload,
  eigenaarId: number,
  accessToken: string,
  scholen: SchoolOptie[],
  opties: HaalMailSignalenOpties = {}
): Promise<HaalMailSignalenResultaat> {
  const scanNieuweKandidaten = opties.scanNieuweKandidaten ?? true;
  const schoolPerId = new Map(scholen.map((s) => [s.id, s]));

  // --- Fase 1: deterministische threadstatus-sync — altijd, nooit AI. ---
  const actieveResultaat = await payload.find({
    collection: "mail-signalen",
    where: { and: [{ eigenaar: { equals: eigenaarId } }, { status: { equals: "gesignaleerd" } }] },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });
  const { open, metadata, automatischBeantwoord } = await synchroniseerThreadstatus(payload, accessToken, actieveResultaat.docs as unknown as MailSignaalRij[]);

  if (!scanNieuweKandidaten) {
    return { signalen: bouwSignalenWeergave(open, metadata, schoolPerId), bekeken: 0, actieNodig: 0, genegeerd: 0, algVerwerkt: 0, automatischBeantwoord, ongewijzigd: open.size };
  }

  // --- Fase 2: kandidatenscan + classificatie. ---
  const query = bouwKandidaatQuery(MAIL_LOOKBACK_DAGEN);
  const kandidaten = await haalKandidaatBerichten(accessToken, query, MAX_KANDIDATEN);

  const bestaandeDocs =
    kandidaten.length === 0
      ? []
      : (
          await payload.find({
            collection: "mail-signalen",
            where: { and: [{ eigenaar: { equals: eigenaarId } }, { gmailMessageId: { in: kandidaten.map((k) => k.gmailMessageId) } }] },
            limit: kandidaten.length,
            depth: 0,
            overrideAccess: true,
          })
        ).docs;
  const bestaandePerId = new Map((bestaandeDocs as unknown as MailSignaalRij[]).map((rij) => [rij.gmailMessageId, rij]));

  // Threads die ná fase 1 nog een open signaal hebben — voorkomt een tweede
  // kaart/AI-aanroep wanneer de andere partij nogmaals schrijft vóórdat
  // Michel heeft geantwoord (punt 2: één thread, één signaal, zolang Michel
  // nog niet aan de beurt is geweest).
  const openeThreadIds = new Set([...open.values()].map((rij) => rij.gmailThreadId));

  let algVerwerkt = 0;
  let ongewijzigd = 0;
  const teClassificeren: GmailKandidaatBericht[] = [];

  for (const kandidaat of kandidaten) {
    const rij = bestaandePerId.get(kandidaat.gmailMessageId);
    if (!rij) continue; // hieronder afgehandeld (nieuwe kandidaten)
    if (AL_VERWERKT_STATUSSEN.has(rij.status)) {
      algVerwerkt++;
    } else if (rij.status === "gesignaleerd" || (rij.status === "niet_relevant" && !opties.forceerHerclassificatie)) {
      // "gesignaleerd": fase 1 heeft dit signaal al beoordeeld (nog actief,
      // of hierboven al gesloten) — nooit opnieuw classificeren, dat was de
      // bug. "niet_relevant" zonder forceerHerclassificatie: bestaand,
      // ongewijzigd gedrag (alleen op expliciete klik opnieuw proberen).
      ongewijzigd++;
    } else {
      teClassificeren.push(kandidaat);
    }
  }

  const zonderRij = kandidaten.filter((k) => !bestaandePerId.has(k.gmailMessageId));
  const nieuwZonderRij = laatsteKandidaatPerThread(zonderRij);
  ongewijzigd += zonderRij.length - nieuwZonderRij.length; // oudere kandidaten in dezelfde thread, verdrongen door de nieuwste (zie laatsteKandidaatPerThread)
  for (const kandidaat of nieuwZonderRij) {
    if (openeThreadIds.has(kandidaat.gmailThreadId)) {
      ongewijzigd++;
    } else {
      teClassificeren.push(kandidaat);
    }
  }

  const classificaties = await classificeerVeilig(teClassificeren);
  const classificatiePerId = new Map(classificaties.map((c) => [c.gmailMessageId, c]));

  let actieNodig = 0;
  let genegeerd = 0;
  for (const kandidaat of teClassificeren) {
    const classificatie = classificatiePerId.get(kandidaat.gmailMessageId);
    // Geen classificatie voor dit bericht (mislukte aanroep, of het model
    // sloeg dit item over binnen een verder geslaagde batch) — NOOIT als
    // niet_relevant opslaan. Bestaat er al een rij, dan blijft die simpelweg
    // ongewijzigd; bestaat er nog geen rij, dan ontstaat er ook geen — dit
    // bericht geldt de volgende keer weer als "nieuw" en wordt dan opnieuw
    // geprobeerd.
    if (!classificatie) continue;

    const data = bepaalNieuwSignaalData(kandidaat, classificatie, scholen);
    if (data.status === "gesignaleerd") actieNodig++;
    else genegeerd++;

    const velden = { status: data.status, reden: data.reden, categorie: data.categorie, geclassificeerdOp: new Date().toISOString(), school: data.schoolId };
    const bestaandeRij = bestaandePerId.get(kandidaat.gmailMessageId);
    let rij: MailSignaalRij;
    if (bestaandeRij) {
      await payload.update({ collection: "mail-signalen", id: bestaandeRij.id, overrideAccess: true, data: velden });
      rij = { ...bestaandeRij, ...velden };
    } else {
      const nieuw = await payload.create({
        collection: "mail-signalen",
        overrideAccess: true,
        data: { eigenaar: eigenaarId, gmailMessageId: kandidaat.gmailMessageId, gmailThreadId: kandidaat.gmailThreadId, ...velden },
      });
      rij = nieuw as unknown as MailSignaalRij;
    }
    if (data.status === "gesignaleerd") {
      open.set(rij.id, rij);
      metadata.set(rij.id, { van: kandidaat.van, onderwerp: kandidaat.onderwerp, ontvangenOp: kandidaat.ontvangenOp });
    }
  }

  return {
    signalen: bouwSignalenWeergave(open, metadata, schoolPerId),
    bekeken: kandidaten.length,
    actieNodig,
    genegeerd,
    algVerwerkt,
    automatischBeantwoord,
    ongewijzigd,
  };
}

/** Owner-scoped lookup — nooit een client-aangeleverd signaalId blind vertrouwen, zelfde voorzorg als overal elders in lib/werk. */
async function vindEigenSignaal(payload: Payload, eigenaarId: number, signaalId: number): Promise<MailSignaalRij | null> {
  const resultaat = await payload.find({
    collection: "mail-signalen",
    where: { and: [{ id: { equals: signaalId } }, { eigenaar: { equals: eigenaarId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return (resultaat.docs[0] as unknown as MailSignaalRij | undefined) ?? null;
}

/** "Niet relevant" (gebruiker) — dempt het signaal permanent, los van de AI-classificatie-uitkomst "niet_relevant". */
export async function dempSignaal(payload: Payload, eigenaarId: number, signaalId: number): Promise<boolean> {
  const rij = await vindEigenSignaal(payload, eigenaarId, signaalId);
  if (!rij) return false;
  await payload.update({ collection: "mail-signalen", id: rij.id, overrideAccess: true, data: { status: "gedempt" } });
  return true;
}

export interface GenegeerdeMailWeergave {
  signaalId: number;
  gmailMessageId: string;
  gmailThreadId: string;
  van: string;
  onderwerp: string;
  /** Gecachete AI-reden waarom geen actie nodig leek — nooit de mailinhoud zelf. */
  reden: string;
}

/**
 * Transparantiediagnose (2026-08-19) — "waarom zie ik deze mail niet, terwijl
 * Gmail 'm wel als ongelezen toont?": alle door de AI als "niet_relevant"
 * beoordeelde berichten, met dezelfde live-opgehaalde afzender/onderwerp als
 * bouwSignalenWeergave hierboven (nooit lokaal bewaard). Uitsluitend
 * aangeroepen na een expliciete "Bekijk genegeerde mails"-klik (niet bij elke
 * dashboardlezing) — vandaar geen eigen plek in haalMailSignalen()/geen
 * eigen throttle nodig. Per Gmail-thread hoogstens één live-aanroep, ook als
 * er meerdere genegeerde berichten in dezelfde thread zitten. Faalt de
 * live-aanroep voor een thread (Gmail tijdelijk onbereikbaar), dan ontbreekt
 * dat ene bericht in de lijst — zelfde fail-safe-omissie als
 * synchroniseerThreadstatus, nooit een crash van de hele diagnose.
 */
export async function haalGenegeerdeMails(payload: Payload, eigenaarId: number, accessToken: string): Promise<GenegeerdeMailWeergave[]> {
  const resultaat = await payload.find({
    collection: "mail-signalen",
    where: { and: [{ eigenaar: { equals: eigenaarId } }, { status: { equals: "niet_relevant" } }] },
    sort: "-geclassificeerdOp",
    limit: 100,
    depth: 0,
    overrideAccess: true,
  });

  const threadCache = new Map<string, ThreadBerichtSamenvatting[] | null>();
  const weergaven: GenegeerdeMailWeergave[] = [];
  for (const rij of resultaat.docs as unknown as MailSignaalRij[]) {
    let berichten = threadCache.get(rij.gmailThreadId);
    if (berichten === undefined) {
      berichten = await haalThreadBerichtenSamenvatting(accessToken, rij.gmailThreadId).catch(() => null);
      threadCache.set(rij.gmailThreadId, berichten);
    }
    const eigenBericht = berichten?.find((b) => b.gmailMessageId === rij.gmailMessageId);
    if (!eigenBericht) continue;
    weergaven.push({
      signaalId: rij.id,
      gmailMessageId: rij.gmailMessageId,
      gmailThreadId: rij.gmailThreadId,
      van: eigenBericht.van,
      onderwerp: eigenBericht.onderwerp,
      reden: rij.reden ?? "",
    });
  }
  return weergaven;
}

/**
 * "Toch tonen" — corrigeert een fout-negatieve AI-classificatie: promoveert
 * een "niet_relevant"-signaal terug naar "gesignaleerd" (categorie
 * "ter_beoordeling" — eerlijk over de herkomst: een menselijke correctie,
 * geen nieuwe AI-uitkomst). Werkt alleen op een signaal dat daadwerkelijk
 * "niet_relevant" is (geen no-op-succes op een willekeurige status).
 *
 * Bewaart de menselijke keuze zonder een nieuw veld/migratie: zodra de
 * status "gesignaleerd" is, slaat fase 2 van haalMailSignalen() dit signaal
 * bij een volgende scan altijd over (zie de "rij.status === 'gesignaleerd'"-
 * tak hierboven, dezelfde bescherming als elk ander actief signaal) — de
 * thread wordt dus nooit automatisch opnieuw weggefilterd, exact de
 * opdrachtseis.
 */
export async function toonSignaalToch(payload: Payload, eigenaarId: number, signaalId: number): Promise<boolean> {
  const rij = await vindEigenSignaal(payload, eigenaarId, signaalId);
  if (!rij || rij.status !== "niet_relevant") return false;
  await payload.update({
    collection: "mail-signalen",
    id: rij.id,
    overrideAccess: true,
    data: {
      status: "gesignaleerd",
      categorie: "ter_beoordeling",
      reden: `Handmatig teruggezet als 'vraagt aandacht'. Eerdere inschatting: ${rij.reden || "onbekend"}`,
      geclassificeerdOp: new Date().toISOString(),
    },
  });
  return true;
}

export interface MaakMailTaakOpties {
  titel: string;
  beschrijving?: string;
  /** YYYY-MM-DD — standaard vandaag (door de aanroeper meegegeven, zelfde timezone-veilige conventie als lib/werk/voorbereiding.ts). */
  datum: string;
}

/** "Maak taak" — volledig deterministisch (geen tweede AI-aanroep, titel/reden komen van de al-gecachete classificatie), altijd gebruiker-bevestigd vóórdat dit aangeroepen wordt (de route ontvangt de al-bevestigde titel/datum, verzint zelf niets). */
export async function maakMailTaak(payload: Payload, eigenaarId: number, signaalId: number, opties: MaakMailTaakOpties): Promise<{ taakId: number } | null> {
  const rij = await vindEigenSignaal(payload, eigenaarId, signaalId);
  if (!rij) return null;

  const taak = await payload.create({
    collection: "personal-tasks",
    overrideAccess: true,
    data: {
      titel: opties.titel,
      beschrijving: opties.beschrijving ?? null,
      datum: opties.datum,
      status: "open",
      school: rij.school,
      eigenaar: eigenaarId,
    },
  });

  await payload.update({
    collection: "mail-signalen",
    id: rij.id,
    overrideAccess: true,
    data: { status: "taak_aangemaakt", gekoppeldeTaak: taak.id },
  });

  return { taakId: taak.id as number };
}

/** Gezet na een daadwerkelijk verstuurd antwoord (zie app/api/werk/mail/versturen) — nooit de verzonden tekst zelf, uitsluitend status + tijdstip. */
export async function markeerBeantwoord(payload: Payload, eigenaarId: number, signaalId: number): Promise<boolean> {
  const rij = await vindEigenSignaal(payload, eigenaarId, signaalId);
  if (!rij) return false;
  await payload.update({
    collection: "mail-signalen",
    id: rij.id,
    overrideAccess: true,
    data: { status: "beantwoord", beantwoordOp: new Date().toISOString() },
  });
  return true;
}

export interface MailSignaalVoorAntwoord {
  gmailMessageId: string;
  gmailThreadId: string;
  schoolId: number | null;
}

/** Voor de antwoordvoorstel-/verstuur-routes: haalt uitsluitend de pointer + eventuele schoolkoppeling op (geen mailinhoud — die leest lib/werk/mail-reply.ts zelf, live, rechtstreeks bij Gmail). */
export async function haalSignaalVoorAntwoord(payload: Payload, eigenaarId: number, signaalId: number): Promise<MailSignaalVoorAntwoord | null> {
  const rij = await vindEigenSignaal(payload, eigenaarId, signaalId);
  if (!rij) return null;
  return { gmailMessageId: rij.gmailMessageId, gmailThreadId: rij.gmailThreadId, schoolId: rij.school };
}
