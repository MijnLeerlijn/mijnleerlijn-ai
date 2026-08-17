import type { Payload } from "payload";
import { haalKandidaatBerichten, bouwKandidaatQuery, type GmailKandidaatBericht } from "@/lib/google-gmail/api";
import { classificeerKandidaatBerichten, type MailClassificatie } from "./mail-classificatie";
import { matchSchoolBetrouwbaar, type SchoolOptie } from "./school-matching";

// Mijn Werk Fase 3 (2026-08-17) — orchestreert het "welke mail vraagt
// aandacht"-signaal: vindKandidaten (Gmail, deterministisch voorfilter) →
// kruis met bestaande mail-signalen-rijen (nooit dubbel classificeren) →
// classificeer UITSLUITEND de écht nieuwe kandidaten in één batch (zie
// mail-classificatie.ts) → sla het resultaat op (ook "niet_relevant" — zie
// payload/collections/MailSignalen.ts se toelichting) → geef alleen de
// status "gesignaleerd"-rijen terug voor weergave.
//
// Anders dan lib/werk/voorbereiding.ts (100% deterministisch, dus daar mag
// detectie bij elke lezing gratis opnieuw) kost classificatie hier een
// AI-aanroep — de mail-signalen-rij wordt daarom AL bij classificatietijd
// aangemaakt (niet pas lazy bij de eerste gebruikersactie), anders zou een
// nooit-aangeklikte kaart elke dag opnieuw geclassificeerd worden.

export const MAIL_LOOKBACK_DAGEN = 3;
const MAX_KANDIDATEN = 25;

interface MailSignaalRij {
  id: number;
  gmailMessageId: string;
  gmailThreadId: string;
  status: "niet_relevant" | "gesignaleerd" | "gedempt" | "taak_aangemaakt" | "beantwoord";
  reden: string | null;
  school: number | null;
}

/** Puur: welke kandidaten hebben nog GEEN mail-signalen-rij (mogen dus geclassificeerd worden). */
export function bepaalNieuweKandidaten(kandidaten: GmailKandidaatBericht[], bestaandeIds: Set<string>): GmailKandidaatBericht[] {
  return kandidaten.filter((k) => !bestaandeIds.has(k.gmailMessageId));
}

export interface NieuwSignaalData {
  status: "gesignaleerd" | "niet_relevant";
  reden: string | null;
  schoolId: number | null;
}

/** Puur: bepaalt de op te slaan status/reden/school voor één zojuist geclassificeerd bericht — school-matching draait uitsluitend als actie nodig is (geen zinloze matchpoging op mail die toch niet getoond wordt). */
export function bepaalNieuwSignaalData(kandidaat: GmailKandidaatBericht, classificatie: MailClassificatie | undefined, scholen: SchoolOptie[]): NieuwSignaalData {
  const actieNodig = classificatie?.actieNodig ?? false;
  if (!actieNodig) {
    return { status: "niet_relevant", reden: classificatie?.reden ?? null, schoolId: null };
  }
  const match = matchSchoolBetrouwbaar(`${kandidaat.van} ${kandidaat.onderwerp} ${kandidaat.snippet}`, scholen);
  return { status: "gesignaleerd", reden: classificatie?.reden ?? null, schoolId: match.school?.id ?? null };
}

export interface MailSignaalWeergave {
  gmailMessageId: string;
  gmailThreadId: string;
  van: string;
  onderwerp: string;
  ontvangenOp: string;
  reden: string;
  school: SchoolOptie | null;
  signaalId: number;
}

/**
 * Payload-aware orchestrator — zie moduletoelichting. `scholen` wordt door
 * de aanroeper meegegeven (dezelfde al-opgehaalde actieve-scholenlijst als
 * elders in Mijn Werk, bv. lib/werk/mijn-werk-chat.ts se haalActieveScholen)
 * — geen extra query hier.
 */
export async function haalMailSignalen(payload: Payload, eigenaarId: number, accessToken: string, scholen: SchoolOptie[]): Promise<MailSignaalWeergave[]> {
  const query = bouwKandidaatQuery(MAIL_LOOKBACK_DAGEN);
  const kandidaten = await haalKandidaatBerichten(accessToken, query, MAX_KANDIDATEN);
  if (kandidaten.length === 0) return [];

  const bestaande = await payload.find({
    collection: "mail-signalen",
    where: { and: [{ eigenaar: { equals: eigenaarId } }, { gmailMessageId: { in: kandidaten.map((k) => k.gmailMessageId) } }] },
    limit: kandidaten.length,
    depth: 0,
    overrideAccess: true,
  });
  const bestaandePerId = new Map((bestaande.docs as unknown as MailSignaalRij[]).map((rij) => [rij.gmailMessageId, rij]));

  const nieuw = bepaalNieuweKandidaten(kandidaten, new Set(bestaandePerId.keys()));
  // Expliciete guard (niet alleen classificeerKandidaatBerichten se eigen
  // lege-array-kortsluiting): maakt hier al zichtbaar dat een dag zonder
  // nieuwe kandidaten helemaal geen AI-aanroep doet, geen enkele.
  const classificaties = nieuw.length > 0 ? await classificeerKandidaatBerichten(nieuw) : [];
  const classificatiePerId = new Map(classificaties.map((c) => [c.gmailMessageId, c]));

  const nieuweRijen = await Promise.all(
    nieuw.map(async (kandidaat) => {
      const data = bepaalNieuwSignaalData(kandidaat, classificatiePerId.get(kandidaat.gmailMessageId), scholen);
      const rij = await payload.create({
        collection: "mail-signalen",
        overrideAccess: true,
        data: {
          eigenaar: eigenaarId,
          gmailMessageId: kandidaat.gmailMessageId,
          gmailThreadId: kandidaat.gmailThreadId,
          status: data.status,
          reden: data.reden,
          geclassificeerdOp: new Date().toISOString(),
          school: data.schoolId,
        },
      });
      return rij as unknown as MailSignaalRij;
    })
  );
  for (const rij of nieuweRijen) bestaandePerId.set(rij.gmailMessageId, rij);

  const schoolPerId = new Map(scholen.map((s) => [s.id, s]));
  const weergave: MailSignaalWeergave[] = [];
  for (const kandidaat of kandidaten) {
    const rij = bestaandePerId.get(kandidaat.gmailMessageId);
    if (!rij || rij.status !== "gesignaleerd") continue;
    weergave.push({
      gmailMessageId: kandidaat.gmailMessageId,
      gmailThreadId: kandidaat.gmailThreadId,
      van: kandidaat.van,
      onderwerp: kandidaat.onderwerp,
      ontvangenOp: kandidaat.ontvangenOp,
      reden: rij.reden ?? "",
      school: rij.school ? (schoolPerId.get(rij.school) ?? null) : null,
      signaalId: rij.id,
    });
  }
  return weergave;
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
