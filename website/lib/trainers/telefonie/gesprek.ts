import type { Payload } from "payload";
import { optionalEnv, getTrainersOrigin } from "@/config/env";
import type { TelefonieProvider, VoiceInstructie } from "./provider";
import { vindTrainerVoorTelefoonnummer, haalAuthTrainerVoorId } from "./trainer-lookup";
import { normaliseerNederlandsNummer } from "./nummer";
import { haalRecenteTrainingenVoorTelefonie, vandaagIsoAmsterdam } from "../monday-links";
import { upsertConcept, structureerVerslag } from "../verslag";
import { transcribeAudio } from "@/services/ai-client";
import {
  maakOfHaalOproep,
  zetTrainerHerkend,
  zetMislukt,
  zetKandidatenAangeboden,
  zetTrainingGekozen,
  zetOpnameVerwacht,
  claimOpnameVerwerking,
  zetTranscriptieBezig,
  zetConceptKlaar,
  type OproepFoutcode,
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

const MAX_KANDIDATEN_VOOR_KEUZE = 9; // één DTMF-cijfer per keuze
const GATHER_TIMEOUT_SECONDEN = 8;
const MAX_OPNAME_DUUR_SECONDEN = 900; // 15 minuten — bovengrens spec §8 ("10-15 minuten")
const OPNAME_STILTE_TIMEOUT_SECONDEN = 5;
const OPNAME_STOP_TOETS = "#";

function telefonieIsActief(): boolean {
  return optionalEnv("TRAINER_TELEFONIE_ENABLED") === "true";
}

function pad(route: string): string {
  return `${getTrainersOrigin()}/api/trainers/telefonie/${route}`;
}

function voornaam(naam: string): string {
  return naam.split(" ")[0] || naam;
}

/** "vandaag" / "gisteren" / "N dagen geleden" — voor het gesproken script (spec §5/§7-voorbeelden). */
function relatieveDagAanduiding(datumIso: string | null): string {
  if (!datumIso) return "onbekende datum";
  const vandaagMs = new Date(`${vandaagIsoAmsterdam()}T00:00:00Z`).getTime();
  const datumMs = new Date(`${datumIso}T00:00:00Z`).getTime();
  const dagen = Math.round((vandaagMs - datumMs) / (1000 * 60 * 60 * 24));
  if (dagen === 0) return "vandaag";
  if (dagen === 1) return "gisteren";
  return `${dagen} dagen geleden`;
}

const NIET_BESCHIKBAAR: VoiceInstructie[] = [{ soort: "zeg_en_ophangen", tekst: "Deze functie is nog niet beschikbaar." }];

async function afwijzenMetMelding(
  payload: Payload,
  oproepId: number,
  foutcode: OproepFoutcode,
  foutmelding: string,
  gesprokenTekst: string,
  extra: Parameters<typeof zetMislukt>[4] = {}
): Promise<VoiceInstructie[]> {
  await zetMislukt(payload, oproepId, foutcode, foutmelding, extra);
  return [{ soort: "zeg_en_ophangen", tekst: gesprokenTekst }];
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

  const kandidaten = await haalRecenteTrainingenVoorTelefonie(trainer);
  if (kandidaten.length === 0) {
    return afwijzenMetMelding(
      payload,
      oproep.id,
      "geen_training_gevonden",
      "Geen recente training gevonden voor deze trainer.",
      `Hallo ${voornaam(trainer.name)}. Ik kan geen recente training vinden die bij dit telefoonnummer hoort. Open de traineromgeving om je trainingen te controleren.`,
      { trainerId: trainer.id }
    );
  }

  const beperkt = kandidaten.slice(0, MAX_KANDIDATEN_VOOR_KEUZE);
  await zetKandidatenAangeboden(
    payload,
    oproep.id,
    beperkt.map((t) => ({ id: t.id, naam: t.naam, schoolNaam: t.schoolNaam, datum: t.datum }))
  );

  const groet = `Hallo ${voornaam(trainer.name)}.`;
  if (beperkt.length === 1) {
    const enige = beperkt[0]!;
    return [
      {
        soort: "zeg_en_kies_cijfers",
        tekst: `${groet} Ik zie één recente training: ${enige.schoolNaam}, ${relatieveDagAanduiding(enige.datum)}. Is dit de training waarvoor je een verslag wilt inspreken? Druk 1 voor ja, druk 2 voor nee.`,
        actieUrl: pad(`kies-training?oproepId=${oproep.id}`),
        maxCijfers: 1,
        timeoutSeconden: GATHER_TIMEOUT_SECONDEN,
      },
    ];
  }

  const opsomming = beperkt.map((t, i) => `Zeg ${i + 1} voor ${t.schoolNaam} van ${relatieveDagAanduiding(t.datum)}.`).join(" ");
  return [
    {
      soort: "zeg_en_kies_cijfers",
      tekst: `${groet} Ik zie ${beperkt.length} trainingen. ${opsomming}`,
      actieUrl: pad(`kies-training?oproepId=${oproep.id}`),
      maxCijfers: 1,
      timeoutSeconden: GATHER_TIMEOUT_SECONDEN,
    },
  ];
}

/** Spec §1 stap 6-7 + §5 se DTMF-bevestiging/-keuze. */
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
  const kandidaten = (oproep.kandidaatTrainingen ?? []) as { id: string; naam: string; schoolNaam: string; datum: string | null }[];

  let gekozen: { id: string; naam: string; schoolNaam: string; datum: string | null } | null = null;
  if (kandidaten.length === 1) {
    // Ja/nee-bevestiging (spec §7-voorbeeld: "druk 1 voor ja, druk 2 voor nee").
    if (cijfers === "1") gekozen = kandidaten[0]!;
  } else if (cijfers) {
    const index = Number.parseInt(cijfers, 10) - 1;
    if (Number.isInteger(index) && index >= 0 && index < kandidaten.length) gekozen = kandidaten[index]!;
  }

  if (!gekozen) {
    await zetMislukt(payload, oproepId, "geen_keuze_gemaakt", `Ongeldige/geen DTMF-invoer ontvangen ("${cijfers ?? ""}").`);
    return [{ soort: "zeg_en_ophangen", tekst: "Ik heb geen geldige keuze ontvangen. Probeer het later opnieuw." }];
  }

  // Her-resolutie server-side, ZELFDE ladder als de portal (spec §6: "de
  // gekozen training moet altijd eindigen op de echte bewezen centrale
  // training-ID/trainerboard-item-ID/Master-Data-school-ID") — de kandidaat
  // hierboven komt al uit die ladder (haalRecenteTrainingenVoorTelefonie),
  // dus dit is geen tweede interpretatie, uitsluitend een verse her-lezing
  // vlak vóór het vastleggen (nooit de eerder-gesnapshotte kandidaatgegevens
  // zelf als bron van waarheid gebruiken — die dienden uitsluitend om het
  // gesproken menu op te bouwen).
  const alleKandidaten = await haalRecenteTrainingenVoorTelefonie(trainer);
  const bevestigd = alleKandidaten.find((t) => t.id === gekozen!.id);
  if (!bevestigd) {
    // Training bestaat niet meer in de verse resolutie (bv. inmiddels
    // geannuleerd tussen het aanbieden en de keuze) — nooit blind de
    // eerder-gesnapshotte gegevens vertrouwen.
    await zetMislukt(payload, oproepId, "geen_training_gevonden", "Gekozen training niet meer aanwezig in de verse resolutie op keuzemoment.");
    return [{ soort: "zeg_en_ophangen", tekst: "Deze training is niet meer beschikbaar. Open de traineromgeving om je verslag daar te maken." }];
  }

  await zetTrainingGekozen(payload, oproepId, {
    kandidaatTrainingen: kandidaten,
    mondayTrainingId: bevestigd.id,
    mondaySchoolId: bevestigd.schoolId,
    mondayTrainerboardItemId: bevestigd.trainerboardItemId ?? "",
    schoolNaam: bevestigd.schoolNaam,
    trainingNaam: bevestigd.naam,
  });
  await zetOpnameVerwacht(payload, oproepId);

  return [
    {
      soort: "zeg_en_neem_op",
      tekst:
        "Vertel nu wat er tijdens de training is gebeurd. Je kunt gewoon vrij vertellen. Noem bijvoorbeeld wat je hebt behandeld, welke keuzes zijn gemaakt, wat goed ging, waar het team tegenaan liep en welke afspraken zijn gemaakt. Dit gesprek wordt opgenomen en verwerkt.",
      actieUrl: pad(`opname-afgerond?oproepId=${oproepId}`),
      statusCallbackUrl: pad(`opname-status?oproepId=${oproepId}`),
      maxDuurSeconden: MAX_OPNAME_DUUR_SECONDEN,
      stilteTimeoutSeconden: OPNAME_STILTE_TIMEOUT_SECONDEN,
      stopToets: OPNAME_STOP_TOETS,
    },
  ];
}

/** <Record> se action-URL — vuurt zodra de opname STOPT (niet per se al beschikbaar), puur voor het afrondende gesproken bericht (spec §7-voorbeeld). Geen verwerking hier — dat gebeurt async via verwerkOpnameStatus (recordingStatusCallback). */
export function verwerkOpnameAfgerond(): VoiceInstructie[] {
  if (!telefonieIsActief()) return NIET_BESCHIKBAAR;
  return [
    {
      soort: "zeg_en_ophangen",
      tekst: "Dank je. Ik heb je verslag ontvangen. Je kunt het concept straks controleren in de traineromgeving. Er is nog niets definitief opgeslagen in Monday.",
    },
  ];
}

/**
 * De recordingStatusCallback — spec §1 stap 8-11: opname ophalen,
 * transcriberen, koppelen aan bestaande Ronde-3-verslag-AI. Retourneert
 * niets aan de beller (die heeft al opgehangen/de goodbye-boodschap gehad
 * via verwerkOpnameAfgerond) — Twilio verwacht hier alleen een 200-status,
 * geen TwiML-inhoud.
 */
export async function verwerkOpnameStatus(payload: Payload, provider: TelefonieProvider, oproepId: number, vormVelden: Record<string, string>): Promise<void> {
  if (!telefonieIsActief()) return;

  const status = provider.ontleedOpnameStatus(vormVelden);
  if (status.status === "mislukt" || !status.ophaalReferentie) {
    await zetMislukt(payload, oproepId, "opname_mislukt", "Provider meldde een mislukte/lege opname.");
    return;
  }

  const gewonnen = await claimOpnameVerwerking(payload, oproepId, status.providerRecordingId);
  if (!gewonnen) return; // al (in behandeling) verwerkt door een eerdere/duplicaat-aanroep — spec §12/§18/§24, stil, geen fout

  const oproep = (await payload.findByID({ collection: "trainer-telefonie-oproepen", id: oproepId, overrideAccess: true, depth: 0 })) as unknown as TrainerTelefonieOproepen | null;
  if (!oproep || !oproep.trainer || !oproep.gekozenMondayTrainingId) {
    await zetMislukt(payload, oproepId, "onbekende_fout", "Opnamestatus ontvangen zonder een eerder gekozen training/trainer op de oproeprij.");
    return;
  }

  const trainer = await haalAuthTrainerVoorId(payload, oproep.trainer as number);
  if (!trainer) {
    await zetMislukt(payload, oproepId, "onbekende_fout", "Trainer niet meer vindbaar op het moment van opnameverwerking.");
    return;
  }

  await zetTranscriptieBezig(payload, oproepId, status.duurSeconden);

  let transcript: string;
  try {
    const audio = await provider.haalOpnameOp(status.ophaalReferentie);
    transcript = await transcribeAudio(audio);
  } catch (error) {
    await zetMislukt(payload, oproepId, "transcriptie_mislukt", error instanceof Error ? error.message : String(error));
    return;
  }

  try {
    const conceptUitkomst = await upsertConcept(payload, trainer, oproep.gekozenMondayTrainingId as string, {
      trainerInvoer: transcript,
      bron: "telefoon",
      telefonieOproepId: oproepId,
    });
    if (conceptUitkomst.soort !== "ok") {
      await zetMislukt(payload, oproepId, "onbekende_fout", `upsertConcept: ${conceptUitkomst.soort} — ${"boodschap" in conceptUitkomst ? conceptUitkomst.boodschap : ""}`);
      return;
    }

    // Best-effort — spec §14 se bekende degradatiepad: mislukt AI-structurering
    // (bv. tijdelijk onbereikbaar) laat trainerInvoer (de transcriptie) altijd
    // gewoon staan, de trainer kan in de portal alsnog zelf op "Maak verslag"
    // klikken (verslag-editor.tsx, ongewijzigde bestaande functionaliteit).
    // Nooit een fout hier de héle telefonieflow als mislukt markeren.
    await structureerVerslag(payload, trainer, oproep.gekozenMondayTrainingId as string, transcript);

    await zetConceptKlaar(payload, oproepId, { verslagId: conceptUitkomst.verslag.id, transcriptieLengte: transcript.length });
  } finally {
    // Spec §9: audio bewaren zolang nodig voor transcriptie, daarna
    // verwijderen zodra transcriptie + concept veilig staan — best-effort,
    // MAG nooit de al-geslaagde conceptaanmaak alsnog als mislukt melden.
    try {
      await provider.verwijderOpname(status.providerRecordingId);
    } catch (error) {
      console.error("[telefonie] opname verwijderen bij provider mislukt (concept staat al veilig lokaal):", error);
    }
  }
}
