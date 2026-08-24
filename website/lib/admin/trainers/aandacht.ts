import type { AdminOpenVerslag, AdminMislukteTelefonieOproep, AdminTrainerAccount } from "./aggregatie";

// Traineromgeving V2, Fase 4 (2026-08-24) — admin-brede "Aandacht"-sectie
// (spec §7): "telefonie definitief mislukt; Monday-writeback vastgelopen;
// oude open concepten; eventueel trainer met veel oude oningevulde
// verslagen. Geen arbitraire nieuwe probleemstatussen zonder bestaande
// data." Elke categorie hieronder is dus letterlijk een REEDS BESTAAND,
// elders al gedefinieerd databegrip:
//  - telefonie_mislukt      = trainer-telefonie-oproepen.status === "mislukt"
//  - verslag_vastgelopen    = EXACT lib/trainers/verslag.ts se
//                             haalVerslagenDieAandachtNodigHebben-criterium
//                             (status in [gedeeltelijk, bevestigd])
//  - concept_oud            = status === "concept" ÉN ouder dan OUD_CONCEPT_DAGEN
// Geen nieuwe status wordt hier verzonnen — uitsluitend een leeftijdsgrens op
// een al bestaande status, en die grens is bewust een lokale constante (spec
// §7: "centraal en eenvoudig aanpasbaar").
//
// Bewust GEEN eigen databron/I/O: pure filtering over de al-opgehaalde
// admin-brede aggregaten (spec §13) — openVerslagen komt uit
// lib/admin/trainers/aggregatie.ts se haalOpenVerslagenVoorAlleTrainers, dat
// zelf al EXACT de status="concept"/"gedeeltelijk"/"bevestigd"-verzameling
// mirror't; hier wordt uitsluitend verder gefilterd/gegroepeerd.

/** Spec §7 default-voorstel — hier de ENE plek om aan te passen. */
export const OUD_CONCEPT_DAGEN = 7;

/** Vanaf hoeveel oude/vastgelopen verslagen een trainer zelf als aandachtspunt geldt — eveneens hier centraal aanpasbaar. */
export const VEEL_OUDE_VERSLAGEN_DREMPEL = 3;

export type AdminAandachtSoort = "telefonie_mislukt" | "verslag_vastgelopen" | "concept_oud";

export interface AdminAandachtItem {
  soort: AdminAandachtSoort;
  trainerId: number | null;
  trainerNaam: string;
  /** Traineromgeving V2, Fase 5 (2026-08-24) — additief, voor school-gescopeerde Aandacht (lib/admin/trainers/schooldetail.ts). Null blijft mogelijk: een mislukte oproep zonder gekozen school (spec-eis "geen arbitraire nieuwe status" — dit is en blijft gewoon een bestaand mogelijk-leeg veld). */
  schoolId: string | null;
  schoolNaam: string;
  titel: string;
  /** Moment waarop dit item is ontstaan/laatst gewijzigd — bepaalt de sortering (langst-lopend eerst). */
  wanneer: string;
  /** Korte, mensleesbare toelichting (foutmelding, of "X dagen niet bevestigd") — nooit de volledige technische foutdetail/audio/token (spec §15). */
  detail: string;
}

export interface AdminTrainerMetVeelOudeVerslagen {
  trainerId: number;
  trainerNaam: string;
  aantal: number;
}

export interface AdminAandachtOverzicht {
  items: AdminAandachtItem[];
  trainersMetVeelOudeVerslagen: AdminTrainerMetVeelOudeVerslagen[];
}

export function bouwAdminAandachtOverzicht(
  openVerslagen: AdminOpenVerslag[],
  misluktOproepen: AdminMislukteTelefonieOproep[],
  trainers: AdminTrainerAccount[],
  nu: Date = new Date()
): AdminAandachtOverzicht {
  const trainerPerId = new Map(trainers.map((t) => [t.id, t]));
  const oudeGrensIso = new Date(nu.getTime() - OUD_CONCEPT_DAGEN * 24 * 60 * 60 * 1000).toISOString();

  const vastgelopenVerslagen = openVerslagen.filter((v) => v.status === "gedeeltelijk" || v.status === "bevestigd");
  const oudeConcepten = openVerslagen.filter((v) => v.status === "concept" && v.wanneer < oudeGrensIso);

  const dagenOud = (wanneer: string): number => Math.floor((nu.getTime() - new Date(wanneer).getTime()) / (24 * 60 * 60 * 1000));

  const items: AdminAandachtItem[] = [
    ...misluktOproepen
      .filter((o) => o.afgerondOp)
      .map(
        (o): AdminAandachtItem => ({
          soort: "telefonie_mislukt",
          trainerId: o.trainerId,
          trainerNaam: o.trainerId !== null ? (trainerPerId.get(o.trainerId)?.naam ?? "Onbekende trainer") : "Onbekende trainer",
          schoolId: o.gekozenMondaySchoolId,
          schoolNaam: o.gekozenSchoolNaam ?? "Onbekende school",
          titel: o.gekozenTrainingNaam ?? "Telefonische oproep",
          wanneer: o.afgerondOp as string,
          detail: o.foutmelding ?? "Onbekende fout",
        })
      ),
    ...vastgelopenVerslagen.map(
      (v): AdminAandachtItem => ({
        soort: "verslag_vastgelopen",
        trainerId: v.trainerId,
        trainerNaam: v.trainerNaam,
        schoolId: v.schoolId,
        schoolNaam: v.schoolNaam,
        titel: v.trainingNaam,
        wanneer: v.wanneer,
        detail: v.status === "gedeeltelijk" ? "Eén van beide Monday-updates nog niet geschreven" : "Beide updates geschreven, afronding (status/logboek) nog niet voltooid",
      })
    ),
    ...oudeConcepten.map(
      (v): AdminAandachtItem => ({
        soort: "concept_oud",
        trainerId: v.trainerId,
        trainerNaam: v.trainerNaam,
        schoolId: v.schoolId,
        schoolNaam: v.schoolNaam,
        titel: v.trainingNaam,
        wanneer: v.wanneer,
        detail: `Al ${dagenOud(v.wanneer)} dagen niet bevestigd`,
      })
    ),
  ].sort((a, b) => a.wanneer.localeCompare(b.wanneer)); // langst-lopende/oudste eerst — meest urgent

  const tellingen = new Map<number, number>();
  for (const v of [...vastgelopenVerslagen, ...oudeConcepten]) {
    tellingen.set(v.trainerId, (tellingen.get(v.trainerId) ?? 0) + 1);
  }
  const trainersMetVeelOudeVerslagen: AdminTrainerMetVeelOudeVerslagen[] = Array.from(tellingen.entries())
    .filter(([, aantal]) => aantal >= VEEL_OUDE_VERSLAGEN_DREMPEL)
    .map(([trainerId, aantal]) => ({ trainerId, trainerNaam: trainerPerId.get(trainerId)?.naam ?? "Onbekende trainer", aantal }))
    .sort((a, b) => b.aantal - a.aantal);

  return { items, trainersMetVeelOudeVerslagen };
}
