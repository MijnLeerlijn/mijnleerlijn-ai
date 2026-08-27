import type { Payload } from "payload";
import { genereerDeelToken, hashDeelToken } from "./deel-token";
import { bepaalPubliekeManualsVoorSnapshot, bepaalRelevanteStappenVoorSnapshot } from "./deel-snapshot";
import type { PublicManual, PublicStep } from "@/lib/assistant/process-public-question";
import type { AssistantConversation } from "@/types/payload-generated";

// Chat delen via URL (2026-08-24) — de enige plek die de collectie
// "gedeelde-chats" schrijft/leest. Zelfde architectuurpatroon als elke
// andere gevoelige collectie in dit project (TrainerBestanden,
// TrainerTelefonieOproepen, ContactSubmissions): de collectie zelf staat
// volledig dicht (create/update: () => false), en deze module is de enige
// plek die overrideAccess: true gebruikt, ná eigen verificatie hieronder.
//
// Bewust GEEN eigenaarscontrole op basis van een ingelogde gebruiker: de
// publieke Helpdesk-chat heeft er zelf geen (zie
// lib/assistant/process-public-question.ts — elk gesprek heeft user: null).
// De toegangsgrens hier is in plaats daarvan: uitsluitend conversationId's
// met source "helpdesk" zijn deelbaar — dit voorkomt dat het interne
// /assistant-scherm (dat WEL een eigenaar/login kent) via deze publieke
// deelroute zou kunnen lekken, ook al kent iemand toevallig een intern
// conversationId. Zelfde grens-redenering als app/api/helpdesk/feedback/
// route.ts hanteert voor exact hetzelfde probleem.

/** Defensieve bovengrens (zelfde principe als elders in dit project — "vermijd onbegrensde queries/opslag"). */
export const MAX_BERICHTEN_PER_DEELLINK = 50;

export interface GedeeldBericht {
  vraag: string;
  antwoord: string;
  hasAnswer: boolean;
  manuals: PublicManual[];
  steps: PublicStep[];
}

export type MaakDeelLinkUitkomst =
  | { soort: "ok"; token: string }
  | { soort: "leeg" }
  | { soort: "te_veel_berichten" }
  | { soort: "geen_geldige_conversaties" }
  | { soort: "ongeldige_bron" };

interface StoredSource {
  refCollection?: string | null;
  refId?: number | null;
}
interface StoredStep {
  handleidingId?: number | null;
  stepId?: string | null;
  stepNummer?: number | null;
}

interface StoredManual {
  manualId: number;
  title: string;
  hasFile: boolean | null;
}
interface StoredImage {
  url: string;
  caption?: string | null;
  alt: string;
}
interface StoredStepFull {
  handleidingId: number;
  handleidingSlug: string;
  handleidingTitel: string;
  handleidingUrl: string;
  stepId: string;
  stepNummer: number;
  titel: string;
  uitleg: string;
  images?: StoredImage[] | null;
}
interface StoredBericht {
  vraag: string;
  antwoord: string;
  hasAnswer?: boolean | null;
  manuals?: StoredManual[] | null;
  steps?: StoredStepFull[] | null;
}

/** Zet de ruwe, opgeslagen berichten-array (Payload-vorm) om naar de publiek-veilige GedeeldBericht-vorm — gedeeld door haalGedeeldeChat() en de parent-resolutie in maakDeelLink() hieronder, zodat een fork exact dezelfde velden erft als de publieke weergave zelf toont. */
function ontleedOpgeslagenBerichten(berichten: StoredBericht[]): GedeeldBericht[] {
  return berichten.map((b) => ({
    vraag: b.vraag,
    antwoord: b.antwoord,
    // Ontbreekt op rijen van vóór deze uitbreiding (2026-09-01) — die
    // toonden altijd al gewoon het antwoord, dus true reproduceert dat
    // gedrag exact (zie GedeeldeChats.ts se toelichting bij hasAnswer).
    hasAnswer: b.hasAnswer ?? true,
    manuals: (b.manuals ?? []).map((m) => ({ id: m.manualId, title: m.title, hasFile: Boolean(m.hasFile) })),
    steps: (b.steps ?? []).map((s) => ({
      handleidingId: s.handleidingId,
      handleidingSlug: s.handleidingSlug,
      handleidingTitel: s.handleidingTitel,
      handleidingUrl: s.handleidingUrl,
      stepId: s.stepId,
      stepNummer: s.stepNummer,
      titel: s.titel,
      uitleg: s.uitleg,
      images: (s.images ?? []).map((img) => ({ url: img.url, caption: img.caption ?? undefined, alt: img.alt })),
    })),
  }));
}

/**
 * Rechtstreekse, ruwe token-hash-lookup — de ENE plek die "gedeelde-chats"
 * bevraagt op tokenHash. `vereistNietIngetrokken` bepaalt of een al
 * ingetrokken rij als "niet gevonden" telt: `true` voor elk publiek
 * leesmoment (haalGedeeldeChat/trekDeelLinkIn — een ingetrokken link mag
 * niemand nog kunnen openen), `false` uitsluitend voor de fork-resolutie in
 * maakDeelLink hieronder — iemand die de inhoud al legitiem in de eigen
 * browser heeft staan (vóór intrekking geopend), mag zijn eigen, inmiddels
 * aangevulde gesprek nog gewoon opnieuw kunnen delen; intrekken is bedoeld om
 * NIEUWE toegang via de oude link te stoppen, geen recht-op-vergetelheid op
 * content die de ontvanger al heeft.
 */
async function vindRuweShareRecord(
  payload: Payload,
  ruweToken: string,
  vereistNietIngetrokken: boolean
): Promise<{ id: number; berichten: StoredBericht[]; createdAt: string } | null> {
  const resultaat = await payload.find({
    collection: "gedeelde-chats",
    where: { tokenHash: { equals: hashDeelToken(ruweToken) } },
    overrideAccess: true,
    depth: 0,
    limit: 1,
  });
  const record = resultaat.docs[0];
  if (!record) return null;
  if (vereistNietIngetrokken && record.revokedAt) return null;
  return { id: record.id as number, berichten: (record.berichten ?? []) as StoredBericht[], createdAt: record.createdAt };
}

/**
 * Maakt een nieuwe deel-snapshot. Twee bronnen, allebei server-side
 * onafhankelijk geverifieerd — de client levert nooit rechtstreeks
 * vraag/antwoord-tekst aan (dat zou een niet-vertrouwde partij toestaan
 * verzonnen "AI-antwoorden" publiekelijk te laten lijken alsof ze echt zijn):
 *  - `conversationIds` — Helpdesk-conversationId's zoals de client ze al kent
 *    uit /api/helpdesk/ask-responses (ongewijzigd t.o.v. vóór deze ronde),
 *    chronologisch gesorteerd op createdAt — nooit de door de client
 *    aangeleverde arrayvolgorde vertrouwd.
 *  - `parentToken` (Gesprek delen — vervolgen, 2026-09-01, spec-eis §6/§7) —
 *    optioneel: de token van een eerder geopende gedeelde chat waaronder de
 *    afzender net verder heeft gepraat (HelpdeskChat.tsx se
 *    initieleBerichten/deelParentToken). Diens BEVROREN berichten worden
 *    hier vóór de nieuwe conversationIds-berichten geplakt — nooit de eigen
 *    (mogelijk introductieve) tekst van de client, uitsluitend wat al eerder
 *    server-side is vastgelegd. Dit is een FORK, geen wijziging: de
 *    ouder-rij zelf wordt hier nooit aangeraakt/bijgewerkt.
 */
export async function maakDeelLink(
  payload: Payload,
  opties: { conversationIds: number[]; parentToken?: string }
): Promise<MaakDeelLinkUitkomst> {
  const uniekeIds = [...new Set(opties.conversationIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (uniekeIds.length > MAX_BERICHTEN_PER_DEELLINK) return { soort: "te_veel_berichten" };

  let geerfdeBerichten: GedeeldBericht[] = [];
  if (opties.parentToken) {
    const ouder = await vindRuweShareRecord(payload, opties.parentToken, false);
    if (!ouder) return { soort: "ongeldige_bron" };
    geerfdeBerichten = ontleedOpgeslagenBerichten(ouder.berichten);
  }

  if (uniekeIds.length === 0 && geerfdeBerichten.length === 0) return { soort: "leeg" };
  if (geerfdeBerichten.length + uniekeIds.length > MAX_BERICHTEN_PER_DEELLINK) return { soort: "te_veel_berichten" };

  const nieuweBerichten: GedeeldBericht[] = [];
  let helpdeskRecords: AssistantConversation[] = [];
  if (uniekeIds.length > 0) {
    const resultaat = await payload.find({
      collection: "assistant-conversations",
      where: { id: { in: uniekeIds } },
      overrideAccess: true,
      depth: 0,
      limit: uniekeIds.length,
    });

    helpdeskRecords = resultaat.docs.filter((d) => d.source === "helpdesk");
    if (helpdeskRecords.length !== uniekeIds.length) return { soort: "geen_geldige_conversaties" };

    helpdeskRecords.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    for (const record of helpdeskRecords) {
      const sources = ((record.sources ?? []) as StoredSource[]).flatMap((s) =>
        typeof s.refCollection === "string" && typeof s.refId === "number" ? [{ refCollection: s.refCollection, refId: s.refId }] : []
      );
      const steps = ((record.steps ?? []) as StoredStep[]).flatMap((s) =>
        typeof s.handleidingId === "number" && typeof s.stepId === "string" && typeof s.stepNummer === "number"
          ? [{ handleidingId: s.handleidingId, stepId: s.stepId, stepNummer: s.stepNummer }]
          : []
      );

      const [manuals, stappen] = await Promise.all([
        bepaalPubliekeManualsVoorSnapshot(payload, sources),
        bepaalRelevanteStappenVoorSnapshot(payload, steps),
      ]);
      nieuweBerichten.push({ vraag: record.question, antwoord: record.answer, hasAnswer: Boolean(record.hasAnswer), manuals, steps: stappen });
    }
  }

  const berichten = [...geerfdeBerichten, ...nieuweBerichten];

  const token = genereerDeelToken();
  await payload.create({
    collection: "gedeelde-chats",
    overrideAccess: true,
    data: {
      tokenHash: hashDeelToken(token),
      berichten: berichten.map((b) => ({
        vraag: b.vraag,
        antwoord: b.antwoord,
        hasAnswer: b.hasAnswer,
        manuals: b.manuals.map((m) => ({ manualId: m.id, title: m.title, hasFile: m.hasFile })),
        steps: b.steps.map((s) => ({
          handleidingId: s.handleidingId,
          handleidingSlug: s.handleidingSlug,
          handleidingTitel: s.handleidingTitel,
          handleidingUrl: s.handleidingUrl,
          stepId: s.stepId,
          stepNummer: s.stepNummer,
          titel: s.titel,
          uitleg: s.uitleg,
          images: s.images.map((img) => ({ url: img.url, caption: img.caption, alt: img.alt })),
        })),
      })),
      // Uitsluitend de NIEUW gelogde conversaties — de overgeërfde
      // berichten hebben hier geen eigen assistant-conversations-rij (ze
      // zijn zelf al een bevroren kopie), dus niets om aan te koppelen.
      bronConversaties: helpdeskRecords.map((r) => r.id),
    },
  });

  return { soort: "ok", token };
}

export interface GedeeldeChatWeergave {
  berichten: GedeeldBericht[];
  gedeeldOp: string;
}

export type HaalGedeeldeChatUitkomst = { soort: "ok"; data: GedeeldeChatWeergave } | { soort: "niet_beschikbaar" };

/**
 * Publiek-veilige lezing van een gedeelde chat via de RUWE token (nooit de
 * hash zelf accepteren — die is er juist om de ruwe waarde geheim te
 * houden). Geeft UITSLUITEND weergavevelden terug — nooit tokenHash, nooit
 * bronConversaties/interne ID's, nooit een Payload-record-id.
 */
export async function haalGedeeldeChat(payload: Payload, ruweToken: string): Promise<HaalGedeeldeChatUitkomst> {
  const record = await vindRuweShareRecord(payload, ruweToken, true);
  if (!record) return { soort: "niet_beschikbaar" };

  return { soort: "ok", data: { berichten: ontleedOpgeslagenBerichten(record.berichten), gedeeldOp: record.createdAt } };
}

export type TrekDeelLinkInUitkomst = "ingetrokken" | "niet_gevonden";

/** Idempotent: een al ingetrokken of nooit bestaan hebbende token levert hetzelfde resultaat op voor de aanroeper ("link werkt niet meer") — geen apart foutpad nodig. */
export async function trekDeelLinkIn(payload: Payload, ruweToken: string): Promise<TrekDeelLinkInUitkomst> {
  const record = await vindRuweShareRecord(payload, ruweToken, true);
  if (!record) return "niet_gevonden";

  await payload.update({
    collection: "gedeelde-chats",
    id: record.id,
    overrideAccess: true,
    data: { revokedAt: new Date().toISOString() },
  });
  return "ingetrokken";
}
