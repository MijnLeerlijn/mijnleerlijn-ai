import type { Payload } from "payload";
import { haalStartbegeleidingScholen, haalStartbegeleidingSchool, type StartbegeleidingSchool } from "@/lib/trainers/startbegeleiding";
import { haalAlleTrainerAccounts, haalAlleOpenStartActiesVoorAlleTrainers, type AdminOpenStartactie } from "./aggregatie";

// Startbegeleiding-ronde (2026-09-02, spec §D/§13/§14) — admin-facing
// compositielaag boven lib/trainers/startbegeleiding.ts, zelfde rolverdeling
// als lib/admin/trainers/schooldetail.ts/trainerdetail.ts t.o.v. hun eigen
// lib/trainers/*-bronnen: de kernlogica (live Monday-lezen, AI-samenvatting,
// de twee acties) blijft in lib/trainers/startbegeleiding.ts — dit bestand
// voegt UITSLUITEND de admin-brede verrijking toe (trainernamen i.p.v. kale
// Monday-item-ID's, aantal openstaande acties) die de scholenlijst-/
// schooldetailpagina nodig heeft. Geen nieuwe Monday-aanroep: hergebruikt
// exact dezelfde ÉÉN-round-trip haalStartbegeleidingScholen()/
// haalStartbegeleidingSchool() en de al-bestaande admin-brede
// aggregatie.ts-queries (spec §13: geen N+1).

export interface AdminStartbegeleidingSchoolRegel extends StartbegeleidingSchool {
  gekoppeldeTrainerNamen: string[];
  aantalOpenStartActies: number;
}

/** Scholenlijst (spec §13) — verrijkt met trainernamen + open-actietelling, voor de kaartweergave. */
export async function haalAdminStartbegeleidingScholen(payload: Payload): Promise<AdminStartbegeleidingSchoolRegel[]> {
  const [scholen, trainers, openStartActies] = await Promise.all([haalStartbegeleidingScholen(), haalAlleTrainerAccounts(payload), haalAlleOpenStartActiesVoorAlleTrainers(payload)]);
  const trainerPerMondayId = new Map(trainers.map((t) => [t.mondayUitvoerderItemId, t]));

  const aantalOpenPerSchool = new Map<string, number>();
  for (const actie of openStartActies) {
    aantalOpenPerSchool.set(actie.mondaySchoolId, (aantalOpenPerSchool.get(actie.mondaySchoolId) ?? 0) + 1);
  }

  return scholen.map((school) => ({
    ...school,
    gekoppeldeTrainerNamen: school.gekoppeldeTrainerMondayIds.map((id) => trainerPerMondayId.get(id)?.naam ?? "Onbekende trainer"),
    aantalOpenStartActies: aantalOpenPerSchool.get(school.id) ?? 0,
  }));
}

export interface AdminStartbegeleidingTrainerOptie {
  id: number;
  naam: string;
  actief: boolean;
}

export interface AdminStartbegeleidingSchoolDetail {
  school: StartbegeleidingSchool;
  gekoppeldeTrainers: AdminStartbegeleidingTrainerOptie[];
  openStartActies: AdminOpenStartactie[];
  /** Alle trainers (ook inactieve — zelfde reden als upsell/route.ts se trainerOpties) voor de twee actieformulieren. */
  trainerOpties: AdminStartbegeleidingTrainerOptie[];
}

/** Schooldetail (spec §13/§E) — school + gekoppelde trainers + eigen open acties + trainerkeuzelijst, in twee round-trips (Monday-scholenlijst + admin-brede Payload-queries), geen extra per-school Monday-aanroep. */
export async function haalAdminStartbegeleidingSchoolDetail(payload: Payload, mondaySchoolId: string): Promise<AdminStartbegeleidingSchoolDetail | null> {
  const [school, trainers, alleOpenStartActies] = await Promise.all([haalStartbegeleidingSchool(mondaySchoolId), haalAlleTrainerAccounts(payload), haalAlleOpenStartActiesVoorAlleTrainers(payload)]);
  if (!school) return null;

  const trainerPerMondayId = new Map(trainers.map((t) => [t.mondayUitvoerderItemId, t]));
  const trainerOpties = trainers.map((t) => ({ id: t.id, naam: t.naam, actief: t.actief }));

  return {
    school,
    gekoppeldeTrainers: school.gekoppeldeTrainerMondayIds.map((id) => {
      const trainer = trainerPerMondayId.get(id);
      return trainer ? { id: trainer.id, naam: trainer.naam, actief: trainer.actief } : { id: -1, naam: "Onbekende trainer", actief: false };
    }),
    openStartActies: alleOpenStartActies.filter((actie) => actie.mondaySchoolId === mondaySchoolId),
    trainerOpties,
  };
}
