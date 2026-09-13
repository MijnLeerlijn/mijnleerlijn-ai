import type { Payload } from "payload";
import {
  haalAlleTrainerAccounts,
  haalRecenteVerslagActiviteitVoorAlleTrainers,
  haalAlleAanvullendeTrainingen,
} from "@/lib/admin/trainers/aggregatie";
import { bouwAdminTrainingenLijst } from "@/lib/admin/trainers/trainingen";
import { haalTrainingenEnScholenVoorAlleTrainers } from "@/lib/trainers/monday-links";

export interface SalesTrainingPunt {
  label: string;
  waarde: number;
}

export interface SalesTrainingSamenvatting {
  mijnLeerlijnUitgevoerd: number;
  mijnLeerlijnGepland: number;
  nogInTePlannen: number;
  upsellTrainingen: number;
  scholenMetUpsell: number;
  mijnLeerlijnUitgevoerdPerMaand: SalesTrainingPunt[];
  mijnLeerlijnGeplandPerMaand: SalesTrainingPunt[];
  upsellPerMaand: SalesTrainingPunt[];
}

function maandSleutel(datum: string | null): string | null {
  if (!datum || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return null;
  return datum.slice(0, 7);
}

function maandLabel(sleutel: string): string {
  const [jaar, maand] = sleutel.split("-").map(Number);
  return new Intl.DateTimeFormat("nl-NL", { month: "short", year: "numeric", timeZone: "Europe/Amsterdam" })
    .format(new Date(Date.UTC(jaar, maand - 1, 1)));
}

function telPerMaand(map: Map<string, number>, sleutel: string | null) {
  if (!sleutel) return;
  map.set(sleutel, (map.get(sleutel) ?? 0) + 1);
}

function naarReeks(map: Map<string, number>): SalesTrainingPunt[] {
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sleutel, waarde]) => ({ label: maandLabel(sleutel), waarde }));
}

/**
 * Sales gebruikt exact dezelfde trainingsbron en statusafleiding als het
 * bestaande Trainer/Upsell-dashboard. Geen tweede Monday-querymodel of
 * alternatieve interpretatie van trainingstatussen.
 *
 * De geldige weergavestatussen komen rechtstreeks uit training-weergave.ts:
 * open, vandaag, komend, verslag_nog_invullen, gedaan en geannuleerd.
 */
export async function bouwSalesTrainingSamenvatting(payload: Payload): Promise<SalesTrainingSamenvatting> {
  const [trainers, mondayOverzicht, verslagenActiviteit, aanvullendeTrainingen] = await Promise.all([
    haalAlleTrainerAccounts(payload),
    haalTrainingenEnScholenVoorAlleTrainers(),
    haalRecenteVerslagActiviteitVoorAlleTrainers(payload),
    haalAlleAanvullendeTrainingen(payload),
  ]);

  const trainingen = bouwAdminTrainingenLijst(
    mondayOverzicht,
    trainers,
    verslagenActiviteit,
    aanvullendeTrainingen,
  );

  let mijnLeerlijnUitgevoerd = 0;
  let mijnLeerlijnGepland = 0;
  let nogInTePlannen = 0;
  let upsellTrainingen = 0;
  const upsellScholen = new Set<string>();
  const uitgevoerdPerMaand = new Map<string, number>();
  const geplandPerMaand = new Map<string, number>();
  const upsellPerMaand = new Map<string, number>();

  for (const training of trainingen) {
    if (training.weergaveStatus === "geannuleerd") continue;
    const maand = maandSleutel(training.datum);

    if (training.bron === "aanvullend") {
      upsellTrainingen++;
      upsellScholen.add(training.schoolId);
      telPerMaand(upsellPerMaand, maand);
      continue;
    }

    if (training.weergaveStatus === "open") {
      nogInTePlannen++;
      continue;
    }

    if (training.weergaveStatus === "komend" || training.weergaveStatus === "vandaag") {
      mijnLeerlijnGepland++;
      telPerMaand(geplandPerMaand, maand);
      continue;
    }

    if (training.weergaveStatus === "gedaan") {
      mijnLeerlijnUitgevoerd++;
      telPerMaand(uitgevoerdPerMaand, maand);
    }
  }

  return {
    mijnLeerlijnUitgevoerd,
    mijnLeerlijnGepland,
    nogInTePlannen,
    upsellTrainingen,
    scholenMetUpsell: upsellScholen.size,
    mijnLeerlijnUitgevoerdPerMaand: naarReeks(uitgevoerdPerMaand),
    mijnLeerlijnGeplandPerMaand: naarReeks(geplandPerMaand),
    upsellPerMaand: naarReeks(upsellPerMaand),
  };
}
