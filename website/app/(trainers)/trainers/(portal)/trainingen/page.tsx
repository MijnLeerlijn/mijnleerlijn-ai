import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import { haalIngelogdeTrainer } from "@/lib/trainers/session";
import { haalAlleTrainingenVoorTrainer, vandaagIsoAmsterdam } from "@/lib/trainers/monday-links";
import { groepeerOpWeergaveStatus, type TrainingWeergaveStatus } from "@/lib/trainers/training-weergave";
import { haalAanvullendeTrainingenAlsSamenvattingen } from "@/lib/trainers/aanvullende-trainingen";
import { TrainingenSecties } from "./trainingen-secties";

export const metadata = { title: "Trainingen — Trainerportal" };

// Traineromgeving V2, Fase 1 (2026-08-28) — flat, chronologisch overzicht
// van ALLE trainingen van de trainer (opdrachtseis: "Bekijk alle
// trainingen"-CTA vanaf het dashboard + nieuw navigatie-item "Trainingen").
// Hergebruikt de BESTAANDE, al geteste bucket-indeling
// (groepeerOpWeergaveStatus, training-weergave.ts) i.p.v. een eigen, derde
// interpretatie van "wat betekent deze training nu" te bouwen — zelfde
// principe als dashboard/schooldetail. Secties in dezelfde prioriteitsvolgorde
// als die indeling zelf documenteert: verslag nog invullen > vandaag > komend
// > open (nog niet gepland) > gedaan > geannuleerd.
const SECTIE_VOLGORDE: { status: TrainingWeergaveStatus; titel: string }[] = [
  { status: "verslag_nog_invullen", titel: "Verslag nog invullen" },
  { status: "vandaag", titel: "Vandaag" },
  { status: "komend", titel: "Komend" },
  { status: "open", titel: "Nog niet gepland" },
  { status: "gedaan", titel: "Gedaan" },
  { status: "geannuleerd", titel: "Geannuleerd" },
];

export default async function TrainerTrainingenPage() {
  const trainer = await haalIngelogdeTrainer();
  if (!trainer) redirect("/login");

  // Upsell-ronde (2026-09-02, spec §A4) — aanvullende trainingen horen hier
  // net zo goed thuis ("zichtbaar in planning/trainingen") als een
  // Monday-training: zelfde TrainingMetSchool-vorm, dus zelfde
  // groepeerOpWeergaveStatus-indeling, geen tweede interpretatie.
  const payload = await getPayload({ config });
  const [mondayTrainingen, aanvullendeTrainingen] = await Promise.all([
    haalAlleTrainingenVoorTrainer(trainer),
    haalAanvullendeTrainingenAlsSamenvattingen(payload, trainer),
  ]);
  const alle = [...mondayTrainingen, ...aanvullendeTrainingen];
  const groepen = groepeerOpWeergaveStatus(alle, vandaagIsoAmsterdam());

  // Sectie-open/dicht-toestand is puur presentatie en leeft client-side
  // (trainingen-secties.tsx) — deze server-pagina blijft verantwoordelijk voor
  // databron, rechten en de gedeelde bucket-indeling, ongewijzigd t.o.v. vóór
  // de inklapbare koppen.
  const secties = SECTIE_VOLGORDE.filter(({ status }) => groepen[status].length > 0).map(({ status, titel }) => ({
    status,
    titel,
    trainingen: [...groepen[status]].sort((a, b) => (a.datum ?? "").localeCompare(b.datum ?? "")),
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-h1 font-bold text-donkerblauw">Trainingen</h1>
        <p className="mt-1 text-body-lg text-grijs-600">{alle.length === 0 ? "Nog geen trainingen gevonden." : `${alle.length} ${alle.length === 1 ? "training" : "trainingen"}`}</p>
      </div>

      {alle.length === 0 ? (
        <div className="rounded-xl border border-grijs-200 bg-white p-6 text-body-sm text-grijs-600 shadow-sm">
          Er zijn nog geen trainingen aan je scholen gekoppeld.
        </div>
      ) : (
        <TrainingenSecties secties={secties} />
      )}
    </div>
  );
}
