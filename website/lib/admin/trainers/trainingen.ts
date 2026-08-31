import { bepaalWeergaveStatus, type TrainingWeergaveStatus } from "@/lib/trainers/training-weergave";
import { vandaagIsoAmsterdam, type AdminTrainerMondayOverzicht } from "@/lib/trainers/monday-links";
import { codeerAanvullendeTrainingId } from "@/lib/trainers/aanvullende-trainingen";
import type { VerslagRecord } from "@/lib/trainers/verslag";
import type { AdminVerslagActiviteit, AdminTrainerAccount, AdminAanvullendeTraining } from "./aggregatie";

// Traineromgeving V2, Fase 4 (2026-08-24) — "Alle trainingen" adminbreed
// (spec §4). Rijniveau is (trainer, training) — niet uitsluitend training —
// omdat verslagstatus in dit datamodel altijd trainer+training-gescoped is
// (payload/collections/TrainingVerslagen.ts se unieke index op precies dat
// paar): een training met twee trainers (via twee scholen) heeft dus ook
// twee onafhankelijke verslagstatussen, en verdient daarom twee rijen — één
// rij die dat zou samenvoegen zou een van beide statussen moeten verzinnen.
//
// Bewust GEEN eigen databron: bouwt uitsluitend voort op de al-bestaande
// admin-brede Monday-/Payload-aggregaten (spec §13 — geen tweede Monday- of
// Payload-bevraging hier).

export interface AdminTrainingRegel {
  trainingId: string;
  trainingNaam: string;
  schoolId: string;
  schoolNaam: string;
  trainerId: number;
  trainerNaam: string;
  datum: string | null;
  weergaveStatus: TrainingWeergaveStatus;
  ruweStatusTekst: string | null;
  /** Null = deze trainer heeft nog geen verslagrij voor deze training gestart. */
  verslagStatus: VerslagRecord["status"] | null;
  verslagBron: "portal" | "telefoon" | null;
  /** Upsell-ronde (2026-09-02, spec §H/§10/§11/§12) — zelfde veld/waarden als TrainingSamenvatting.bron (lib/trainers/monday-links.ts): één robuuste herkomst-indicatie, geen tweede interpretatie. */
  bron: "mijnleerlijn" | "aanvullend";
}

/**
 * `verslagenActiviteit` komt uit haalRecenteVerslagActiviteitVoorAlleTrainers
 * (aggregatie.ts) — dezelfde defensieve bovengrens (spec §13) als die
 * functie hanteert geldt dus ook hier: bij méér dan die bovengrens aan
 * TOTALE historische verslagen kan een zeer oude rij buiten de
 * meegegeven lijst vallen en hier als "nog geen verslag" tonen terwijl er in
 * werkelijkheid ooit wél één was. Aanvaard, gedocumenteerd randgeval — zie
 * het opleverrapport.
 *
 * `aanvullendeTrainingen` (Upsell-ronde, 2026-09-02, spec §10/§11/§12) —
 * optioneel, admin-brede lijst uit aggregatie.ts se haalAlleAanvullendeTrainingen.
 * Elke aanroeper die de bestaande, Monday-only lijst wil (geen upsell-context
 * nodig) kan dit weglaten — geen bestaande aanroepplek breekt. Wordt hier
 * NIET via mondayOverzicht.trainingenPerTrainer verwerkt (aanvullende
 * trainingen bestaan nergens in Monday) maar in een eigen, tweede lus, op
 * dezelfde manier omgezet naar een AdminTrainingRegel — inclusief
 * codeerAanvullendeTrainingId zodat verslagPerTrainerTraining 'm op precies
 * dezelfde sleutel terugvindt als training-verslagen.mondayTrainingId
 * (verslag.ts se resolveerTrainingVoorMutatie schrijft daar al diezelfde
 * gecodeerde string naartoe — geen tweede sleutelconventie).
 */
export function bouwAdminTrainingenLijst(
  mondayOverzicht: AdminTrainerMondayOverzicht,
  trainers: AdminTrainerAccount[],
  verslagenActiviteit: AdminVerslagActiviteit[],
  aanvullendeTrainingen: AdminAanvullendeTraining[] = []
): AdminTrainingRegel[] {
  const trainerPerMondayId = new Map(trainers.map((t) => [t.mondayUitvoerderItemId, t]));
  const trainerPerId = new Map(trainers.map((t) => [t.id, t]));
  const verslagPerTrainerTraining = new Map(verslagenActiviteit.map((v) => [`${v.trainerId}:${v.mondayTrainingId}`, v]));
  const vandaag = vandaagIsoAmsterdam();

  const rijen: AdminTrainingRegel[] = [];
  for (const [mondayUitvoerderItemId, trainingen] of mondayOverzicht.trainingenPerTrainer) {
    const trainer = trainerPerMondayId.get(mondayUitvoerderItemId);
    if (!trainer) continue; // defensief — zie lib/admin/trainers/todo.ts se zelfde controle
    for (const training of trainingen) {
      const verslag = verslagPerTrainerTraining.get(`${trainer.id}:${training.id}`);
      rijen.push({
        trainingId: training.id,
        trainingNaam: training.naam,
        schoolId: training.schoolId,
        schoolNaam: training.schoolNaam,
        trainerId: trainer.id,
        trainerNaam: trainer.naam,
        datum: training.datum,
        weergaveStatus: bepaalWeergaveStatus(training, vandaag),
        ruweStatusTekst: training.ruweStatusTekst,
        verslagStatus: verslag?.status ?? null,
        verslagBron: verslag?.bron ?? null,
        // Startbegeleiding-ronde (2026-09-02) — TrainingSamenvatting.bron is
        // inmiddels breder ("startactie" erbij, monday-links.ts), maar elk
        // item in mondayOverzicht.trainingenPerTrainer is per constructie
        // altijd Monday-native (nooit een startactie-gesprek, die bestaan
        // uitsluitend in start-acties en worden hier bewust NOOIT ingevoegd —
        // zie de aparte lus voor aanvullende trainingen hieronder, die geen
        // startactie-equivalent heeft: een startactie-gesprek is geen
        // "training" in upsell-zin, spec §H). Letterlijke waarde i.p.v.
        // training.bron doorgeven houdt AdminTrainingRegel.bron doelbewust
        // op precies deze twee upsell-relevante waarden.
        bron: "mijnleerlijn",
      });
    }
  }

  for (const aanvullend of aanvullendeTrainingen) {
    const trainer = trainerPerId.get(aanvullend.trainerId);
    if (!trainer) continue; // defensief — zelfde reden als hierboven (bv. inmiddels verwijderd traineraccount)
    const trainingId = codeerAanvullendeTrainingId(aanvullend.id);
    const verslag = verslagPerTrainerTraining.get(`${trainer.id}:${trainingId}`);
    // logboekIngevuld heeft hier geen live Monday-checkbox om te lezen (zie
    // lib/trainers/aanvullende-trainingen.ts se haalAanvullendeTrainingenAlsSamenvattingen)
    // — zelfde afleiding hier: een bevestigd/voltooid verslag telt als "logboek ingevuld".
    const logboekIngevuld = verslag?.status === "bevestigd" || verslag?.status === "voltooid";
    rijen.push({
      trainingId,
      trainingNaam: aanvullend.naam,
      schoolId: aanvullend.mondaySchoolId,
      schoolNaam: aanvullend.schoolNaam ?? "Onbekende school",
      trainerId: trainer.id,
      trainerNaam: trainer.naam,
      datum: aanvullend.datum,
      weergaveStatus: bepaalWeergaveStatus({ status: "gepland", datum: aanvullend.datum, logboekIngevuld }, vandaag),
      ruweStatusTekst: null,
      verslagStatus: verslag?.status ?? null,
      verslagBron: verslag?.bron ?? null,
      bron: "aanvullend",
    });
  }

  // Chronologisch, meest recent eerst — filters (trainer/school/status/
  // periode/verslagstatus/bron) past de aanroepende laag (API-route/UI)
  // hierna toe, zelfde scheiding als lib/admin/trainers/todo.ts.
  rijen.sort((a, b) => (b.datum ?? "").localeCompare(a.datum ?? ""));
  return rijen;
}
