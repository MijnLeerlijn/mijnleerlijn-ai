import { redirect } from "next/navigation";
import { CircleUserRound, Mail } from "lucide-react";
import { haalIngelogdeTrainer } from "@/lib/trainers/session";

export const metadata = { title: "Profiel — Trainerportal" };

// Ronde 1 — puur read-only accountoverzicht. Accountbeheer (naam/e-mail/
// wachtwoord wijzigen, koppeling aan Monday-ID's) blijft adminOnly
// (payload/collections/Trainers.ts se access-config) en heeft in deze ronde
// bewust geen zelfbedieningsscherm — geen functionaliteit tonen die niet
// bestaat.
export default async function TrainerProfielPage() {
  const trainer = await haalIngelogdeTrainer();
  if (!trainer) redirect("/login");

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
      </div>
    </div>
  );
}
