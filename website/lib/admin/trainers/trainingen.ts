import { bepaalWeergaveStatus, type TrainingWeergaveStatus } from "@/lib/trainers/training-weergave";
import { vandaagIsoAmsterdam, type AdminTrainerMondayOverzicht } from "@/lib/trainers/monday-links";
import type { VerslagRecord } from "@/lib/trainers/verslag";
import type { AdminVerslagActiviteit, AdminTrainerAccount } from "./aggregatie";

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
}

/**
 * `verslagenActiviteit` komt uit haalRecenteVerslagActiviteitVoorAlleTrainers
 * (aggregatie.ts) — dezelfde defensieve bovengrens (spec §13) als die
 * functie hanteert geldt dus ook hier: bij méér dan die bovengrens aan
 * TOTALE historische verslagen kan een zeer oude rij buiten de
 * meegegeven lijst vallen en hier als "nog geen verslag" tonen terwijl er in
 * werkelijkheid ooit wél één was. Aanvaard, gedocumenteerd randgeval — zie
 * het opleverrapport.
 */
export function bouwAdminTrainingenLijst(mondayOverzicht: AdminTrainerMondayOverzicht, trainers: AdminTrainerAccount[], verslagenActiviteit: AdminVerslagActiviteit[]): AdminTrainingRegel[] {
  const trainerPerMondayId = new Map(trainers.map((t) => [t.mondayUitvoerderItemId, t]));
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
      });
    }
  }

  // Chronologisch, meest recent eerst — filters (trainer/school/status/
  // periode/verslagstatus) past de aanroepende laag (API-route/UI) hierna
  // toe, zelfde scheiding als lib/admin/trainers/todo.ts.
  rijen.sort((a, b) => (b.datum ?? "").localeCompare(a.datum ?? ""));
  return rijen;
}
