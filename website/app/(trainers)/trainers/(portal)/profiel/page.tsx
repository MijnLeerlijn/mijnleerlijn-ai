import { redirect } from "next/navigation";
import { getPayload } from "payload";
import { CircleUserRound, Mail, Phone } from "lucide-react";
import config from "@/payload.config";
import { haalIngelogdeTrainer } from "@/lib/trainers/session";
import { haalTelefonieProfiel } from "@/lib/trainers/telefonie/trainer-lookup";
import { WachtwoordForm } from "./wachtwoord-form";

export const metadata = { title: "Profiel — Trainerportal" };

// Ronde 1 — puur read-only accountoverzicht. Accountbeheer (naam/e-mail,
// koppeling aan Monday-ID's) blijft adminOnly (payload/collections/
// TrainerAccounts.ts se access-config) en heeft bewust geen zelfbedienings-
// scherm — geen functionaliteit tonen die niet bestaat. Correctieronde Admin
// Traineromgeving (2026-08-25) voegt HIER WEL zelfbediening toe voor het
// wachtwoord (WachtwoordForm hieronder, opdrachtseis) — dat is een bewuste,
// afzonderlijk geautoriseerde uitzondering (payload.login/payload.update via
// lib/trainers/wachtwoord.ts, nooit rechtstreeks via de collectie-access),
// geen algehele koerswijziging van de rest van dit read-only scherm.
//
// Mobiel nummer (Ronde 3.5, telefonie, spec §24) — zelfde reden: uitsluitend
// TONEN, geen zelfbedieningsformulier om het te wijzigen. Spec §24 liet
// expliciet de ruimte om wijzigen voorlopig adminOnly te houden "als
// SMS-verificatie te groot is voor deze scope" — dat is hier de keuze: een
// ongecontroleerd nieuw nummer zou anders direct caller-ID-gezag krijgen
// zonder enige verificatiestap, wat de hele telefonie-beveiligingsgrens
// (spec §2/§4) zou ondermijnen. Wijzigen loopt daarom voorlopig via de
// beheerder (Payload-admin, trainer-accounts).
export default async function TrainerProfielPage() {
  const trainer = await haalIngelogdeTrainer();
  if (!trainer) redirect("/login");

  const payload = await getPayload({ config });
  const telefonie = await haalTelefonieProfiel(payload, trainer.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-h1 font-bold text-donkerblauw">Profiel</h1>
        <p className="mt-1 text-body-lg text-grijs-600">Jouw accountgegevens.</p>
      </div>

      <div className="max-w-md rounded-xl border border-grijs-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3 border-b border-grijs-100 pb-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
            <CircleUserRound size={22} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-body-lg font-semibold text-grijs-900">{trainer.name}</p>
            <p className="text-body-sm text-grijs-600">Trainer</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-body-sm text-grijs-700">
          <Mail size={16} className="shrink-0 text-grijs-500" />
          {trainer.email || <span className="text-grijs-500">Geen e-mailadres bekend.</span>}
        </div>

        <div className="mt-2 flex items-center gap-2 text-body-sm text-grijs-700">
          <Phone size={16} className="shrink-0 text-grijs-500" />
          {telefonie.mobielNummer || <span className="text-grijs-500">Geen mobiel nummer bekend.</span>}
        </div>
        {telefonie.mobielNummer && (
          <p className="mt-1 pl-6 text-label text-grijs-500">
            {telefonie.telefonieActief
              ? "Gekoppeld voor telefonisch inspreken van verslagen."
              : "Nog niet actief voor telefonisch inspreken van verslagen."}{" "}
            Nummer onjuist of wijzigen nodig? Neem contact op met MijnLeerlijn.
          </p>
        )}
      </div>

      <WachtwoordForm />
    </div>
  );
}
