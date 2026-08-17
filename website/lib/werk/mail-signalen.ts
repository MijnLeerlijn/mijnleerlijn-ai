import type { Payload } from "payload";
import { haalKandidaatBerichten, bouwKandidaatQuery, type GmailKandidaatBericht } from "@/lib/google-gmail/api";
import { classificeerKandidaatBerichten, type MailClassificatie, type MailCategorie } from "./mail-classificatie";
import { matchSchoolBetrouwbaar, type SchoolOptie } from "./school-matching";

// Mijn Werk Fase 3 (2026-08-17, productiecorrectie 2026-08-18) —
// orchestreert het "welke mail vraagt aandacht"-signaal: vind kandidaten
// (Gmail, deterministisch voorfilter, zie lib/google-gmail/api.ts se
// bouwKandidaatQuery) → kruis met bestaande mail-signalen-rijen (nooit
// zinloos dubbel classificeren) → classificeer de kandidaten die dat nodig
// hebben in één batch (mail-classificatie.ts) → sla het resultaat op (ook
// "niet_relevant" — zie payload/collections/MailSignalen.ts se toelichting,
// MAAR uitsluitend bij een ECHTE AI-beoordeling, nooit bij een mislukte
// aanroep) → geef de status "gesignaleerd"-rijen + een compacte samenvatting
// terug.
//
// Anders dan lib/werk/voorbereiding.ts (100% deterministisch, dus daar mag
// detectie bij elke lezing gratis opnieuw) kost classificatie hier een
// AI-aanroep — de mail-signalen-rij wordt daarom AL bij classificatietijd
// aangemaakt (niet pas lazy bij de eerste gebruikersactie), anders zou een
// nooit-aangeklikte kaart elke dag opnieuw geclassificeerd worden.
//
// Productiecorrectie (2026-08-18): twee bevestigde robuustheidsbugs
// gefixed. (1) Een mislukte classificatie-aanroep (provider-storing,
// netwerk) sloeg voorheen ELK betrokken bericht permanent op als
// "niet_relevant" — ononderscheidbaar van een echte AI-beoordeling. Nu
// blijft zo'n kandidaat gewoon ongeclassificeerd (geen rij, of de bestaande
// rij blijft ongewijzigd) en wordt hij bij de eerstvolgende lezing/actie
// gewoon opnieuw geprobeerd. (2) category:primary als enige voorfilter is
// vervangen (zie bouwKandidaatQuery) — brede/robuustere kandidaatquery,
// los van of dit Gmail-account tabbladen gebruikt.

/** Ruimer dan de oorspronkelijke 3 dagen — een week "nog relevant om op te vangen" zonder een volledige mailboxscan te worden. */
export const MAIL_LOOKBACK_DAGEN = 7;
const MAX_KANDIDATEN = 40;

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

/** Puur: welke kandidaten hebben nog GEEN mail-signalen-rij (mogen dus geclassificeerd worden). */
export function bepaalNieuweKandidaten(kandidaten: GmailKandidaatBericht[], bestaandeIds: Set<string>): GmailKandidaatBericht[] {
  return kandidaten.filter((k) => !bestaandeIds.has(k.gmailMessageId));
}

export interface NieuwSignaalData {
  status: "gesignaleerd" | "niet_relevant";
  reden: string | null;
  categorie: MailCategorie | null;
  schoolId: number | null;
}

/** Puur: bepaalt de op te slaan status/reden/categorie/school voor één ECHT geclassificeerd bericht (nooit aangeroepen zonder een geslaagde classificatie, zie haalMailSignalen) — school-matching draait uitsluitend als actie nodig is. Ontbreekt classificatie.categorie (model liet het weg), dan valt dit terug op de meest generieke badge "antwoord_nodig" — nooit een lege badge. */
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
  /** Altijd een geldige waarde bij weergave (status is dan altijd "gesignaleerd") — rijen van vóór dit veld bestond vallen terug op "antwoord_nodig", zie haalMailSignalen. */
  categorie: MailCategorie;
  school: SchoolOptie | null;
  signaalId: number;
}

export interface HaalMailSignalenOpties {
  /**
   * "Mail opnieuw controleren" — herclassificeert ALLE kandidaten in het
   * venster die niet al-verwerkt zijn (dus ook een eerder "niet_relevant"
   * of een al "gesignaleerd" bericht), niet uitsluitend nieuwe. Bedoeld om
   * fout-negatieven te herstellen. Standaard false (het normale, goedkope
   * pad bij een gewone dashboardlezing: uitsluitend nieuwe kandidaten).
   */
  forceerHerclassificatie?: boolean;
}

export interface HaalMailSignalenResultaat {
  signalen: MailSignaalWeergave[];
  /** Totaal aantal kandidaten dat de deterministische query opleverde. */
  bekeken: number;
  /** Hiervan: nieuw als "gesignaleerd" beoordeeld (deze lezing). */
  actieNodig: number;
  /** Hiervan: nieuw als "niet_relevant" beoordeeld (deze lezing). */
  genegeerd: number;
  /** Hiervan: had al een bewuste gebruikersstatus (gedempt/taak_aangemaakt/beantwoord) — met rust gelaten. */
  algVerwerkt: number;
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
  const query = bouwKandidaatQuery(MAIL_LOOKBACK_DAGEN);
  const kandidaten = await haalKandidaatBerichten(accessToken, query, MAX_KANDIDATEN);
  if (kandidaten.length === 0) return { signalen: [], bekeken: 0, actieNodig: 0, genegeerd: 0, algVerwerkt: 0 };

  const bestaande = await payload.find({
    collection: "mail-signalen",
    where: { and: [{ eigenaar: { equals: eigenaarId } }, { gmailMessageId: { in: kandidaten.map((k) => k.gmailMessageId) } }] },
    limit: kandidaten.length,
    depth: 0,
    overrideAccess: true,
  });
  const bestaandePerId = new Map((bestaande.docs as unknown as MailSignaalRij[]).map((rij) => [rij.gmailMessageId, rij]));

  const algVerwerkt = kandidaten.filter((k) => {
    const rij = bestaandePerId.get(k.gmailMessageId);
    return rij ? AL_VERWERKT_STATUSSEN.has(rij.status) : false;
  }).length;

  // Passief pad: uitsluitend kandidaten zonder rij (nooit méér AI-kosten dan
  // nodig). Geforceerd pad ("Mail opnieuw controleren"): ook kandidaten met
  // een bestaande, niet-al-verwerkte rij (dus ook een eerder "niet_relevant"
  // of "gesignaleerd") — dat verschil IS het hele punt van die actie.
  const teClassificeren = kandidaten.filter((k) => {
    const rij = bestaandePerId.get(k.gmailMessageId);
    if (!rij) return true;
    if (!opties.forceerHerclassificatie) return false;
    return !AL_VERWERKT_STATUSSEN.has(rij.status);
  });

  const classificaties = await classificeerVeilig(teClassificeren);
  const classificatiePerId = new Map(classificaties.map((c) => [c.gmailMessageId, c]));

  let actieNodig = 0;
  let genegeerd = 0;
  for (const kandidaat of teClassificeren) {
    const classificatie = classificatiePerId.get(kandidaat.gmailMessageId);
    // Geen classificatie voor dit bericht (mislukte aanroep, of het model
    // sloeg dit item over binnen een verder geslaagde batch) — NOOIT als
    // niet_relevant opslaan. Bestaat er al een rij (herclassificatie-pad),
    // dan blijft die simpelweg ongewijzigd; bestaat er nog geen rij, dan
    // ontstaat er ook geen — dit bericht geldt de volgende keer weer als
    // "nieuw" en wordt dan opnieuw geprobeerd.
    if (!classificatie) continue;

    const data = bepaalNieuwSignaalData(kandidaat, classificatie, scholen);
    if (data.status === "gesignaleerd") actieNodig++;
    else genegeerd++;

    const velden = { status: data.status, reden: data.reden, categorie: data.categorie, geclassificeerdOp: new Date().toISOString(), school: data.schoolId };
    const bestaandeRij = bestaandePerId.get(kandidaat.gmailMessageId);
    if (bestaandeRij) {
      await payload.update({ collection: "mail-signalen", id: bestaandeRij.id, overrideAccess: true, data: velden });
      bestaandePerId.set(kandidaat.gmailMessageId, { ...bestaandeRij, ...velden });
    } else {
      const rij = await payload.create({
        collection: "mail-signalen",
        overrideAccess: true,
        data: { eigenaar: eigenaarId, gmailMessageId: kandidaat.gmailMessageId, gmailThreadId: kandidaat.gmailThreadId, ...velden },
      });
      bestaandePerId.set(kandidaat.gmailMessageId, rij as unknown as MailSignaalRij);
    }
  }

  const schoolPerId = new Map(scholen.map((s) => [s.id, s]));
  const signalen: MailSignaalWeergave[] = [];
  for (const kandidaat of kandidaten) {
    const rij = bestaandePerId.get(kandidaat.gmailMessageId);
    if (!rij || rij.status !== "gesignaleerd") continue;
    signalen.push({
      gmailMessageId: kandidaat.gmailMessageId,
      gmailThreadId: kandidaat.gmailThreadId,
      van: kandidaat.van,
      onderwerp: kandidaat.onderwerp,
      ontvangenOp: kandidaat.ontvangenOp,
      reden: rij.reden ?? "",
      categorie: rij.categorie ?? "antwoord_nodig",
      school: rij.school ? (schoolPerId.get(rij.school) ?? null) : null,
      signaalId: rij.id,
    });
  }

  return { signalen, bekeken: kandidaten.length, actieNodig, genegeerd, algVerwerkt };
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
