import type { TrainingSamenvatting } from "@/lib/trainers/monday-links";
import type { TrainingWeergaveStatus } from "@/lib/trainers/training-weergave";
import type { VerslagRecord } from "@/lib/trainers/verslag";
import { TrainingRij } from "./training-rij";

// Schooldetail-UX-ronde (2026-08-25) — geëxtraheerd uit page.tsx (was een
// inline TrainingenGroep-helper + losse SECTIE_VOLGORDE/SECTIE_TITEL-
// constantes) zodat de sectie-indeling, -volgorde, -telling en -weergave als
// zelfstandig, synchroon (dus rechtstreeks met React Testing Library
// testbaar) component bestaan — page.tsx zelf is een async server component
// en kan dat niet rechtstreeks zijn. Bewust GEEN wijziging aan de
// onderliggende indeling zelf (training-weergave.ts se groepeerOpWeergaveStatus,
// al aangeroepen door monday-links.ts se haalSchoolDetail) — uitsluitend de
// PRESENTATIE van dezelfde, al bestaande 6 buckets.
//
// Opdrachtseis (Michel, na live Ronde 3-test): sectiekoppen waren "te klein,
// verdwijnen tussen de trainingsregels" — elke kop krijgt hier nu een eigen
// band (achtergrond + rand + meer witruimte), een aantal ("Verslag nog
// invullen (2)") en een kleuraccent-stip die dezelfde kleurfamilie deelt als
// de statusbadges (status-styles.ts) — één samenhangend visueel systeem,
// geen los vijfde kleurenpalet. Alleen secties met daadwerkelijk trainingen
// worden getoond (ongewijzigd gedrag, was al zo via de vroegere
// `if (trainingen.length === 0) return null`).
const SECTIE_VOLGORDE: readonly TrainingWeergaveStatus[] = ["verslag_nog_invullen", "vandaag", "komend", "open", "gedaan", "geannuleerd"];

const SECTIE_TITEL: Record<TrainingWeergaveStatus, string> = {
  verslag_nog_invullen: "Verslag nog invullen",
  vandaag: "Vandaag",
  // "Komend" -> "Gepland" (opdrachtseis, Schooldetail-UX-ronde 2026-08-25):
  // deze bucket bevat exact de trainingen met een toekomstige datum, dus
  // "Gepland" dekt de lading beter voor een trainer dan het vage "Komend" —
  // zuivere labelwijziging, bepaalWeergaveStatus (training-weergave.ts)
  // blijft ongewijzigd.
  komend: "Gepland",
  open: "Nieuw",
  gedaan: "Gedaan",
  geannuleerd: "Geannuleerd",
};

/** Zelfde 4 kleurfamilies als lib/trainers/status-styles.ts — vandaag/gepland delen bewust de kleur van hun "eind"-status (resp. teal voor de aparte "vandaag"-attentie, blauw voor gepland) zodat het geheel als één systeem oogt, geen los vijfde/zesde palet. */
const SECTIE_ACCENT: Record<TrainingWeergaveStatus, string> = {
  verslag_nog_invullen: "bg-amber-500",
  vandaag: "bg-teal-500",
  komend: "bg-blue-500",
  open: "bg-grijs-400",
  gedaan: "bg-green-500",
  geannuleerd: "bg-red-500",
};

/** Rustige, consistente lege toestand (opdrachtseis: "geen grote lege kaarten of foutachtige styling") — hergebruikt door Trainingen/Logboek/Contactpersoon (page.tsx). */
export function LegeToestand({ tekst }: { tekst: string }) {
  return <p className="px-4 py-6 text-center text-body-sm text-grijs-500">{tekst}</p>;
}

function TrainingenGroep({
  sectie,
  trainingen,
  schoolId,
  verslagenPerTraining,
}: {
  sectie: TrainingWeergaveStatus;
  trainingen: TrainingSamenvatting[];
  schoolId: string;
  verslagenPerTraining: Map<string, VerslagRecord>;
}) {
  if (trainingen.length === 0) return null;
  const toonLogboekStatus = sectie === "verslag_nog_invullen" || sectie === "gedaan";
  return (
    <div className="overflow-hidden rounded-lg border border-grijs-200">
      <div className="flex items-center gap-2 border-b border-grijs-200 bg-grijs-50 px-3.5 py-2.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${SECTIE_ACCENT[sectie]}`} aria-hidden="true" />
        <h3 className="text-body-sm font-semibold text-grijs-800">
          {SECTIE_TITEL[sectie]} ({trainingen.length})
        </h3>
      </div>
      <ul className="flex flex-col divide-y divide-grijs-100 bg-white">
        {trainingen.map((training) => (
          <TrainingRij
            key={training.id}
            training={training}
            schoolId={schoolId}
            toonLogboekStatus={toonLogboekStatus}
            logboekIngevuld={training.logboekIngevuld}
            verslag={verslagenPerTraining.get(training.id)}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * Enige plek die de 6 weergavebuckets in de juiste, actiegerichte volgorde
 * omzet naar zichtbare secties (opdrachtseis: Verslag nog invullen -> Vandaag
 * -> Gepland -> Nieuw -> Gedaan -> Geannuleerd). Binnen elke sectie blijft de
 * trainingenlijst zelf ongewijzigd (alfabetisch, al zo aangeleverd door
 * haalSchoolDetail — deze component sorteert zelf niets).
 */
export function TrainingSecties({
  trainingen,
  schoolId,
  verslagenPerTraining,
}: {
  trainingen: Record<TrainingWeergaveStatus, TrainingSamenvatting[]>;
  schoolId: string;
  verslagenPerTraining: Map<string, VerslagRecord>;
}) {
  const heeftTrainingen = SECTIE_VOLGORDE.some((sectie) => trainingen[sectie].length > 0);
  if (!heeftTrainingen) {
    return <LegeToestand tekst="Geen trainingen bekend voor deze school." />;
  }
  return (
    <div className="flex flex-col gap-5 p-3.5">
      {SECTIE_VOLGORDE.map((sectie) => (
        <TrainingenGroep key={sectie} sectie={sectie} trainingen={trainingen[sectie]} schoolId={schoolId} verslagenPerTraining={verslagenPerTraining} />
      ))}
    </div>
  );
}
