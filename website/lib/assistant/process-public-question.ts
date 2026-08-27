import type { Payload } from "payload";
import type { Variant } from "@/types/variant";
import { searchKnowledgePhased } from "@/lib/embeddings/similarity-search";
import { richTextNaarPlatteTekst } from "@/lib/embeddings/embeddable-text";
import { buildContext, type ContextItem } from "./build-context";
import { genereerAssistentAntwoord, MIN_SIMILARITY_VOOR_ANTWOORD } from "./answer";
import { rewriteSearchQuery } from "./rewrite-query";
import { bepaalIntentie, type IntentieUitkomst } from "./bepaal-intentie";
import { haalAchtergrondKennisbasisVoorVariant, type AchtergrondKennisbasis } from "./kennisbasis-context";
import { ANSWER_PROMPT_VERSION, RETRIEVAL_VERSION } from "./versions";

// Publieke, anonieme tegenhanger van process-question.ts — Helpdesk MVP 1.0.
// process-question.ts (het interne /assistant-scherm) blijft VOLLEDIG
// ongewijzigd: dit bestand doorloopt bewust dezelfde pijplijnstappen
// opnieuw (rewrite → gefaseerde retrieval → context → antwoord), net zoals
// lib/assistant/evaluate.ts dat al eerder deed voor de evaluatieomgeving —
// hetzelfde, inmiddels vaker toegepaste patroon in deze codebase om een
// tweede consument van de pijplijn te bedienen zonder de bestaande, geteste
// interne route te laten meebewegen met eisen die alleen voor publiek
// gebruik gelden (geen confidence/reasoning naar de eindgebruiker, geen
// verplichte ingelogde gebruiker, publiek-veilige bronvermelding i.p.v.
// admin-links).
//
// Verschil met process-question.ts:
// 1. Geen userId vereist — assistant-conversations.user is optioneel.
// 2. `manuals`: een publiek-veilige, gededupliceerde lijst van GEciteerde
//    handleidingen (title + downloadUrl-KOPPELING, geen admin-link, geen
//    similarity-percentage) — uitsluitend bronnen die een beheerder
//    expliciet op `zichtbaar: true` heeft gezet (zie KnowledgeSources.ts).
//    Dit is een weergavefilter: de retrieval/prompting hierboven gebruikt
//    ALTIJD alle geïndexeerde bronnen, ongeacht zichtbaarheid — alleen wat
//    aan de bezoeker getoond wordt, is beperkt.

const TOP_N = 10;

export interface PublicManual {
  id: number;
  title: string;
  hasFile: boolean;
}

export interface PublicStepImage {
  url: string;
  caption?: string;
  alt: string;
}

// Handleidingbouwer: de stap-citaten die de publieke chat direct onder een
// antwoord toont — "toon alleen de stappen die echt relevant zijn, niet
// standaard de hele handleiding" (zie het gesprek). Bewust een apart veld
// naast `manuals` (niet erin vermengd): de weergave is functioneel anders
// (afbeeldingen inline vs. een titel+downloadlink).
export interface PublicStep {
  handleidingId: number;
  handleidingSlug: string;
  handleidingTitel: string;
  handleidingUrl: string;
  stepId: string;
  stepNummer: number;
  titel: string;
  uitleg: string;
  images: PublicStepImage[];
}

export type ProcessPublicQuestionUitkomst =
  | {
      type: "answered" | "no-answer";
      // AI Verbetercentrum (2026-07-27): kan `null` zijn als het wegschrijven
      // van het audit-record zelf mislukt — dat mag de gebruiker nooit zijn
      // antwoord kosten (non-blocking logging, zie loggenConversatie
      // hieronder). HelpdeskChat.tsx verbergt dan alleen de
      // feedbackknoppen (er is geen record om feedback aan te koppelen).
      conversationId: number | null;
      // Los van `type` op de JSON-respons meegegeven: HelpdeskChat.tsx (het
      // enige frontend-component dat deze respons rechtstreeks leest) toont
      // hierop het automatische contactformulier bij "geen antwoord" — een
      // expliciet boolean veld is daar duidelijker dan `type === "answered"`
      // opnieuw te moeten afleiden aan de clientkant.
      hasAnswer: boolean;
      answer: string;
      manuals: PublicManual[];
      steps: PublicStep[];
    }
  // Kennisbasis MijnLeerlijn — fase 1 (bepaalIntentie) vond 2+ écht
  // verschillende, even plausibele onderwerpen — GEEN "geen antwoord": dit
  // is een bewuste tussenvraag, geen contactformulier-trigger, geen
  // stappen/manuals-blok. HelpdeskChat.tsx onthoudt de oorspronkelijke
  // vraag en stuurt die als `previousQuestion` mee bij de volgende vraag.
  | { type: "clarification"; conversationId: number | null; question: string }
  | { type: "failed"; foutmelding: string };

interface ZichtbareBron {
  id: number;
  title: string;
  zichtbaar: boolean | null | undefined;
  file: unknown;
}

/** Haalt, gededupliceerd, de zichtbare Knowledge Sources op waarnaar de geciteerde ContextItems verwijzen. */
async function bepaalPubliekeManuals(payload: Payload, contextItems: ContextItem[]): Promise<PublicManual[]> {
  const bronIds = [
    ...new Set(
      contextItems
        .filter((item) => item.type === "knowledge-source" || item.type === "knowledge-source-chapter")
        .map((item) => item.refId)
    ),
  ];
  if (bronIds.length === 0) return [];

  const bronnen = await payload.find({
    collection: "knowledge-sources",
    where: { id: { in: bronIds } },
    limit: bronIds.length,
    overrideAccess: true,
    depth: 0,
  });

  // Volgorde behouden zoals geciteerd (meest relevante eerst) — niet de
  // volgorde waarin payload.find() ze toevallig teruggeeft.
  const byId = new Map((bronnen.docs as ZichtbareBron[]).map((b) => [b.id, b]));
  const gezien = new Set<number>();
  const manuals: PublicManual[] = [];
  for (const id of bronIds) {
    if (gezien.has(id)) continue;
    gezien.add(id);
    const bron = byId.get(id);
    if (!bron || !bron.zichtbaar) continue;
    manuals.push({ id: bron.id, title: bron.title, hasFile: Boolean(bron.file) });
  }
  return manuals;
}

interface HandleidingMediaDoc {
  id: number;
  url?: string | null;
  altText?: string | null;
}

interface HandleidingStapDoc {
  id?: string;
  titel: string;
  uitleg: unknown;
  verborgen?: boolean | null;
  media?: { bestand: HandleidingMediaDoc | number | null; onderschrift?: string | null }[] | null;
}

interface HandleidingDoc {
  id: number;
  titel: string;
  slug: string;
  stappen?: HandleidingStapDoc[] | null;
}

/**
 * Vertaalt de "handleiding-step"-ContextItems die daadwerkelijk in het
 * antwoord gebruikt zijn naar publiek te tonen stappen MET afbeeldingen —
 * "de AI kiest niet zelf welke afbeelding erbij hoort, die volgt automatisch
 * uit de gevonden stap-id" (zie het gesprek). Een `verborgen`-stap kan hier
 * in theorie niet meer voorkomen (searchKnowledgePhased sluit die al uit),
 * maar wordt hier defensief nogmaals overgeslagen — verdediging in diepte,
 * zelfde filosofie als elders in deze pijplijn.
 */
async function bepaalRelevanteStappen(payload: Payload, contextItems: ContextItem[]): Promise<PublicStep[]> {
  const stapItems = contextItems.filter((item) => item.type === "handleiding-step" && item.stepId);
  if (stapItems.length === 0) return [];

  const handleidingIds = [...new Set(stapItems.map((item) => item.refId))];
  const handleidingen = await payload.find({
    collection: "handleidingen",
    where: { id: { in: handleidingIds } },
    limit: handleidingIds.length,
    overrideAccess: true,
    depth: 1,
  });
  const byId = new Map((handleidingen.docs as unknown as HandleidingDoc[]).map((h) => [h.id, h]));

  const stappen: PublicStep[] = [];
  const gezien = new Set<string>();
  for (const item of stapItems) {
    const sleutel = `${item.refId}:${item.stepId}`;
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);

    const handleiding = byId.get(item.refId);
    if (!handleiding) continue;
    const alleStappen = handleiding.stappen ?? [];
    const stapIndex = alleStappen.findIndex((s) => s.id === item.stepId);
    if (stapIndex === -1) continue;
    const stap = alleStappen[stapIndex]!;
    if (stap.verborgen) continue;

    const images: PublicStepImage[] = (stap.media ?? []).flatMap((m) => {
      const bestand = m.bestand;
      if (!bestand || typeof bestand === "number" || !bestand.url) return [];
      return [
        {
          url: `/api/media/${bestand.id}`,
          caption: m.onderschrift ?? undefined,
          alt: bestand.altText ?? stap.titel,
        },
      ];
    });

    stappen.push({
      handleidingId: handleiding.id,
      handleidingSlug: handleiding.slug,
      handleidingTitel: handleiding.titel,
      handleidingUrl: `/handleidingen/${handleiding.slug}`,
      stepId: item.stepId!,
      stepNummer: stapIndex + 1,
      titel: stap.titel,
      uitleg: richTextNaarPlatteTekst(stap.uitleg),
      images,
    });
  }
  return stappen;
}

// AI Verbetercentrum (2026-07-27): schrijft het auditrecord non-blocking —
// een mislukte log (bv. een tijdelijke databasehapering) mag de bezoeker
// nooit zijn al-berekende antwoord kosten. Bij een fout: server-side loggen
// en `null` teruggeven i.p.v. de aanroeper te laten crashen.
async function loggenConversatie(payload: Payload, data: Record<string, unknown>): Promise<number | null> {
  try {
    const record = await payload.create({
      collection: "assistant-conversations",
      overrideAccess: true,
      data,
    } as Parameters<typeof payload.create>[0]);
    return record.id;
  } catch (error) {
    console.error("[process-public-question] Loggen van conversatie mislukt (antwoord blijft ongewijzigd):", error);
    return null;
  }
}

/** Gedeelde intentie-gerelateerde velden voor elk conversatierecord — zelfde vorm ongeacht welke branch logt. */
function intentieVelden(intentie: IntentieUitkomst) {
  return {
    intentieType: intentie.type,
    kennisbasisOnderwerp: intentie.type === "opgelost" ? intentie.onderwerpId : null,
    kennisbasisKandidaten: intentie.kandidaten,
    gebruikteOfficieleTerm: intentie.type === "opgelost" ? intentie.officieleTerm : null,
    gebruikteSynoniem: intentie.type === "opgelost" ? intentie.gebruikteSynoniem : null,
    promptVersion: ANSWER_PROMPT_VERSION,
    retrievalVersion: RETRIEVAL_VERSION,
    kennisbasisVersion: intentie.kennisbasisVersion,
  };
}

/**
 * Kennisbasis MijnLeerlijn — Fase 4 (2026-07-28): gedeelde velden voor de
 * centrale kennisbasis, zelfde vorm ongeacht welke branch logt — zie
 * lib/assistant/kennisbasis-context.ts. `tegenstrijdigheid` is alleen ooit
 * niet-null wanneer genereerAssistentAntwoord() daadwerkelijk is aangeroepen
 * (dus nooit bij de "onduidelijk"-branch of een retrieval-mislukking, die
 * nooit bij de AI-aanroep komen).
 */
function centraleKennisbasisVelden(
  centraleKennisbasis: AchtergrondKennisbasis | null,
  tegenstrijdigheid: string | null = null
) {
  return {
    centraleKennisbasisGebruikt: centraleKennisbasis !== null,
    centraleKennisbasisVersion: centraleKennisbasis?.versie ?? null,
    tegenstrijdigheid,
  };
}

/** Best-effort logging voor de twee mislukking-paden (retrieval- en AI-fouten) — vandaag logden die helemaal niets. */
async function loggenMislukking(
  payload: Payload,
  opties: { question: string; previousQuestion?: string; variant: Variant },
  intentie: IntentieUitkomst,
  centraleKennisbasis: AchtergrondKennisbasis | null,
  begin: number,
  foutmelding: string
): Promise<void> {
  await loggenConversatie(payload, {
    source: "helpdesk",
    variant: Number(opties.variant.id),
    question: opties.question,
    previousQuestion: opties.previousQuestion ?? null,
    hasAnswer: false,
    answer: "(geen antwoord — technische fout)",
    reasoning: `Mislukt: ${foutmelding}`,
    confidence: 0,
    sources: [],
    steps: [],
    model: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    answerTimeMs: Date.now() - begin,
    feedbackRating: "geen",
    user: null,
    contactFormSubmitted: false,
    geenHandleidingGevonden: true,
    verbeterStatus: "nieuw",
    ...intentieVelden(intentie),
    ...centraleKennisbasisVelden(centraleKennisbasis),
  });
}

// Gesprek delen — vervolgen (2026-09-01, spec-eis §5): een gesprek dat via
// /delen/[token] wordt voortgezet, geeft de AI de tot dan toe gevoerde
// vraag/antwoord-uitwisseling (het gedeelde snapshot + eventuele eigen
// nieuwe berichten van deze bezoeker) mee als context — anders zou een
// vervolgvraag als "en hoe zet ik dat aan?" zonder de eerder gedeelde
// vraag/antwoord onbegrijpelijk zijn voor zowel intentiebepaling als
// retrieval. Zelfde bewezen mechaniek als `previousQuestion` hieronder
// (tekst vóór de vraag plakken, geen apart chat-messages-formaat) —
// bewust geen tweede/parallel chatsysteem, uitsluitend een generalisatie
// van "één vorige vraag" naar "N eerdere vraag/antwoord-paren". Begrensd op
// dezelfde MAX_BERICHTEN_PER_DEELLINK als een deel-link zelf (zie
// lib/helpdesk/delen.ts) — bewaakt door de aanroeper
// (app/api/helpdesk/ask/route.ts), niet hier: deze functie vertrouwt op een
// al gevalideerde aanroep, net als bij `question`/`previousQuestion` al het
// geval was.
export interface ConversatieTurn {
  question: string;
  answer: string;
}

function bouwGeschiedenisBlok(geschiedenis: ConversatieTurn[]): string {
  if (geschiedenis.length === 0) return "";
  return geschiedenis
    .map((turn, i) => `Eerdere vraag ${i + 1}: ${turn.question}\nEerder antwoord ${i + 1}: ${turn.answer}`)
    .join("\n\n");
}

// Multi-brand variants (2026-07-30): `variant` is verplicht — de publieke
// Helpdesk-route (app/api/helpdesk/ask/route.ts) heeft 'm altijd via
// getActiveVariant(). Stuurt retrieval-scoping (searchKnowledgePhased),
// de systeeminstructie/terminologie (genereerAssistentAntwoord) en de
// intentiebepaling (bepaalIntentie) — voorkomt dat kennis of terminologie
// van een andere variant in dit antwoord terechtkomt.
export async function processPublicQuestion(
  payload: Payload,
  opties: { question: string; previousQuestion?: string; conversationHistory?: ConversatieTurn[]; variant: Variant }
): Promise<ProcessPublicQuestionUitkomst> {
  const begin = Date.now();

  // Kennisbasis MijnLeerlijn — fase 1 (2026-07-28): vóór de bestaande
  // rewrite/retrieval-flow wordt eerst bepaald welke MijnLeerlijn-functie
  // bedoeld is. `previousQuestion` (alleen gezet bij het vervolg op een
  // eerdere verduidelijkingsvraag, zie HelpdeskChat.tsx) wordt aan de
  // oorspronkelijke vraag geplakt zodat zowel de intentiebepaling als het
  // uiteindelijke antwoord de volledige context hebben — er is bewust maar
  // één verduidelijkingsronde: bepaalIntentie() vraagt zelf nooit twee keer
  // door (zie het commentaar daar), dus deze functie hoeft dat niet apart
  // te bewaken. `conversationHistory` (zie hierboven) gaat, indien aanwezig,
  // hier nog vóór te staan.
  const nieuweVraag = opties.previousQuestion ? `${opties.previousQuestion} — ${opties.question}` : opties.question;
  const geschiedenisBlok = bouwGeschiedenisBlok(opties.conversationHistory ?? []);
  const effectieveVraag = geschiedenisBlok ? `${geschiedenisBlok}\n\nNieuwe vraag: ${nieuweVraag}` : nieuweVraag;

  const intentie = await bepaalIntentie(payload, effectieveVraag, opties.variant.id);

  if (intentie.type === "onduidelijk") {
    const conversationId = await loggenConversatie(payload, {
      source: "helpdesk",
      variant: Number(opties.variant.id),
      question: opties.question,
      previousQuestion: opties.previousQuestion ?? null,
      hasAnswer: false,
      answer: intentie.vraag,
      reasoning: "Kennisbasis MijnLeerlijn: vraag was tussen meerdere onderwerpen ambigu, verduidelijking gevraagd.",
      confidence: 0,
      sources: [],
      steps: [],
      model: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      answerTimeMs: Date.now() - begin,
      feedbackRating: "geen",
      user: null,
      contactFormSubmitted: false,
      geenHandleidingGevonden: false,
      verbeterStatus: "nieuw",
      ...intentieVelden(intentie),
      ...centraleKennisbasisVelden(null),
    });
    return { type: "clarification", conversationId, question: intentie.vraag };
  }

  // Kennisbasis per variant (2026-07-31): het achtergronddocument van de
  // ACTIEVE variant wordt vanaf hier ALTIJD opgehaald (ongeacht intentieType
  // — "opgelost" of "geen-match" hebben allebei baat bij de achtergrond-
  // context) en zo dadelijk gegarandeerd meegestuurd naar
  // genereerAssistentAntwoord(), ongeacht de similarity-score van de
  // opgehaalde handleidingen/bronnen. Nooit een terugval naar een andere
  // variant: heeft déze variant geen (bruikbaar) achtergronddocument, dan
  // geeft haalAchtergrondKennisbasisVoorVariant() `null` terug (gelogd als
  // waarschuwing) en gaat het antwoord gewoon verder zonder achtergrondblok
  // — dit kan dus nooit de rest van de flow blokkeren.
  const centraleKennisbasis = await haalAchtergrondKennisbasisVoorVariant(payload, opties.variant.id);

  // "opgelost": de officiële term stuurt de zoekvraag i.p.v. de letterlijke
  // formulering van de gebruiker — dit is de kern van "beide phrasing-
  // varianten leiden tot dezelfde handleiding". "geen-match": ongewijzigd
  // de bestaande rewriteSearchQuery-flow.
  const zoekvraag =
    intentie.type === "opgelost" ? intentie.officieleTerm : await rewriteSearchQuery(effectieveVraag);

  let resultaat: Awaited<ReturnType<typeof searchKnowledgePhased>>;
  let contextItems: ContextItem[];
  try {
    resultaat = await searchKnowledgePhased(payload, {
      query: zoekvraag,
      limiet: TOP_N,
      drempelVoorVoldoende: MIN_SIMILARITY_VOOR_ANTWOORD,
      variantId: opties.variant.id,
    });
    contextItems = await buildContext(payload, resultaat.hits);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    await loggenMislukking(payload, opties, intentie, centraleKennisbasis, begin, boodschap);
    return { type: "failed", foutmelding: boodschap };
  }

  const heeftStructuredStappen = contextItems.some((item) => item.type === "handleiding-step");
  const uitkomst = await genereerAssistentAntwoord(effectieveVraag, contextItems, {
    heeftStructuredStappen,
    centraleKennisbasis,
    variant: {
      productName: opties.variant.branding.productName,
      terminologyDictionary: opties.variant.terminologyDictionary,
    },
  });
  if (uitkomst.type === "failed") {
    await loggenMislukking(payload, opties, intentie, centraleKennisbasis, begin, uitkomst.foutmelding);
    return uitkomst;
  }

  const manuals = uitkomst.type === "answered" ? await bepaalPubliekeManuals(payload, contextItems) : [];
  const steps = uitkomst.type === "answered" ? await bepaalRelevanteStappen(payload, contextItems) : [];
  const geenHandleidingGevonden = manuals.length === 0 && steps.length === 0;

  const conversationId = await loggenConversatie(payload, {
    source: "helpdesk",
    variant: Number(opties.variant.id),
    question: opties.question,
    previousQuestion: opties.previousQuestion ?? null,
    hasAnswer: uitkomst.type === "answered",
    answer: uitkomst.answer,
    reasoning: uitkomst.reasoning,
    confidence: uitkomst.confidence,
    sources: contextItems.map((item) => ({
      label: item.label,
      refCollection: item.refCollection,
      refId: item.refId,
      title: item.title,
      chapterTitle: item.chapterTitle,
      similarity: item.similarity,
      url: item.url,
    })),
    steps: steps.map((stap) => ({
      handleidingId: stap.handleidingId,
      stepId: stap.stepId,
      stepNummer: stap.stepNummer,
    })),
    model: uitkomst.model,
    inputTokens: uitkomst.usage.inputTokens,
    outputTokens: uitkomst.usage.outputTokens,
    totalTokens: uitkomst.usage.totalTokens,
    answerTimeMs: Date.now() - begin,
    feedbackRating: "geen",
    user: null,
    contactFormSubmitted: false,
    geenHandleidingGevonden,
    verbeterStatus: "nieuw",
    ...intentieVelden(intentie),
    ...centraleKennisbasisVelden(centraleKennisbasis, uitkomst.tegenstrijdigheid),
  });

  return {
    type: uitkomst.type,
    conversationId,
    hasAnswer: uitkomst.type === "answered",
    answer: uitkomst.answer,
    manuals,
    steps,
  };
}
