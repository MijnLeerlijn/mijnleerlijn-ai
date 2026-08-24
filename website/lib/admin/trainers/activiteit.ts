import { kortePreview, type ActiviteitSoort } from "@/lib/trainers/activiteit";
import type { AdminVerslagActiviteit, AdminLogboekItem, AdminMislukteTelefonieOproep, AdminTrainerAccount } from "./aggregatie";

// Traineromgeving V2, Fase 4 (2026-08-24) — admin-brede Activiteit (spec §6):
// "chronologische feed uit bestaande bronnen ... geen technische auditnoise."
// Spiegelt lib/trainers/activiteit.ts se merge-aanpak (verslagen + handmatige
// logboekitems), admin-breed toegepast, plus telefonie MAAR uitsluitend bij
// een betekenisvolle status (spec §6, letterlijk) — hier ingevuld als
// "definitief mislukt": een GESLAAGDE ingesproken oproep resulteert al in een
// eigen trainingsverslag-rij (bron="telefoon") en verschijnt dus al via de
// verslagen-tak hieronder; een aparte "concept_klaar"-telefonie-activiteit zou
// exact hetzelfde real-world moment dubbel in de feed zetten.
//
// Bewust GEEN bestandsuploads (spec §6 noemt dit expliciet optioneel, "indien
// eenvoudig beschikbaar") — er bestaat nog geen admin-brede
// trainer-bestanden-query (elke bestaande lib/trainers/bestanden.ts-functie
// is single-trainer/single-school-gescoped); toevoegen zou een nieuwe
// admin-brede Payload-query vereisen voor een door de opdracht zelf als
// optioneel gemarkeerd onderdeel — bewust uitgesteld, zie het opleverrapport.
//
// Bewust GEEN eigen databron/I/O: pure samenvoeging over de al-opgehaalde
// admin-brede aggregaten (spec §13).

export type AdminActiviteitSoort = ActiviteitSoort | "telefonie_mislukt";

export interface AdminActiviteitItem {
  soort: AdminActiviteitSoort;
  trainerId: number;
  trainerNaam: string;
  schoolId: string | null;
  schoolNaam: string;
  titel: string;
  wanneer: string;
}

function labelVoorVerslagActiviteit(bron: "portal" | "telefoon"): AdminActiviteitSoort {
  return bron === "telefoon" ? "telefonisch" : "training";
}

export function bouwAdminActiviteitFeed(
  verslagen: AdminVerslagActiviteit[],
  logboekitems: AdminLogboekItem[],
  misluktOproepen: AdminMislukteTelefonieOproep[],
  trainers: AdminTrainerAccount[],
  limiet: number
): AdminActiviteitItem[] {
  const trainerPerId = new Map(trainers.map((t) => [t.id, t]));
  const trainerNaam = (id: number | null): string => (id !== null ? (trainerPerId.get(id)?.naam ?? "Onbekende trainer") : "Onbekende trainer");

  const items: AdminActiviteitItem[] = [
    ...verslagen.map(
      (v): AdminActiviteitItem => ({
        soort: labelVoorVerslagActiviteit(v.bron),
        trainerId: v.trainerId,
        trainerNaam: trainerNaam(v.trainerId),
        schoolId: v.schoolId,
        schoolNaam: v.schoolNaam,
        titel: v.trainingNaam,
        wanneer: v.wanneer,
      })
    ),
    ...logboekitems.map(
      (item): AdminActiviteitItem => ({
        soort: item.type,
        trainerId: item.trainerId,
        trainerNaam: trainerNaam(item.trainerId),
        schoolId: item.mondaySchoolId,
        schoolNaam: item.schoolNaam ?? "Onbekende school",
        titel: item.trainingNaam ?? kortePreview(item.tekst),
        wanneer: item.occurredAt,
      })
    ),
    ...misluktOproepen
      .filter((o) => o.trainerId !== null && o.afgerondOp)
      .map(
        (o): AdminActiviteitItem => ({
          soort: "telefonie_mislukt",
          trainerId: o.trainerId as number,
          trainerNaam: trainerNaam(o.trainerId),
          schoolId: null,
          schoolNaam: o.gekozenSchoolNaam ?? "Onbekende school",
          titel: o.gekozenTrainingNaam ?? "Telefonische oproep",
          wanneer: o.afgerondOp as string,
        })
      ),
  ];

  return items.sort((a, b) => b.wanneer.localeCompare(a.wanneer)).slice(0, limiet);
}
