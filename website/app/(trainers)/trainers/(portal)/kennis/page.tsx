import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import { haalIngelogdeTrainer } from "@/lib/trainers/session";
import { haalGepubliceerdeKennisversies } from "@/lib/trainers/kennis";
import { KennisVraagBlok } from "./kennis-vraag-blok";
import { KennisLijstClient } from "./kennis-lijst-client";

export const metadata = { title: "Kennis — Trainerportal" };

// Vervolgronde (2026-08-22) — "Kennis" fase 1 (opdrachtseis): minimaal twee
// onderdelen. Vraag stellen staat BOVENAAN ("bovenaan of duidelijk
// zichtbaar", opdrachtseis) — Basiskennis (zoekbare lijst) daaronder. Deze
// pagina raakt uitsluitend lib/trainers/kennis.ts, dat op zijn beurt
// uitsluitend gepubliceerde trainer-kennisversies leest — geen school-,
// verslag-, logboek- of telefoniecontext hier of eronder.
export default async function TrainerKennisPage() {
  const trainer = await haalIngelogdeTrainer();
  if (!trainer) redirect("/login");

  const payload = await getPayload({ config });
  const kennisversies = await haalGepubliceerdeKennisversies(payload);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-h1 font-bold text-donkerblauw">Kennis</h1>
        <p className="mt-1 text-body-lg text-grijs-600">Basiskennis over MijnLeerlijn en onze werkwijze, geschreven voor trainers.</p>
      </div>

      <KennisVraagBlok />

      <div>
        <h2 className="mb-3 text-h3 font-semibold text-grijs-900">Basiskennis</h2>
        <KennisLijstClient kennisversies={kennisversies} />
      </div>
    </div>
  );
}
