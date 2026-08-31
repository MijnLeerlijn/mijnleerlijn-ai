import type { Payload } from "payload";
import { optionalEnv, getTrainersOrigin } from "@/config/env";
import type { TelefonieProvider, VoiceInstructie } from "./provider";
import { vindTrainerVoorTelefoonnummer, haalAuthTrainerVoorId } from "./trainer-lookup";
import type { AuthTrainer } from "../auth";
import { normaliseerNederlandsNummer } from "./nummer";
import { haalRecenteTrainingenVoorTelefonie, vandaagIsoAmsterdam, TELEFONIE_RECENTE_DAGEN } from "../monday-links";
import { haalTelefonieKandidaten, labelKandidaten, type TelefonieKandidaat, type TelefonieKandidatenResultaat } from "./kandidaten";
import { haalAanvullendeTrainingenAlsSamenvattingen } from "../aanvullende-trainingen";
import { upsertConcept, structureerVerslag, haalVerslagVoorTraining, type VerslagConceptUitkomst } from "../verslag";
import { transcribeAudio } from "@/services/ai-client";
import {
  maakOfHaalOproep,
  zetTrainerHerkend,
  zetMislukt,
  zetKandidatenAangeboden,
  zetTrainingGekozen,
  zetOpnameVerwacht,
  zetVerslagBestaatAl,
  claimOpnameFragmentVerwerking,
  zetTranscriptieBezig,
  zetConceptKlaar,
  zetTranscriptieHerstelbaarMislukt,
  zetOpnameVerwijderd,
  claimTranscriptieRetry,
  claimAfsluitboodschap,
  claimOpnameToetsVerwerking,
  vindOnderhoudsKandidaten,
  ontleedOpgeslagenKandidaten,
  zetBewustGestopt,
  zetOpnameOnderbroken,
  zetHangupInfo,
  claimFinalisatieZonderActiefFragment,
  type OproepFoutcode,
  type OpgeslagenKandidaat,
  type KandidatenFase,
} from "./oproep-state";
import type { TrainerTelefonieOproepen } from "@/types/payload-generated";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — de kernorchestratie van de
// telefoongesprekflow (spec §1/§7). Providerneutraal: praat uitsluitend
// tegen de TelefonieProvider-interface (./provider.ts), nooit tegen
// Twilio-specifieke velden rechtstreeks (spec §16). Elke webhookroute onder
// app/api/trainers/telefonie/ is bewust dun — dit bestand bevat de
// daadwerkelijke stappen, zelfde scheiding als lib/trainers/verslag.ts
// t.o.v. de API-routes eronder.
//
// KRITIEKE ARCHITECTUURGRENS (spec §29, expliciet met een eigen test
// bewezen in gesprek.test.ts): dit bestand en alles daaronder in
// lib/trainers/telefonie/ roept NOOIT lib/sales/monday-client.ts se
// create_update/wijzigKolomWaarde(Json) of lib/trainers/writeback.ts aan.
// De enige Monday-schrijvingen die hier ooit indirect gebeuren, lopen via
// upsertConcept() + structureerVerslag() — en die twee schrijven uitsluitend
// naar de LOKALE training-verslagen-rij (status blijft "concept"), nooit
// naar Monday. Pas de door de trainer zelf bevestigde bevestigVerslag()
// (portal) mag ooit een definitieve Monday-write doen.
//
// Trainertelefonie V1-afronding (2026-08-26) — spec-eis "vandaag altijd
// eerst, nooit meteen de volledige recente-lijst" + duplicate-preventie +
// robuuste '#'/'*'-afhandeling tijdens het opnemen. Kandidatenselectie zelf
// (welke trainingen, vandaag/ouder-splitsing, verslag-exclusie) is
// UITSLUITEND in ./kandidaten.ts gecentraliseerd (spec §16) — dit bestand
// bouwt daar de spraak-/DTMF-flow overheen.
//
// DTMF-schema (bewust gekozen, consistent gedocumenteerd — spec §3 vraagt
// hier expliciet om, geen vrije keuze per situatie):
//  - Laag "vandaag", 1 kandidaat:  1 = ja, 2 = nee (-> door naar "ouder",
//    indien aanwezig, anders "geen kandidaten meer").
//  - Laag "vandaag", N kandidaten (N = 2..8 als er ook een oudere laag
//    bestaat, anders 2..9): cijfers 1..N kiezen; cijfer 9 = "andere/oudere
//    trainingen" — UITSLUITEND aangeboden/geldig als de oudere laag niet
//    leeg is. Cijfer 9 blijft daarom altijd gereserveerd: de vandaag-laag
//    wordt begrensd tot MAX_KANDIDATEN_VOOR_KEUZE-1 zodra er ook een oudere
//    laag bestaat (zie presenteerLaag).
//  - Laag "ouder", 1 kandidaat: 1 = ja, 2 = nee (-> "geen kandidaten meer",
//    spec §14 — dit IS de laatste laag, geen verdere escape).
//  - Laag "ouder", N kandidaten: cijfers 1..N kiezen, geen escapecijfer nodig
//    (er is geen laag daarna).
// Dezelfde MAX_KANDIDATEN_VOOR_KEUZE-grens als voorheen begrenst elke laag
// afzonderlijk (één DTMF-cijfer per keuze blijft de harde bovengrens).

const MAX_KANDIDATEN_VOOR_KEUZE = 9; // één DTMF-cijfer per keuze
const GATHER_TIMEOUT_SECONDEN = 8;
// Root-cause-fix productie-incident (2026-08-27, "verbinding werd opeens
// verbroken tijdens het inspreken") — zie het bijbehorende onderzoeksrapport.
// MAX_OPNAME_DUUR_SECONDEN: 900 -> 1200 (20 minuten, op eigen verzoek iets
// ruimer dan spec §8 se oorspronkelijke "10-15 minuten"). OPNAME_STILTE_
// TIMEOUT_SECONDEN: 5 -> 60 — DE eigenlijke oorzaak: Telnyx' timeout_secs op
// record_start start pas ZODRA er al spraak gedetecteerd is en stopt de
// opname bij de eerstvolgende stilte van die lengte (Telnyx' eigen
// documentatie, recording-start endpoint) — 5 seconden is korter dan een
// normale denk-/adempauze tijdens het inspreken van een verslag, en elke
// zo'n stop werd vervolgens (vóór deze ronde) altijd behandeld als "trainer
// is klaar" -> bedanken + ophangen. 60 seconden is ruim boven een normale
// pauze, met Telnyx' eigen bovengrens (14.400s) als context ruim voldoende
// marge. Zie verder gesprek.ts se bepaalOpnameAfsluitreden/verwerkOpnameStatus
// hieronder: een stilte-stop hangt sinds deze ronde sowieso niet meer
// automatisch op (spec-eis §6 van de opdracht), dus deze waarde is vooral nog
// relevant als "hoelang duurt het voordat er ÜBERHAUPT een vervolgvraag komt".
const MAX_OPNAME_DUUR_SECONDEN = 1200; // 20 minuten — expliciete opdracht (was 900/15 min)
const OPNAME_STILTE_TIMEOUT_SECONDEN = 60; // was 5 — de root cause van het productie-incident
export const OPNAME_STOP_TOETS = "#"; // direct stoppen + verwerken (spec §9)
export const OPNAME_HERSTART_TOETS = "*"; // huidige opname afwijzen, opnieuw beginnen (spec §10) — TIJDENS een actieve opname
// '*'/'#' in reactie op de vervolgkeuze-prompt ná een automatische
// stilte-stop (zie verwerkVervolgKeuze) — bewust DEZELFDE toetsen als
// hierboven (minder om te onthouden voor de trainer), maar functioneel een
// ANDER, apart gedispatcht keuzemoment (oproep.status ===
// "opname_onderbroken", niet "opname_verwacht") — geen actieve opname om te
// discarden, dus geen samenloop met MAX_HEROPNAME_POGINGEN hieronder.
export const VERVOLG_DOORGAAN_TOETS = "*";
export const VERVOLG_AFRONDEN_TOETS = "#";
const VERVOLGKEUZE_TIMEOUT_SECONDEN = 30; // ruimer dan GATHER_TIMEOUT_SECONDEN: dit is een inhoudelijke beslissing ("verder of afronden"), geen simpel menucijfer
const OUDERE_TRAININGEN_TOETS = "9"; // escape naar de oudere laag (spec §3) — uitsluitend geldig bij fase="vandaag" mét een niet-lege oudere laag
// Spec §11 — "optioneel maximaliseren op een redelijk aantal (bv. 3)":
// staat 3 herstarts toe (opnamepoging 0 t/m 3, dus max. 4 daadwerkelijke
// opnames per gesprek) — een 4e '*'-druk wordt genegeerd (zie
// verwerkOpnameToets), expliciet gerapporteerd in het opleverrapport. Geldt
// uitsluitend voor '*' TIJDENS een actieve opname (bewust afwijzen+opnieuw) —
// niet voor "doorgaan" ná een automatische stilte-stop (verwerkVervolgKeuze),
// dat is geen discard/herstart maar een voortzetting van hetzelfde verslag.
const MAX_HEROPNAME_POGINGEN = 3;

// Production-readiness-gate 1 (2026-08-25) — transcriptieherstel +
// audiobewaartermijn. GEKOZEN WAARDEN EN MOTIVATIE (expliciet, zoals
// gevraagd):
//
// MAX_TRANSCRIPTIE_POGINGEN = 5 — begrensd (spec-eis "maximaal een begrensd
// aantal automatische retries"). Dekt een tijdelijke Whisper-/OpenAI-storing
// van enkele uren zonder de audio onnodig lang vast te houden; 5 pogingen
// met TRANSCRIPTIE_RETRY_DELAY_MS ertussen duren doorgaans onder de 2 uur.
//
// TRANSCRIPTIE_RETRY_DELAY_MS = 10 minuten — kort genoeg om binnen
// MAX_BEWAARTERMIJN_MS alle 5 pogingen te kunnen doen, lang genoeg om een
// kortstondige providerstoring niet meteen opnieuw te raken.
//
// MAX_BEWAARTERMIJN_MS = 24 uur (vanaf ontvangenOp, het gespreksmoment) — DE
// harde bovengrens: hierna wordt de audio ALTIJD verwijderd, ongeacht
// resterend pogingenbudget (spec §9-dataminimalisatie weegt zwaarder dan
// "nog een kans geven"). 24 uur is bewust ruim boven wat de pogingenteller
// realistisch nodig heeft (dat exhaust doorgaans al binnen ~2 uur, zie
// hierboven) — de 24 uur is dus vrijwel altijd een stille achtervanger, geen
// dagelijks geraakte limiet, en tegelijk kort genoeg om spraakopnames met
// persoonsgegevens over trainers/scholen niet langer dan één etmaal ergens
// te laten staan zonder dat er ooit een bruikbaar concept uit is gekomen.
//
// STUCK_TIMEOUT_MS = 25 minuten (was 20) — hoelang een rij in
// 'opname_ontvangen'/'transcriptie_bezig' mag blijven staan vóór de
// onderhoudsronde 'm als vastgelopen (bv. een gecrashte/time-outende
// serverless-aanroep) beschouwt en alsnog in het herstelpad trekt.
// Root-cause-fix productie-incident (2026-08-27) — meegeschaald met
// MAX_OPNAME_DUUR_SECONDEN (900 -> 1200s hierboven): de oorspronkelijke 20
// minuten was expliciet gemotiveerd als "15 minuten (toenmalige max.
// opnameduur) + 5 minuten marge voor download+Whisper-transcriptie+
// verwerking". Dezelfde 5-minuten-marge (geen vermenigvuldigingsfactor —
// download-/transcriptietijd schaalt met het VERSCHIL in audiolengte, niet
// met de limiet zelf) bovenop de nieuwe 20-minuten-limiet geeft 25 minuten.
// Dit blijft ruim boven de realistische verwerkingsduur (Whisper verwerkt
// doorgaans een veelvoud sneller dan realtime; zelfs een volle 20-minuten-
// opname verwerkt normaliter in hooguit enkele tientallen seconden), en kort
// genoeg om een écht vastgelopen rij niet dagenlang onopgemerkt te laten
// hangen. Geldt ONGEWIJZIGD per fragment (elke opnamepoging doorloopt
// opname_ontvangen/transcriptie_bezig zelf opnieuw, zie
// claimOpnameFragmentVerwerking in oproep-state.ts) — een gesprek met
// meerdere fragmenten na "verder inspreken" (spec-eis §6) maakt deze marge
// dus niet krapper: tussen fragmenten in staat de oproep op
// 'opname_onderbroken'/'opname_verwacht', nooit op de twee hier bewaakte
// statussen.
const MAX_TRANSCRIPTIE_POGINGEN = 5;
const TRANSCRIPTIE_RETRY_DELAY_MS = 10 * 60 * 1000;
const MAX_BEWAARTERMIJN_MS = 24 * 60 * 60 * 1000;
const STUCK_TIMEOUT_MS = 25 * 60 * 1000;
const ONDERHOUD_LIMIET_PER_CATEGORIE = 50; // begrenzing per onderhoudsronde-aanroep, voorkomt een onbegrensde cronrun

function telefonieIsActief(): boolean {
  return optionalEnv("TRAINER_TELEFONIE_ENABLED") === "true";
}

function pad(route: string): string {
  return `${getTrainersOrigin()}/api/trainers/telefonie/${route}`;
}

function voornaam(naam: string): string {
  return naam.split(" ")[0] || naam;
}

const NL_MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

/**
 * "vandaag" / "gisteren" / "eergisteren" / een concrete datum — spec §5:
 * "natuurlijke Nederlandse datumformulering... nooit interne ID's uitspreken."
 * Een concrete datum komt uitsluitend voor bij dag 3 (de bovengrens van het
 * bestaande telefonievenster, TELEFONIE_RECENTE_DAGEN in monday-links.ts) —
 * vandaag/gisteren/eergisteren dekken dag 0/1/2 al met een naam.
 */
function relatieveDagAanduiding(datumIso: string | null): string {
  if (!datumIso) return "onbekende datum";
  const vandaagMs = new Date(`${vandaagIsoAmsterdam()}T00:00:00Z`).getTime();
  const datumMs = new Date(`${datumIso}T00:00:00Z`).getTime();
  const dagen = Math.round((vandaagMs - datumMs) / (1000 * 60 * 60 * 24));
  if (dagen === 0) return "vandaag";
  if (dagen === 1) return "gisteren";
  if (dagen === 2) return "eergisteren";
  const datum = new Date(`${datumIso}T00:00:00Z`);
  return `${datum.getUTCDate()} ${NL_MAANDEN[datum.getUTCMonth()]}`;
}

const NIET_BESCHIKBAAR: VoiceInstructie[] = [{ soort: "zeg_en_ophangen", tekst: "Deze functie is nog niet beschikbaar.", reden: "niet_beschikbaar" }];

async function afwijzenMetMelding(
  payload: Payload,
  oproepId: number,
  foutcode: OproepFoutcode,
  foutmelding: string,
  gesprokenTekst: string,
  extra: Parameters<typeof zetMislukt>[4] = {}
): Promise<VoiceInstructie[]> {
  await zetMislukt(payload, oproepId, foutcode, foutmelding, extra);
  // reden = foutcode (oproep-state.ts se OproepFoutcode) — hergebruikt
  // bewust hetzelfde vocabulaire, geen los tweede foutcode-systeem voor de
  // client_state van het afsluitende speak-commando (zie provider.ts se
  // zeg_en_ophangen-doc-comment).
  return [{ soort: "zeg_en_ophangen", tekst: gesprokenTekst, reden: foutcode }];
}

function naarOpgeslagenKandidaat(t: TelefonieKandidaat): OpgeslagenKandidaat {
  return { id: t.id, naam: t.naam, schoolNaam: t.schoolNaam, datum: t.datum };
}

/**
 * Bouwt en bewaart het gesproken menu voor ÉÉN laag (vandaag OF ouder) —
 * spec §1-§5/§14. Uniform voor 0/1/N kandidaten: 0 -> de vaste
 * "geen beschikbare training"-afwijzing (spec §14, ongeacht of dit kwam
 * doordat er structureel niets recents was, of doordat alles al een verslag
 * heeft); 1 -> ja/nee-bevestiging; N -> genummerd menu, optioneel met het
 * escapecijfer naar de oudere laag.
 */
async function presenteerLaag(
  payload: Payload,
  oproepId: number,
  fase: KandidatenFase,
  kandidatenRuw: TelefonieKandidaat[],
  magEscapenNaarOuder: boolean,
  groet: string
): Promise<VoiceInstructie[]> {
  if (kandidatenRuw.length === 0) {
    return afwijzenMetMelding(
      payload,
      oproepId,
      "geen_training_gevonden",
      "Geen beschikbare trainingen na uitsluiting van trainingen met een bestaand verslag.",
      `${groet}Ik zie geen trainingen waarvoor nog een verslag kan worden ingesproken. Controleer je trainingen in de traineromgeving.`
    );
  }

  // Cijfer 9 blijft gereserveerd als escape zolang de oudere laag niet leeg
  // is (zie het DTMF-schema bovenaan dit bestand) — dus één kandidaat minder
  // in dat geval, anders zou een 9e kandidaat het escapecijfer kapen.
  const limiet = magEscapenNaarOuder ? MAX_KANDIDATEN_VOOR_KEUZE - 1 : MAX_KANDIDATEN_VOOR_KEUZE;
  const beperkt = kandidatenRuw.slice(0, limiet);
  await zetKandidatenAangeboden(payload, oproepId, fase, beperkt.map(naarOpgeslagenKandidaat));

  const labels = labelKandidaten(beperkt);
  const laagWoord = fase === "ouder" ? " eerdere" : "";

  if (beperkt.length === 1) {
    const enige = beperkt[0]!;
    return [
      {
        soort: "zeg_en_kies_cijfers",
        tekst: `${groet}Ik zie één${laagWoord} training: ${labels[0]}, ${relatieveDagAanduiding(enige.datum)}. Is dit de training waarvoor je een verslag wilt inspreken? Druk 1 voor ja, druk 2 voor nee.`,
        actieUrl: pad(`kies-training?oproepId=${oproepId}`),
        maxCijfers: 1,
        timeoutSeconden: GATHER_TIMEOUT_SECONDEN,
      },
    ];
  }

  const opsomming = beperkt.map((t, i) => `Druk ${i + 1} voor ${labels[i]}, ${relatieveDagAanduiding(t.datum)}.`).join(" ");
  const escapeZin = magEscapenNaarOuder ? ` Druk ${OUDERE_TRAININGEN_TOETS} voor andere trainingen.` : "";
  return [
    {
      soort: "zeg_en_kies_cijfers",
      tekst: `${groet}Ik zie ${beperkt.length}${laagWoord} trainingen. ${opsomming}${escapeZin}`,
      actieUrl: pad(`kies-training?oproepId=${oproepId}`),
      maxCijfers: 1,
      timeoutSeconden: GATHER_TIMEOUT_SECONDEN,
    },
  ];
}

/** Spec §1: ALTIJD eerst vandaag controleren — de volledige recente-lijst wordt nooit meteen gedumpt. */
async function presenteerKandidaten(payload: Payload, oproepId: number, groet: string, alles: TelefonieKandidatenResultaat): Promise<VoiceInstructie[]> {
  if (alles.vandaag.length > 0) {
    return presenteerLaag(payload, oproepId, "vandaag", alles.vandaag, alles.ouder.length > 0, groet);
  }
  // Geen kandidaten vandaag -> meteen door naar de oudere laag (spec §4),
  // zonder tussenliggende "niets vandaag"-melding. presenteerLaag geeft zelf
  // de spec §14-afwijzing als ook de oudere laag leeg is.
  return presenteerLaag(payload, oproepId, "ouder", alles.ouder, false, groet);
}

/** Spec §3/§15 — "nee" op de laatste vandaag-kandidaat, of het escapecijfer: vers ophalen en de oudere laag tonen. */
async function gaNaarOudereLaag(payload: Payload, oproepId: number, trainer: AuthTrainer): Promise<VoiceInstructie[]> {
  const alles = await haalTelefonieKandidaten(payload, trainer);
  return presenteerLaag(payload, oproepId, "ouder", alles.ouder, false, "");
}

/** Spec §1 stap 2-6 + §3/§4/§21 se afwijzingspaden. */
export async function verwerkInkomendeCall(
  payload: Payload,
  provider: TelefonieProvider,
  vormVelden: Record<string, string>
): Promise<VoiceInstructie[]> {
  if (!telefonieIsActief()) return NIET_BESCHIKBAAR;

  const { providerCallId, vanNummerRuw, nummerVerborgen } = provider.ontleedInkomendeCall(vormVelden);
  if (!providerCallId) return NIET_BESCHIKBAAR; // ontbrekende CallSid: kan structureel niet als geldige oproep verwerkt worden

  const oproep = await maakOfHaalOproep(payload, providerCallId);

  if (nummerVerborgen || !vanNummerRuw) {
    return afwijzenMetMelding(
      payload,
      oproep.id,
      "nummer_verborgen",
      "Beller-ID verborgen/onbeschikbaar.",
      "Ik kan je telefoonnummer niet zien. Bel met een zichtbaar nummer, of log in op de traineromgeving.",
      { nummerVerborgen: true, ruwNummer: null }
    );
  }

  const uitkomst = await vindTrainerVoorTelefoonnummer(payload, vanNummerRuw);

  if (uitkomst.soort === "geen_geldig_nummer" || uitkomst.soort === "onbekend") {
    return afwijzenMetMelding(
      payload,
      oproep.id,
      "onbekend_nummer",
      `Nummer niet gekoppeld (${uitkomst.soort}).`,
      "Dit telefoonnummer is niet gekoppeld aan een traineraccount. Log in op de traineromgeving om je telefoonnummer te controleren of neem contact op met MijnLeerlijn.",
      { ruwNummer: vanNummerRuw, nummerVerborgen: false }
    );
  }

  if (uitkomst.soort === "conflict_meerdere_trainers") {
    // Spec §21 — NOOIT de interne reden aan de beller prijsgeven.
    return afwijzenMetMelding(
      payload,
      oproep.id,
      "conflict_meerdere_trainers",
      "Nummer gekoppeld aan meerdere actieve trainers (legacy-dataconflict) — geblokkeerd, zie spec §21.",
      "Er is een probleem met het herkennen van je account. Neem contact op met MijnLeerlijn.",
      { ruwNummer: vanNummerRuw, nummerVerborgen: false }
    );
  }

  if (uitkomst.soort === "niet_in_pilot") {
    return afwijzenMetMelding(
      payload,
      oproep.id,
      "trainer_niet_pilot",
      "Trainer herkend maar telefonieActief=false (nog geen pilot-toegang).",
      `Hallo ${voornaam(uitkomst.trainer.name)}. Telefonische verslaglegging is nog niet beschikbaar voor jouw account.`,
      { ruwNummer: vanNummerRuw, nummerVerborgen: false, trainerId: uitkomst.trainer.id }
    );
  }

  const { trainer } = uitkomst;
  await zetTrainerHerkend(payload, oproep.id, {
    trainerId: trainer.id,
    ruwNummer: vanNummerRuw,
    genormaliseerdNummer: normaliseerNederlandsNummer(vanNummerRuw),
    nummerVerborgen: false,
  });

  // Spec §1/§6/§16 — DE centrale kandidatenlaag (./kandidaten.ts): recent +
  // uitgesloten wat al een verslag heeft, gesplitst in vandaag/ouder.
  const kandidaten = await haalTelefonieKandidaten(payload, trainer);
  return presenteerKandidaten(payload, oproep.id, `Hallo ${voornaam(trainer.name)}. `, kandidaten);
}

/**
 * Rondt een gekozen training af: verse her-resolutie, spec §7-racecheck
 * (bestaat er tussen het aanbieden en dit moment al een verslag — bv. door
 * een ander, bijna-gelijktijdig gesprek?), en zo niet: vastleggen +
 * opnemen starten met de exacte spec §8-tekst.
 */
async function kiesTrainingEnStartOpname(
  payload: Payload,
  oproepId: number,
  trainer: AuthTrainer,
  gekozen: OpgeslagenKandidaat,
  aangebodenKandidaten: OpgeslagenKandidaat[]
): Promise<VoiceInstructie[]> {
  // Her-resolutie server-side, ZELFDE ladder als de portal (spec §6: "de
  // gekozen training moet altijd eindigen op de echte bewezen centrale
  // training-ID/trainerboard-item-ID/Master-Data-school-ID") — de kandidaat
  // hierboven komt al uit die ladder (haalRecenteTrainingenVoorTelefonie +
  // haalAanvullendeTrainingenAlsSamenvattingen via haalTelefonieKandidaten),
  // dus dit is geen tweede interpretatie, uitsluitend een verse her-lezing
  // vlak vóór het vastleggen (nooit de eerder-gesnapshotte kandidaatgegevens
  // zelf als bron van waarheid gebruiken — die dienden uitsluitend om het
  // gesproken menu op te bouwen).
  //
  // Upsell-ronde (2026-09-02, spec §A5) — deze her-lezing moet exact
  // dezelfde TWEE bronnen samenvoegen als haalTelefonieKandidaten hierboven
  // (bewust niet die functie zelf hergebruikt: die filtert ook meteen op
  // "heeft al een verslag", wat vlak hieronder al apart en explicieter
  // gebeurt) — anders zou een gekozen AANVULLENDE training hier nooit
  // teruggevonden worden en de trainer ten onrechte "niet meer beschikbaar"
  // te horen krijgen.
  const [recentMonday, recentAanvullend] = await Promise.all([
    haalRecenteTrainingenVoorTelefonie(trainer),
    haalAanvullendeTrainingenAlsSamenvattingen(payload, trainer, { maxDagenGeleden: TELEFONIE_RECENTE_DAGEN }),
  ]);
  const alleKandidaten = [...recentMonday, ...recentAanvullend];
  const bevestigd = alleKandidaten.find((t) => t.id === gekozen.id);
  if (!bevestigd) {
    // Training bestaat niet meer in de verse resolutie (bv. inmiddels
    // geannuleerd tussen het aanbieden en de keuze) — nooit blind de
    // eerder-gesnapshotte gegevens vertrouwen.
    await zetMislukt(payload, oproepId, "geen_training_gevonden", "Gekozen training niet meer aanwezig in de verse resolutie op keuzemoment.");
    return [{ soort: "zeg_en_ophangen", tekst: "Deze training is niet meer beschikbaar. Open de traineromgeving om je verslag daar te maken.", reden: "geen_training_gevonden" }];
  }

  // Spec §7, laag 1 (best-effort, terwijl de trainer nog aan de lijn is): is
  // er tussen het aanbieden en dit keuzemoment al een verslag voor deze
  // training ontstaan (bv. een bijna-gelijktijdig tweede gesprek dat sneller
  // was)? Dit sluit het overgrote deel van het racevenster af. De
  // onvoorwaardelijke, structurele garantie ("nooit stilzwijgend
  // overschrijven") zit daarnaast — voor de zeldzame, écht gelijktijdige
  // rest van het venster — op upsertConcept() se eigen unique-index-
  // afhandeling (lib/trainers/verslag.ts), aangeroepen vanuit
  // verwerkTranscriptiepoging hieronder.
  const bestaandVerslag = await haalVerslagVoorTraining(payload, trainer, bevestigd.id);
  if (bestaandVerslag) {
    await zetVerslagBestaatAl(payload, oproepId, bestaandVerslag.id);
    return [
      {
        soort: "zeg_en_ophangen",
        tekst: "Voor deze training staat al een verslag klaar. Kies een andere training in de traineromgeving of bel opnieuw voor een andere training.",
        reden: "verslag_bestaat_al",
      },
    ];
  }

  await zetTrainingGekozen(payload, oproepId, {
    kandidaatTrainingen: aangebodenKandidaten,
    mondayTrainingId: bevestigd.id,
    mondaySchoolId: bevestigd.schoolId,
    mondayTrainerboardItemId: bevestigd.trainerboardItemId ?? "",
    schoolNaam: bevestigd.schoolNaam,
    trainingNaam: bevestigd.naam,
  });
  await zetOpnameVerwacht(payload, oproepId, 0);

  return [
    {
      soort: "zeg_en_neem_op",
      tekst: `Je maakt een verslag voor ${bevestigd.schoolNaam}. Spreek je verslag in na de piep. Sluit af met een hekje. Wil je opnieuw beginnen? Druk dan op het sterretje.`,
      actieUrl: pad(`opname-afgerond?oproepId=${oproepId}`),
      statusCallbackUrl: pad(`opname-status?oproepId=${oproepId}`),
      stopToets: OPNAME_STOP_TOETS,
      herstartToets: OPNAME_HERSTART_TOETS,
      poging: 0,
    },
  ];
}

/** Spec §1 stap 6-7 + §2/§3/§4/§15 se gelaagde DTMF-bevestiging/-keuze (zie het schema bovenaan dit bestand). */
export async function verwerkTrainingKeuze(
  payload: Payload,
  provider: TelefonieProvider,
  oproepId: number,
  vormVelden: Record<string, string>
): Promise<VoiceInstructie[]> {
  if (!telefonieIsActief()) return NIET_BESCHIKBAAR;

  const oproep = (await payload.findByID({ collection: "trainer-telefonie-oproepen", id: oproepId, overrideAccess: true, depth: 0 })) as unknown as TrainerTelefonieOproepen | null;
  if (!oproep || !oproep.trainer) return NIET_BESCHIKBAAR; // kan structureel niet gebeuren via de eigen actieUrl, defensief

  const trainer = await haalAuthTrainerVoorId(payload, oproep.trainer as number);
  if (!trainer) return NIET_BESCHIKBAAR; // trainer inmiddels verwijderd/gedeactiveerd tussen herkenning en keuze — zelfde veilige afsluiting

  const { cijfers } = provider.ontleedGatherResultaat(vormVelden);
  const { fase, kandidaten } = ontleedOpgeslagenKandidaten(oproep.kandidaatTrainingen);

  const geenGeldigeKeuze = async (): Promise<VoiceInstructie[]> => {
    await zetMislukt(payload, oproepId, "geen_keuze_gemaakt", `Ongeldige/geen DTMF-invoer ontvangen ("${cijfers ?? ""}").`);
    return [{ soort: "zeg_en_ophangen", tekst: "Ik heb geen geldige keuze ontvangen. Probeer het later opnieuw.", reden: "geen_keuze_gemaakt" }];
  };

  // Precies één kandidaat in deze laag -> ja/nee-bevestiging (spec §2/§4).
  if (kandidaten.length === 1) {
    if (cijfers === "1") return kiesTrainingEnStartOpname(payload, oproepId, trainer, kandidaten[0]!, kandidaten);
    if (cijfers === "2") {
      // fase="vandaag": "nee" -> door naar de oudere laag (spec §3/§15).
      // fase="ouder": dit WAS al de laatste laag -> niets meer over (spec §14).
      if (fase === "vandaag") return gaNaarOudereLaag(payload, oproepId, trainer);
      return presenteerLaag(payload, oproepId, "ouder", [], false, "");
    }
    return geenGeldigeKeuze();
  }

  // Meerdere kandidaten -> genummerde keuze, plus (uitsluitend fase="vandaag") het escapecijfer.
  if (cijfers && cijfers !== OUDERE_TRAININGEN_TOETS) {
    const index = Number.parseInt(cijfers, 10) - 1;
    if (Number.isInteger(index) && index >= 0 && index < kandidaten.length) {
      return kiesTrainingEnStartOpname(payload, oproepId, trainer, kandidaten[index]!, kandidaten);
    }
  } else if (fase === "vandaag" && cijfers === OUDERE_TRAININGEN_TOETS) {
    return gaNaarOudereLaag(payload, oproepId, trainer);
  }

  return geenGeldigeKeuze();
}

/**
 * Spec §9/§10/§18 — de parallelle, stille "opname_toets"-gather die naast
 * elke actieve opname loopt (zie telnyx-provider.ts se voerInstructieUit):
 * '#' stopt en verwerkt, '*' wijst de huidige opname af en begint opnieuw
 * MET DEZELFDE gekozen training (keert nooit terug naar trainingkeuze).
 * Alleen relevant zolang de oproep daadwerkelijk op een opname wacht — een
 * laat/dubbel afgeleverd event voor een inmiddels al afgeronde/mislukte
 * oproep wordt stil genegeerd (spec §12/§24, geen fout).
 *
 * Live regressie-vervolgronde (2026-08-27/28) — inmiddels aangeroepen vanuit
 * TWEE onafhankelijke webhookeventtypes voor dezelfde fysieke toetsdruk
 * (call.dtmf.received, nu de primaire trigger, én call.gather.ended, dat als
 * fallback blijft functioneren — zie route.ts). Vóór de eigenlijke '#'/
 * '*'-afhandeling wordt daarom eerst atomisch geclaimd
 * (claimOpnameToetsVerwerking, oproep-state.ts) — een tweede aflevering van
 * DEZELFDE toetsdruk verliest die claim en krijgt stil `[]` terug, geen
 * tweede herstart/stop/afsluitboodschap. Zie de doc-comment bij
 * claimOpnameToetsVerwerking voor waarom dit NIET op heropnamePogingen zelf
 * kan steunen.
 */
export async function verwerkOpnameToets(
  payload: Payload,
  provider: TelefonieProvider,
  oproepId: number,
  vormVelden: Record<string, string>
): Promise<VoiceInstructie[]> {
  if (!telefonieIsActief()) return NIET_BESCHIKBAAR;

  const oproep = (await payload.findByID({ collection: "trainer-telefonie-oproepen", id: oproepId, overrideAccess: true, depth: 0 })) as unknown as TrainerTelefonieOproepen | null;
  if (!oproep || oproep.status !== "opname_verwacht") return [];

  const { cijfers, clientState } = provider.ontleedGatherResultaat(vormVelden);
  const huidigePoging = oproep.heropnamePogingen ?? 0;

  if (cijfers !== OPNAME_STOP_TOETS && cijfers !== OPNAME_HERSTART_TOETS) {
    // Ongeldig digit (kan structureel niet via valid_digits, defensief) of
    // een lege/timeout-gather — geen actie, geen claim nodig.
    return [];
  }

  // Zie de doc-comment hierboven — clientState ontbreekt uitsluitend bij een
  // gather van vóór deze ronde of een oproep zonder client_state (defensief,
  // zou bij deze provider niet moeten voorkomen): dan liever ongeclaimd
  // doorgaan (ongewijzigd t.o.v. vóór deze ronde) dan een legitieme
  // toetsdruk stil laten verdwijnen.
  if (clientState) {
    const gewonnen = await claimOpnameToetsVerwerking(payload, oproepId, clientState);
    if (!gewonnen) return []; // duplicaat van een al verwerkte toetsdruk — spec-eis "nooit dubbel verwerken"
  }

  if (cijfers === OPNAME_STOP_TOETS) {
    // Root-cause-fix productie-incident (2026-08-27, spec-eis §4/§5) —
    // markeer DEZE poging als bewust gestopt VOORDAT het stop_opname-
    // commando naar Telnyx gaat: race-vrij t.o.v. de resulterende
    // call.recording.saved (zie oproep-state.ts se zetBewustGestopt-
    // doc-comment voor de volledige redenering). Zonder deze markering zou
    // verwerkOpnameStatus dit niet kunnen onderscheiden van een automatische
    // stilte-/duurlimiet-stop.
    await zetBewustGestopt(payload, oproepId, huidigePoging);
    return [{ soort: "stop_opname", poging: huidigePoging }, ...(await verwerkOpnameAfgerond(payload, oproepId))];
  }

  if (cijfers === OPNAME_HERSTART_TOETS) {
    if (huidigePoging >= MAX_HEROPNAME_POGINGEN) {
      // Productieblocker-ronde (2026-08-26, spec §11 "# moet altijd blijven
      // werken") — de limiet is bereikt: de HUIDIGE opname blijft gewoon
      // geldig/lopend, NOOIT gestopt. Pauzeert 'm (telnyx-provider.ts se
      // zeg_en_hervat_opname-tak), spreekt de waarschuwing uit, en hervat +
      // herbewapent de gather pas na call.speak.ended (verwerkSpreekAfgerond
      // hieronder) — dus '#' blijft daarna gewoon actief. heropnamePogingen
      // blijft bewust ongewijzigd: er start geen nieuwe opname.
      return [
        {
          soort: "zeg_en_hervat_opname",
          tekst: "Je kunt niet nog een keer opnieuw beginnen. Ga verder met je huidige opname en sluit af met een hekje.",
          poging: huidigePoging,
          // Random i.p.v. een persistente teller: puur nodig om het
          // command_id van twee ACHTEREENVOLGENDE keren op de limiet van
          // elkaar te onderscheiden (huidigePoging blijft dan immers gelijk)
          // — zie provider.ts se zeg_en_hervat_opname-doc-comment voor de
          // volledige redenering. Date.now() alleen bleek in de praktijk
          // (en in een test, twee snelle sequentiële aanroepen binnen
          // dezelfde milliseconde) niet altijd uniek — Math.random() over
          // een groot bereik maakt een botsing verwaarloosbaar; dit hoeft
          // geen cryptografisch/persistent uniek getal te zijn, uitsluitend
          // command_id-onderscheid binnen één gesprek.
          nonce: Math.floor(Math.random() * 1e15),
        },
      ];
    }
    const volgendePoging = huidigePoging + 1;
    await zetOpnameVerwacht(payload, oproepId, volgendePoging);
    return [
      { soort: "stop_opname", poging: huidigePoging },
      {
        soort: "zeg_en_neem_op",
        tekst: "Geen probleem. We beginnen opnieuw. Spreek je verslag in na de piep en sluit af met een hekje.",
        actieUrl: pad(`opname-afgerond?oproepId=${oproepId}`),
        statusCallbackUrl: pad(`opname-status?oproepId=${oproepId}`),
        stopToets: OPNAME_STOP_TOETS,
        herstartToets: OPNAME_HERSTART_TOETS,
        poging: volgendePoging,
      },
    ];
  }

  return []; // onbereikbaar (cijfers is hier altijd '#' of '*', zie de guard bovenaan) — TypeScript kan dat hier niet afleiden, dus toch een expliciete afsluitende return.
}

/**
 * Productieblocker-ronde (2026-08-26) — spec "instructie moet volledig zijn
 * uitgesproken vóór opname start": de call.speak.ended-webhookafhandeling.
 * DE deterministische garantie (geen timing-gok): elke "zeg_en_neem_op"/
 * "zeg_en_hervat_opname"/"zeg_en_ophangen"-instructie spreekt UITSLUITEND de
 * tekst uit en codeert in client_state welke vervolgstap moet volgen; Telnyx
 * bevestigt via dit event, hard-gedocumenteerd als "Expected Webhooks" van
 * het speak-commando, dat de tekst daadwerkelijk volledig is afgespeeld —
 * pas DAN geeft deze functie de instructie terug die de opname start/hervat,
 * of (productie-regressieronde, 2026-08-27) de call daadwerkelijk ophangt.
 * Onherkenbare/ontbrekende client_state (bv. een speak-commando buiten deze
 * flow om) wordt stil genegeerd — dit event hoort dan niet bij een
 * sequencing die dit bestand beheert.
 */
export async function verwerkSpreekAfgerond(
  payload: Payload,
  provider: TelefonieProvider,
  oproepId: number,
  vormVelden: Record<string, string>
): Promise<VoiceInstructie[]> {
  if (!telefonieIsActief()) return NIET_BESCHIKBAAR;

  const { clientState } = provider.ontleedSpreekAfgerond(vormVelden);
  if (!clientState) return [];

  const gedecodeerd = Buffer.from(clientState, "base64").toString("utf8");
  const [actie, tweedeVeld, derdeVeld] = gedecodeerd.split(":");

  if (actie === "hangup_na_spraak") {
    // Productie-regressieronde (2026-08-27) — de terminale afsluiting: BEWUST
    // GEEN oproep-statuscontrole hier (in tegenstelling tot start_opname/
    // hervat_opname hieronder). Elke zeg_en_ophangen-aanroeper heeft de
    // eindstatus (mislukt/verslag_bestaat_al/...) al synchroon vóór deze
    // speak-instructie gezet — een check op status==="opname_verwacht" zou
    // die gevallen hier dus ten onrechte laten verzanden zonder ooit op te
    // hangen. Zelfs het afsluitende "Bedankt"-bericht (reden=opname_afgerond)
    // kan op dit moment een allang doorgeschoven status hebben
    // (transcriptie_bezig/concept_klaar/...), want transcriptie loopt async
    // parallel aan het uitspreken ervan — dit event levert hoe dan ook
    // uitsluitend het "nu pas ophangen"-signaal, ongeacht de huidige status.
    // Bescherming tegen een dubbel afgeleverd call.speak.ended-event loopt
    // via hetzelfde deterministische command_id-mechanisme als altijd (zie
    // telnyx-provider.ts se hangup_uitvoeren-tak) — geen aparte
    // applicatielaag-idempotentie nodig, dit event komt bovendien legitiem
    // maar één keer per gesprek voor.
    return [{ soort: "hangup_uitvoeren", reden: tweedeVeld || "onbekend" }];
  }

  const poging = Number.parseInt(tweedeVeld ?? "", 10);
  if (!Number.isInteger(poging)) return [];

  const oproep = (await payload.findByID({ collection: "trainer-telefonie-oproepen", id: oproepId, overrideAccess: true, depth: 0 })) as unknown as TrainerTelefonieOproepen | null;
  if (!oproep || oproep.status !== "opname_verwacht") return []; // niet (meer) relevant — spec §12/§24, stil, geen fout

  if (actie === "start_opname") {
    // Structureel kan dit niet verouderd zijn (zie provider.ts se
    // zeg_en_neem_op-doc-comment: er is geen actieve gather tussen het
    // spreken en dit event, dus geen '*'/'#' kan tussentijds een NIEUWERE
    // poging gestart hebben) — defensief toch bevestigen tegen de huidige
    // stand op de oproep, nooit blind vertrouwen op het meegegeven getal.
    if ((oproep.heropnamePogingen ?? 0) !== poging) return [];
    return [
      {
        soort: "opname_starten",
        maxDuurSeconden: MAX_OPNAME_DUUR_SECONDEN,
        stilteTimeoutSeconden: OPNAME_STILTE_TIMEOUT_SECONDEN,
        stopToets: OPNAME_STOP_TOETS,
        herstartToets: OPNAME_HERSTART_TOETS,
        poging,
      },
    ];
  }

  if (actie === "hervat_opname") {
    const nonce = Number.parseInt(derdeVeld ?? "", 10);
    return [
      {
        soort: "opname_hervatten",
        maxDuurSeconden: MAX_OPNAME_DUUR_SECONDEN,
        stopToets: OPNAME_STOP_TOETS,
        herstartToets: OPNAME_HERSTART_TOETS,
        poging,
        nonce: Number.isInteger(nonce) ? nonce : 0,
      },
    ];
  }

  return [];
}

/**
 * Het afrondende gesproken "dank je"-bericht (spec §9) — puur de tekst, geen
 * verwerking hier (dat gebeurt async via verwerkOpnameStatus).
 * Providerneutraal, dus vanuit meerdere triggerpunten herbruikbaar: bij
 * Telnyx zowel vanuit een via '#' vroegtijdig gestopte opname
 * (verwerkOpnameToets hierboven) als vanuit de reguliere recording-saved-
 * afhandeling (zie app/api/trainers/telefonie/webhook/route.ts) — Telnyx
 * kent, anders dan Twilio's <Record action>, geen aparte "opname is zojuist
 * gestopt"-callback, dus de recording-saved-afhandeling blijft de enige
 * plek die dit bericht triggert wanneer '#' NOOIT werd ingedrukt (bv. bij
 * stilte-timeout/max-duur).
 *
 * Productieregressie-vervolgronde (2026-08-27, spec "na # hoor ik géén
 * afsluittekst meer") — root cause: doordat BEIDE triggerpunten hetzelfde
 * deterministische command_id opleveren op het onderliggende speak-commando
 * (zie telnyx-provider.ts se zeg_en_ophangen-tak), kon een near-simultane
 * tweede poging (record_stop via '#' leidt normaal ook tot een eigen
 * call.recording.saved) de eerste, daadwerkelijk hoorbare uitspraak
 * verstoren. Nu async + claim-gated via claimAfsluitboodschap
 * (oproep-state.ts): uitsluitend de trigger die de atomaire claim wint,
 * spreekt de boodschap daadwerkelijk uit — de andere krijgt stil `[]`, geen
 * fout, geen tweede speak-poging.
 */
export async function verwerkOpnameAfgerond(
  payload: Payload,
  oproepId: number,
  boodschap?: string,
  reden: string = "opname_afgerond"
): Promise<VoiceInstructie[]> {
  if (!telefonieIsActief()) return NIET_BESCHIKBAAR;
  const gewonnen = await claimAfsluitboodschap(payload, oproepId);
  if (!gewonnen) return [];
  return [
    {
      soort: "zeg_en_ophangen",
      // Root-cause-fix productie-incident (2026-08-27, spec-eis §7) —
      // optionele boodschap/reden, uitsluitend gebruikt voor de
      // max-opnameduur-afsluiting hieronder ("je hebt de limiet bereikt" is
      // een andere boodschap dan het gewone "bedankt"). Alle bestaande
      // aanroepers (bewuste '#'-afronding, de vervolgkeuze-afronding) laten
      // dit weg en krijgen exact de oorspronkelijke tekst — ongewijzigd
      // gedrag.
      tekst: boodschap ?? "Bedankt. Je verslag wordt verwerkt en staat straks voor je klaar om te controleren.",
      reden,
    },
  ];
}

/**
 * Root-cause-fix productie-incident (2026-08-27, spec-eis §4/§5/§7) —
 * bepaalt WAAROM een opnamefragment stopte: "bewust" (trainer drukte '#'),
 * "max_duur" (de opnamelimiet is bereikt) of "automatisch" (Telnyx' eigen
 * stilte-timeout — geen van beide andere twee). Bewust en max_duur zijn
 * beide EINDE-gesprek-triggers (spec §5/§7); automatisch is dat NIET meer
 * sinds deze ronde (spec §6) — zie verwerkTranscriptiepoging hieronder.
 *
 * Tolerantie van 1 seconde op de max-duur-vergelijking: Telnyx' eigen
 * recording_ended_at kan door afrondingsverschillen een fractie vóór de
 * exacte limiet liggen zonder dat dit feitelijk een stilte-stop was.
 */
export type OpnameAfsluitreden = "bewust" | "max_duur" | "automatisch";

function bepaalAfsluitreden(oproep: TrainerTelefonieOproepen, poging: number, duurSeconden: number | null): OpnameAfsluitreden {
  if (oproep.bewustGestoptPoging === poging) return "bewust";
  if (duurSeconden !== null && duurSeconden >= MAX_OPNAME_DUUR_SECONDEN - 1) return "max_duur";
  return "automatisch";
}

/**
 * Root-cause-fix productie-incident (2026-08-27, spec-eis §6/§10) — voegt
 * een zojuist getranscribeerd fragment toe aan het (eventueel al bestaande)
 * concept van DEZE oproep, in plaats van het te overschrijven. Hergebruikt
 * upsertConcept() se BESTAANDE race-bescherming volledig ongewijzigd (een
 * concept dat bij een ANDERE oproep hoort wordt hier nooit aangeraakt, zie
 * verslag.ts): als er al trainerInvoer van DEZE oproep staat, wordt het
 * nieuwe fragment er met een lege regel achter geplakt; anders is dit het
 * eerste (en voor een enkelvoudig gesprek: enige) fragment. Nooit een
 * eerder fragment overschrijven — uitsluitend toevoegen.
 */
async function voegFragmentToeAanConcept(payload: Payload, trainer: AuthTrainer, trainingId: string, oproepId: number, nieuweTekst: string): Promise<VerslagConceptUitkomst> {
  const bestaand = await haalVerslagVoorTraining(payload, trainer, trainingId);
  const samengevoegd = bestaand && bestaand.telefonieOproep === oproepId && bestaand.trainerInvoer ? `${bestaand.trainerInvoer}\n\n${nieuweTekst}` : nieuweTekst;
  return upsertConcept(payload, trainer, trainingId, { trainerInvoer: samengevoegd, bron: "telefoon", telefonieOproepId: oproepId });
}

/**
 * Root-cause-fix productie-incident (2026-08-27, spec-eis §6/§7/§8) — de
 * daadwerkelijke afronding zodra er GEEN fragment meer actief opgenomen/
 * getranscribeerd wordt: AI-structurering op de VOLLEDIGE, tot dan toe
 * samengevoegde trainerInvoer (dus over eventueel meerdere fragmenten heen),
 * concept_klaar, en pas dan audio-opruiming (spec §9: nooit vóórdat de
 * concepttekst al veilig staat). Aanroeper is zelf verantwoordelijk voor de
 * eenmalige claim hiervóór (claimFinalisatieZonderActiefFragment, of de
 * per-fragment-claim gevolgd door een bewuste/max_duur-uitkomst) — deze
 * functie claimt zelf niets, matcht daarmee verwerkTranscriptiepoging se
 * bestaande contract.
 *
 * Geen bruikbare trainerInvoer gevonden (bv. een hangup vóórdat ook maar één
 * fragment succesvol was) -> 'mislukt', geen lege verslagconcept aanmaken.
 */
async function finaliseerMetFragmenten(
  payload: Payload,
  provider: TelefonieProvider,
  trainer: AuthTrainer,
  oproep: TrainerTelefonieOproepen,
  mogelijkOnvolledig: boolean
): Promise<void> {
  const rij = await haalVerslagVoorTraining(payload, trainer, oproep.gekozenMondayTrainingId as string);
  if (!rij || rij.telefonieOproep !== oproep.id || !rij.trainerInvoer) {
    await zetMislukt(payload, oproep.id, "opname_mislukt", "Geen bruikbare inhoud verzameld vóór afronding.");
    return;
  }

  // Best-effort — zelfde degradatiepad als altijd: mislukte AI-structurering
  // laat trainerInvoer gewoon staan, de trainer kan in de portal alsnog zelf
  // op "Maak verslag" klikken.
  await structureerVerslag(payload, trainer, oproep.gekozenMondayTrainingId as string, rij.trainerInvoer);
  if (mogelijkOnvolledig) {
    await upsertConcept(payload, trainer, oproep.gekozenMondayTrainingId as string, { mogelijkOnvolledig: true });
  }
  await zetConceptKlaar(payload, oproep.id, { verslagId: rij.id, transcriptieLengte: rij.trainerInvoer.length, mogelijkOnvolledig });

  if (oproep.recordingProviderId) {
    try {
      await provider.verwijderOpname(oproep.recordingProviderId);
      await zetOpnameVerwijderd(payload, oproep.id);
    } catch (error) {
      console.error("[telefonie] opname verwijderen bij provider mislukt (concept staat al veilig lokaal):", error);
    }
  }
}

/**
 * De recordingStatusCallback — spec §1 stap 8-11: opname ophalen,
 * transcriberen, koppelen aan bestaande Ronde-3-verslag-AI. Root-cause-fix
 * productie-incident (2026-08-27) — geeft sinds deze ronde de vervolg-
 * VoiceInstructies terug (voorheen void): bij een automatische (stilte-)stop
 * moet de call NIET meer ophangen, maar een vervolgvraag stellen (spec-eis
 * §6), dus kan de webhookroute niet langer blind altijd hetzelfde
 * "bedankt+ophangen" na afloop aanroepen.
 */
export async function verwerkOpnameStatus(payload: Payload, provider: TelefonieProvider, oproepId: number, vormVelden: Record<string, string>): Promise<VoiceInstructie[]> {
  if (!telefonieIsActief()) return NIET_BESCHIKBAAR;

  const vooraf = (await payload.findByID({ collection: "trainer-telefonie-oproepen", id: oproepId, overrideAccess: true, depth: 0 })) as unknown as TrainerTelefonieOproepen | null;
  if (!vooraf || !vooraf.trainer || !vooraf.gekozenMondayTrainingId) return []; // kan structureel niet gebeuren via de eigen flow, defensief

  const status = provider.ontleedOpnameStatus(vormVelden);

  // Spec §10/§12/§18 — een via '*' AFGEWEZEN opnamepoging mag nooit alsnog
  // verwerkt worden, ook niet als haar webhook vertraagd/laat binnenkomt (bv.
  // nadat er intussen alweer een volgende poging gestart of zelfs al
  // afgerond is). client_state draagt het pogingnummer van het moment van
  // opnemen (telnyx-provider.ts se voerInstructieUit); wijkt dat af van de
  // HUIDIGE stand op de oproep, dan hoort dit event bij een inmiddels
  // gesuperseded poging — stil negeren, geen fout (dit is verwacht gedrag
  // zodra een trainer '*' gebruikt, geen storing). Ontbrekend/onherkenbaar
  // client_state (zou bij deze provider niet moeten voorkomen — elke
  // record_start hierboven zet het altijd) faalt bewust NIET dicht: liever
  // ongewijzigd doorgaan dan een oproep permanent laten vaststaan op een
  // veronderstelling die niet standhoudt.
  const huidigePoging = vooraf.heropnamePogingen ?? 0;
  if (status.clientState) {
    const pogingVanEvent = Number.parseInt(Buffer.from(status.clientState, "base64").toString("utf8"), 10);
    if (Number.isInteger(pogingVanEvent) && pogingVanEvent !== huidigePoging) return [];
  }

  const trainer = await haalAuthTrainerVoorId(payload, vooraf.trainer as number);
  if (!trainer) {
    await zetMislukt(payload, oproepId, "onbekende_fout", "Trainer niet meer vindbaar op het moment van opnameverwerking.");
    return await verwerkOpnameAfgerond(payload, oproepId);
  }

  if (status.status === "mislukt" || !status.ophaalReferentie) {
    // Root-cause-fix productie-incident (2026-08-27, spec-eis §10) — anders
    // dan vóór deze ronde: als er al een eerder fragment succesvol is
    // toegevoegd (bv. fragment 2 mislukt bij Telnyx nadat fragment 1 al
    // veilig staat), gaat dat fragment niet verloren — afronden met wat er
    // al is (mogelijkOnvolledig), i.p.v. de hele oproep als mislukt te
    // markeren. Zelfde eenmalige claim als de vervolgkeuze-afronding
    // hieronder (claimFinalisatieZonderActiefFragment) — voorkomt dubbele
    // afronding bij een dubbel afgeleverd call.recording.error-event.
    const gewonnen = await claimFinalisatieZonderActiefFragment(payload, oproepId);
    if (!gewonnen) return [];
    const bestaandFragment = await haalVerslagVoorTraining(payload, trainer, vooraf.gekozenMondayTrainingId as string);
    if (bestaandFragment && bestaandFragment.telefonieOproep === oproepId && bestaandFragment.trainerInvoer) {
      await finaliseerMetFragmenten(payload, provider, trainer, vooraf, true);
    } else {
      await zetMislukt(payload, oproepId, "opname_mislukt", "Provider meldde een mislukte/lege opname.");
    }
    return await verwerkOpnameAfgerond(payload, oproepId);
  }

  const gewonnen = await claimOpnameFragmentVerwerking(payload, oproepId, {
    poging: huidigePoging,
    recordingProviderId: status.providerRecordingId,
    ophaalReferentie: status.ophaalReferentie,
    recordingStartedAt: status.recordingStartedAt,
  });
  if (!gewonnen) return []; // al (in behandeling) verwerkt door een eerdere/duplicaat-aanroep — spec §12/§18/§24/§10, stil, geen fout

  const afsluitreden = bepaalAfsluitreden(vooraf, huidigePoging, status.duurSeconden);
  await zetTranscriptieBezig(payload, oproepId, status.duurSeconden);

  // Her-lezen NA de claim (ONGEWIJZIGD t.o.v. vóór deze ronde) — claimOpname-
  // FragmentVerwerking schrijft opnameOphaalReferentie/recordingProviderId/
  // opnameHuidigePoging/opnameHuidigeRecordingStartedAt atomisch mee; de
  // "vooraf"-snapshot hierboven is daarvoor dus stale en mag nooit gebruikt
  // worden om te transcriberen.
  const oproep = (await payload.findByID({ collection: "trainer-telefonie-oproepen", id: oproepId, overrideAccess: true, depth: 0 })) as unknown as TrainerTelefonieOproepen;
  return await verwerkTranscriptiepoging(payload, provider, oproep, trainer, afsluitreden);
}

/**
 * Gedeelde transcriptiepoging (production-readiness-gate 1, 2026-08-25) —
 * gebruikt door zowel de recordingStatus-webhook (verwerkOpnameStatus
 * hierboven) als de onderhoudsronde (verwerkTelefonieOnderhoud hieronder).
 * Eén pad garandeert dat een automatische retry zich exact hetzelfde
 * gedraagt als de eerste poging: dezelfde upsertConcept()-aanroep (via
 * voegFragmentToeAanConcept), dus dezelfde find-or-create-garantie op
 * [trainer, mondayTrainingId] — een retry kan structureel geen tweede
 * concept maken, precies zoals een gewone dubbele webhook dat al niet kon
 * (spec-eis gate 1: "retries mogen nooit een tweede concept maken").
 *
 * oproep MOET al door de aanroeper geclaimd zijn naar status
 * 'transcriptie_bezig' (via claimOpnameFragmentVerwerking resp.
 * claimTranscriptieRetry) — deze functie claimt zelf niets.
 *
 * Root-cause-fix productie-incident (2026-08-27, spec-eis §6/§10) — geeft
 * sinds deze ronde VoiceInstructies terug i.p.v. void, en vertakt op
 * `afsluitreden`: "automatisch" (stilte-stop) rondt NIET af — het fragment
 * wordt toegevoegd, de oproep gaat naar 'opname_onderbroken' en de trainer
 * krijgt de vervolgkeuze-prompt (spec-eis §6). "bewust"/"max_duur" zijn wél
 * eindtriggers — audio wordt dan pas opgeruimd (spec §9: nooit eerder dan de
 * concepttekst zelf al veilig staat).
 */
async function verwerkTranscriptiepoging(
  payload: Payload,
  provider: TelefonieProvider,
  oproep: TrainerTelefonieOproepen,
  trainer: AuthTrainer,
  afsluitreden: OpnameAfsluitreden
): Promise<VoiceInstructie[]> {
  if (!oproep.opnameOphaalReferentie || !oproep.recordingProviderId) {
    // Structureel zeldzaam sinds claimOpnameFragmentVerwerking de
    // ophaalreferentie atomisch mét de claim zelf opslaat — defensief nooit
    // een download proberen zonder referentie (kan alleen nog bij zeer oude,
    // vóór deze ronde geclaimde rijen).
    await verwerkTranscriptieMislukking(payload, provider, oproep, new Error("Geen opname-ophaalreferentie bekend."));
    return [];
  }

  let transcript: string;
  try {
    // fragmentSelectie (spec-eis §10) — precieze herselectie via Telnyx' eigen
    // recording_started_at van DIT fragment, i.p.v. de "meest recente
    // opname"-heuristiek die bij meerdere fragmenten het verkeerde fragment
    // zou kunnen kiezen (zie provider.ts/telnyx-provider.ts se toelichting).
    const audio = await provider.haalOpnameOp(oproep.opnameOphaalReferentie, { recordingStartedAt: oproep.opnameHuidigeRecordingStartedAt ?? null });
    transcript = await transcribeAudio(audio);
  } catch (error) {
    await verwerkTranscriptieMislukking(payload, provider, oproep, error);
    return [];
  }

  const conceptUitkomst = await voegFragmentToeAanConcept(payload, trainer, oproep.gekozenMondayTrainingId as string, oproep.id, transcript);
  if (conceptUitkomst.soort === "bestaat_al") {
    // Spec §7 — de zeldzame, écht gelijktijdige race die laag 1
    // (kiesTrainingEnStartOpname se voorcontrole) niet ving: een ANDER
    // gesprek (of de portal) legde de training tussen kiezen en dit
    // transcriptiemoment alsnog vast. Geen technische fout — zie
    // TrainerTelefonieOproepen.ts se status "verslag_bestaat_al".
    await zetVerslagBestaatAl(payload, oproep.id, conceptUitkomst.verslag.id);
    return await verwerkOpnameAfgerond(payload, oproep.id);
  }
  if (conceptUitkomst.soort !== "ok") {
    await zetMislukt(payload, oproep.id, "onbekende_fout", `upsertConcept: ${conceptUitkomst.soort} — ${"boodschap" in conceptUitkomst ? conceptUitkomst.boodschap : ""}`);
    return await verwerkOpnameAfgerond(payload, oproep.id);
  }

  if (afsluitreden === "automatisch") {
    // Spec-eis §6 — GEEN afronding: het fragment staat veilig, de oproep
    // wacht nu op de vervolgkeuze van de trainer (verwerkVervolgKeuze
    // hieronder). Audio blijft bewust bij Telnyx staan (er kan nog een
    // fragment bijkomen) — opgeruimd wordt pas bij de daadwerkelijke
    // afronding (finaliseerMetFragmenten), nooit tussentijds: een
    // tussentijdse opruiming zou bij Telnyx alle opnames van dit call_leg_id
    // verwijderen (verwijderOpname se documented gedrag), dus mogelijk ook
    // een op dat moment nog actieve/net gestarte volgende opname.
    await zetOpnameOnderbroken(payload, oproep.id);
    return [
      {
        soort: "zeg_en_kies_cijfers",
        tekst: "Ik heb een tijdje niets meer gehoord. Wil je verder inspreken? Druk dan op het sterretje. Ben je klaar met je verslag? Druk dan op het hekje.",
        actieUrl: pad(`vervolgkeuze?oproepId=${oproep.id}`),
        maxCijfers: 1,
        timeoutSeconden: VERVOLGKEUZE_TIMEOUT_SECONDEN,
        geldigeCijfers: `${VERVOLG_DOORGAAN_TOETS}${VERVOLG_AFRONDEN_TOETS}`,
      },
    ];
  }

  // afsluitreden is hier "bewust" of "max_duur" — dit was het laatste
  // fragment: AI-structurering op de VOLLEDIGE (eventueel samengevoegde)
  // trainerInvoer, nooit uitsluitend dit ene fragment (spec-eis §10).
  const volledigeTekst = conceptUitkomst.verslag.trainerInvoer ?? transcript;
  const mogelijkOnvolledig = afsluitreden === "max_duur";
  await structureerVerslag(payload, trainer, oproep.gekozenMondayTrainingId as string, volledigeTekst);
  if (mogelijkOnvolledig) {
    // Zonder deze aparte schrijving zou uitsluitend de OPROEP-rij (technisch
    // beheer) mogelijkOnvolledig=true krijgen via zetConceptKlaar hieronder —
    // de trainerportal (verslag-editor.tsx) en AdminVerslagLogboek.tsx lezen
    // echter het veld op de training-verslagen-rij zelf (spec-eis §9), zelfde
    // patroon als finaliseerMetFragmenten hierboven.
    await upsertConcept(payload, trainer, oproep.gekozenMondayTrainingId as string, { mogelijkOnvolledig: true });
  }
  await zetConceptKlaar(payload, oproep.id, {
    verslagId: conceptUitkomst.verslag.id,
    transcriptieLengte: volledigeTekst.length,
    mogelijkOnvolledig,
  });

  // Spec §9: audio bewaren zolang nodig voor transcriptie, daarna
  // verwijderen zodra transcriptie + concept veilig staan — best-effort,
  // MAG nooit de al-geslaagde conceptaanmaak alsnog als mislukt melden.
  try {
    await provider.verwijderOpname(oproep.recordingProviderId);
    await zetOpnameVerwijderd(payload, oproep.id);
  } catch (error) {
    console.error("[telefonie] opname verwijderen bij provider mislukt (concept staat al veilig lokaal):", error);
  }

  if (afsluitreden === "max_duur") {
    // Spec-eis §7 — expliciet ANDERE boodschap dan de gewone afronding: de
    // trainer moet weten dát de limiet is bereikt, niet alleen dat "het
    // verslag wordt verwerkt".
    return await verwerkOpnameAfgerond(
      payload,
      oproep.id,
      "Je hebt de maximale opnameduur bereikt. Je verslag tot dit punt is opgeslagen en wordt verwerkt.",
      "max_opnameduur_bereikt"
    );
  }
  return await verwerkOpnameAfgerond(payload, oproep.id);
}

/**
 * Root-cause-fix productie-incident (2026-08-27, spec-eis §6) — de '*'/'#'-
 * keuze in reactie op de vervolgkeuze-prompt ná een automatische
 * (stilte-)stop. Uitsluitend relevant zolang de oproep daadwerkelijk op deze
 * keuze wacht (status 'opname_onderbroken') — een laat/dubbel afgeleverd
 * event voor een inmiddels al afgeronde oproep wordt stil genegeerd, zelfde
 * patroon als verwerkOpnameToets.
 *
 * '*' (verder inspreken) start een NIEUW fragment (poging+1) — GEEN eigen
 * dedup-claim nodig: zetOpnameVerwacht herschrijft bij een dubbele aanroep
 * hooguit dezelfde waarde (idempotent), en het bijbehorende speak-commando
 * krijgt een deterministisch command_id per poging (telnyx-provider.ts),
 * dus Telnyx' eigen commando-deduplicatie voorkomt een dubbele uitspraak.
 * '#' (afronden) — of geen/ongeldig cijfer (timeout, spec-eis "nooit
 * eindeloos in stilte laten hangen") — rondt af via
 * claimFinalisatieZonderActiefFragment, DE atomaire eenmalige-claim tegen
 * een dubbel afgeleverd gather/dtmf-event.
 */
export async function verwerkVervolgKeuze(payload: Payload, provider: TelefonieProvider, oproepId: number, vormVelden: Record<string, string>): Promise<VoiceInstructie[]> {
  if (!telefonieIsActief()) return NIET_BESCHIKBAAR;

  const oproep = (await payload.findByID({ collection: "trainer-telefonie-oproepen", id: oproepId, overrideAccess: true, depth: 0 })) as unknown as TrainerTelefonieOproepen | null;
  if (!oproep || oproep.status !== "opname_onderbroken" || !oproep.trainer) return [];

  const { cijfers } = provider.ontleedGatherResultaat(vormVelden);

  if (cijfers === VERVOLG_DOORGAAN_TOETS) {
    const volgendePoging = (oproep.heropnamePogingen ?? 0) + 1;
    await zetOpnameVerwacht(payload, oproepId, volgendePoging);
    return [
      {
        soort: "zeg_en_neem_op",
        tekst: "Oké, spreek verder in na de piep en sluit af met een hekje.",
        actieUrl: pad(`opname-afgerond?oproepId=${oproepId}`),
        statusCallbackUrl: pad(`opname-status?oproepId=${oproepId}`),
        stopToets: OPNAME_STOP_TOETS,
        herstartToets: OPNAME_HERSTART_TOETS,
        poging: volgendePoging,
      },
    ];
  }

  const trainer = await haalAuthTrainerVoorId(payload, oproep.trainer as number);
  if (!trainer) {
    await zetMislukt(payload, oproepId, "onbekende_fout", "Trainer niet meer vindbaar bij vervolgkeuze.");
    return await verwerkOpnameAfgerond(payload, oproepId);
  }

  // cijfers === VERVOLG_AFRONDEN_TOETS ('#', expliciete bevestiging) OF geen/
  // ongeldig cijfer (gather-timeout) — in beide gevallen niets meer om op te
  // wachten. Alleen bij een expliciete '#' is dit een door de trainer
  // bevestigde afronding (spec-eis §9: dan NIET mogelijkOnvolledig); bij een
  // timeout is er geen bevestiging geweest.
  const gewonnen = await claimFinalisatieZonderActiefFragment(payload, oproepId);
  if (!gewonnen) return [];
  await finaliseerMetFragmenten(payload, provider, trainer, oproep, cijfers !== VERVOLG_AFRONDEN_TOETS);
  return await verwerkOpnameAfgerond(payload, oproepId);
}

/**
 * Root-cause-fix productie-incident (2026-08-27, spec-eis §8) — het
 * call.hangup-event: de beller (of Telnyx zelf) beëindigde de verbinding.
 * Slaat ALTIJD (onvoorwaardelijk) hangup_cause/hangup_source op, ongeacht of
 * de oproep verder nog iets te doen heeft (spec-eis: "sla op waar
 * mogelijk"). Rondt DAARNA best-effort af met wat er tot nu toe aan
 * trainerInvoer verzameld is, als de oproep nog niet was afgerond en er op
 * dit moment geen fragment actief wordt verwerkt (claimFinalisatieZonder-
 * ActiefFragment — laat een wél actief fragment gewoon zijn eigen traject
 * uitlopen, dat rondt zelf al af via verwerkTranscriptiepoging/
 * verwerkOpnameStatus). Geeft bewust GEEN VoiceInstructies terug — de
 * verbinding is op dit moment al weg, er valt niets meer te zeggen.
 */
export async function verwerkOnverwachteHangup(payload: Payload, provider: TelefonieProvider, oproepId: number, vormVelden: Record<string, string>): Promise<void> {
  if (!telefonieIsActief()) return;

  const gegevens = provider.ontleedHangup(vormVelden);
  await zetHangupInfo(payload, oproepId, { hangupCause: gegevens.hangupCause, hangupSource: gegevens.hangupSource });

  const oproep = (await payload.findByID({ collection: "trainer-telefonie-oproepen", id: oproepId, overrideAccess: true, depth: 0 })) as unknown as TrainerTelefonieOproepen | null;
  if (!oproep || !oproep.trainer || !oproep.gekozenMondayTrainingId) return; // niets af te ronden zonder trainer/training (bv. de beller hing al op vóór een training gekozen was)

  const gewonnen = await claimFinalisatieZonderActiefFragment(payload, oproepId);
  if (!gewonnen) return; // al afgerond, of een fragment wordt nog actief verwerkt — spec-eis "geen dubbele verwerking"

  const trainer = await haalAuthTrainerVoorId(payload, oproep.trainer as number);
  if (!trainer) {
    await zetMislukt(payload, oproepId, "onbekende_fout", "Trainer niet meer vindbaar bij onverwachte hangup.");
    return;
  }
  // mogelijkOnvolledig=true — een hangup is per definitie nooit een door de
  // trainer bevestigde afronding (spec-eis §9).
  await finaliseerMetFragmenten(payload, provider, trainer, oproep, true);
}

/**
 * Gate 1 — herstelbaar-of-definitief-mislukt, zie de MAX_TRANSCRIPTIE_
 * POGINGEN/MAX_BEWAARTERMIJN_MS-toelichting bovenaan dit bestand voor de
 * volledige motivatie van de gekozen grenzen. Bewust GEEN console.error met
 * de ruwe foutinhoud (spec-eis "geen transcriptie/audio in gewone logs") —
 * uitsluitend een generieke, contentloze regel; de begrensde foutmelding
 * zelf (max. 500 tekens, geen audio/transcript) staat al veilig in de
 * database via zetTranscriptieHerstelbaarMislukt/zetMislukt.
 */
async function verwerkTranscriptieMislukking(payload: Payload, provider: TelefonieProvider, oproep: TrainerTelefonieOproepen, error: unknown): Promise<void> {
  const pogingen = (oproep.transcriptiePogingen ?? 0) + 1;
  const ontvangenMs = new Date(oproep.ontvangenOp).getTime();
  const bewaartermijnVerstreken = Date.now() - ontvangenMs > MAX_BEWAARTERMIJN_MS;
  const boodschap = error instanceof Error ? error.message : String(error);
  console.error(`[telefonie] transcriptiepoging mislukt (oproepId=${oproep.id}, poging=${pogingen}/${MAX_TRANSCRIPTIE_POGINGEN})`);

  if (pogingen < MAX_TRANSCRIPTIE_POGINGEN && !bewaartermijnVerstreken) {
    await zetTranscriptieHerstelbaarMislukt(payload, oproep.id, {
      pogingen,
      volgendePogingOp: new Date(Date.now() + TRANSCRIPTIE_RETRY_DELAY_MS).toISOString(),
      foutmelding: boodschap,
    });
    return; // audio blijft bewust bewaard voor de volgende poging
  }

  // Uitgeput — pogingenbudget op óf bewaartermijn verstreken (welke van
  // de twee het eerst raakt wint, zie de constante-toelichting hierboven).
  // Definitief mislukt; audio nu actief opruimen, nooit onbeperkt laten staan.
  await zetMislukt(payload, oproep.id, bewaartermijnVerstreken ? "bewaartermijn_verstreken" : "transcriptie_mislukt", boodschap, { transcriptiePogingen: pogingen });
  if (oproep.recordingProviderId) {
    try {
      await provider.verwijderOpname(oproep.recordingProviderId);
      await zetOpnameVerwijderd(payload, oproep.id);
    } catch {
      console.error(`[telefonie] opname verwijderen na definitief mislukte transcriptie ook mislukt (oproepId=${oproep.id})`);
    }
  }
}

/**
 * De onderhoudsronde (production-readiness-gate 1) — cron-getriggerd (zie
 * app/api/trainers/telefonie/onderhoud/route.ts + vercel.json), GEEN
 * in-memory timer: hergebruikt de al-bestaande Vercel-Cron-scheduler-
 * primitive (zelfde patroon als app/api/sales/sync/route.ts, spec-eis
 * "gebruik bestaande scheduler/queue-primitives"). Pakt begrensd per aanroep
 * kandidaten op (ONDERHOUD_LIMIET_PER_CATEGORIE), claimt elke kandidaat
 * atomisch (claimTranscriptieRetry — voorkomt dat twee gelijktijdige
 * cronruns, of een cronrun samen met een laat-binnenkomende providerwebhook,
 * dezelfde rij dubbel oppakt — spec-eis "veilig voor serverless/
 * dubbele callbacks"), en verwerkt daarna via DEZELFDE
 * verwerkTranscriptiepoging() als de webhook-route.
 */
/**
 * Claimt en verwerkt precies één onderhoudskandidaat — de gedeelde kern
 * achter zowel de cron-onderhoudsronde (verwerkTelefonieOnderhoud) als een
 * door een beheerder handmatig getriggerde retry (verwerkTelefonieHandmatigeRetry
 * hieronder, 2026-08-25: admin-detailscherm, RetryTelefonieButton.tsx).
 * Geëxtraheerd uit wat voorheen de lus-body van verwerkTelefonieOnderhoud
 * was — GEEN gedragswijziging, uitsluitend herbruikbaar gemaakt zodat de
 * beheerder-actie nooit een eigen/tweede claim-of-verwerklogica krijgt.
 */
async function claimEnVerwerkOnderhoudsKandidaat(payload: Payload, provider: TelefonieProvider, oproepId: number, vastgelopenVoorTijdstip: string): Promise<boolean> {
  const gewonnen = await claimTranscriptieRetry(payload, oproepId, vastgelopenVoorTijdstip);
  if (!gewonnen) return false; // verloren aan een gelijktijdige aanroep, of inmiddels elders afgerond — stil, geen fout

  const oproep = (await payload.findByID({ collection: "trainer-telefonie-oproepen", id: oproepId, overrideAccess: true, depth: 0 })) as unknown as TrainerTelefonieOproepen | null;
  if (!oproep || !oproep.trainer || !oproep.gekozenMondayTrainingId) {
    await zetMislukt(payload, oproepId, "onbekende_fout", "Onderhoudsronde: geclaimde oproep zonder trainer/training.");
    return true;
  }
  const trainer = await haalAuthTrainerVoorId(payload, oproep.trainer as number);
  if (!trainer) {
    await zetMislukt(payload, oproepId, "onbekende_fout", "Onderhoudsronde: trainer niet meer vindbaar.");
    return true;
  }

  // Root-cause-fix productie-incident (2026-08-27, spec-eis §10) —
  // afsluitreden wordt hier herberekend uit wat de OORSPRONKELIJKE claim al
  // atomisch had vastgelegd (opnameHuidigePoging/bewustGestoptPoging/
  // recordingDuurSeconden) — een retry heeft zelf geen vers webhookevent,
  // dus geen eigen client_state/duurSeconden om uit te lezen. Het
  // resultaat van deze retry heeft (per constructie, zie de doc-comment bij
  // verwerkTelefonieOnderhoud/STUCK_TIMEOUT_MS) geen live gesprek meer om op
  // te reageren — de teruggegeven VoiceInstructies worden hier bewust
  // genegeerd, zelfde gedrag als vóór deze ronde.
  const afsluitreden = bepaalAfsluitreden(oproep, oproep.opnameHuidigePoging ?? oproep.heropnamePogingen ?? 0, oproep.recordingDuurSeconden ?? null);
  await verwerkTranscriptiepoging(payload, provider, oproep, trainer, afsluitreden);
  return true;
}

export async function verwerkTelefonieOnderhoud(payload: Payload, provider: TelefonieProvider): Promise<{ geclaimd: number }> {
  if (!telefonieIsActief()) return { geclaimd: 0 };

  const vastgelopenVoorTijdstip = new Date(Date.now() - STUCK_TIMEOUT_MS).toISOString();
  const kandidaten = await vindOnderhoudsKandidaten(payload, vastgelopenVoorTijdstip, ONDERHOUD_LIMIET_PER_CATEGORIE);

  let geclaimd = 0;
  for (const oproepId of kandidaten) {
    if (await claimEnVerwerkOnderhoudsKandidaat(payload, provider, oproepId, vastgelopenVoorTijdstip)) geclaimd += 1;
  }

  return { geclaimd };
}

export type HandmatigeRetryUitkomst = "geclaimd" | "niet_van_toepassing" | "nog_niet_zover";

/**
 * Admin-getriggerde retry (2026-08-25) voor PRECIES één oproep —
 * RetryTelefonieButton.tsx op het telefonie-oproep-detailscherm in Payload
 * Admin, via app/api/trainers/telefonie/oproepen/[id]/retry. Hergebruikt
 * claimEnVerwerkOnderhoudsKandidaat (dus claimTranscriptieRetry) VOLLEDIG
 * ONGEWIJZIGD — geen tweede/parallelle claim- of verwerklogica, dezelfde
 * atomaire garantie als de cron-onderhoudsronde.
 *
 * Bewust beperkt tot uitsluitend de geplande-herstelretry-categorie
 * (status='transcriptie_mislukt_herstelbaar', met een verstreken
 * volgende_transcriptiepoging — de voorcontrole hieronder is een snelle,
 * duidelijke UX-afwijzing; claimEnVerwerkOnderhoudsKandidaat herbevestigt
 * de conditie zelf atomisch, dus geen verzwakking van de garantie). NIET de
 * vastgelopen/crashherstel-categorie: die is bedoeld voor een écht
 * gecrashte serverless-aanroep, en een beheerder die op een willekeurig
 * moment op "probeer nu opnieuw" klikt zou anders een mogelijk nog
 * daadwerkelijk lopende poging kunnen kruisen.
 *
 * Voor 'mislukt' (terminale rijen, pogingenbudget op of bewaartermijn
 * verstreken) is BEWUST GEEN retrypad gebouwd — zie het opleverrapport voor
 * wat daarvoor nodig zou zijn (unaniem: een aparte, expliciet-beheerder-
 * geïnitieerde claimvariant + een besluit over het transcriptiePogingen-
 * budget bij een handmatige retry + een garantie dat de audio bij Telnyx
 * nog bestaat — bij een terminale rij is opnameVerwijderdOp vaak al gezet).
 */
export async function verwerkTelefonieHandmatigeRetry(payload: Payload, provider: TelefonieProvider, oproepId: number): Promise<HandmatigeRetryUitkomst> {
  if (!telefonieIsActief()) return "niet_van_toepassing";

  // disableErrors: true — anders dan de overige findByID-aanroepen in dit
  // bestand (die pas ná een geslaagde claim lezen, dus de rij per definitie
  // bestaat) kan dit ID hier een willekeurige, mogelijk niet-bestaande
  // waarde zijn (rechtstreeks van de URL-parameter in de admin-route).
  const oproep = (await payload.findByID({
    collection: "trainer-telefonie-oproepen",
    id: oproepId,
    overrideAccess: true,
    depth: 0,
    disableErrors: true,
  })) as unknown as TrainerTelefonieOproepen | null;
  if (!oproep || oproep.status !== "transcriptie_mislukt_herstelbaar") return "niet_van_toepassing";
  if (typeof oproep.volgendeTranscriptiepoging === "string" && oproep.volgendeTranscriptiepoging > new Date().toISOString()) {
    return "nog_niet_zover";
  }

  const gewonnen = await claimEnVerwerkOnderhoudsKandidaat(payload, provider, oproepId, new Date(Date.now() - STUCK_TIMEOUT_MS).toISOString());
  return gewonnen ? "geclaimd" : "niet_van_toepassing";
}
