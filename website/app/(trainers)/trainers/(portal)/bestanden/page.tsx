import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import { haalIngelogdeTrainer } from "@/lib/trainers/session";
import { haalMijnBestanden, haalMetMijGedeeldeBestanden } from "@/lib/trainers/bestanden";
import { haalActieveGroepenVoorTrainer } from "@/lib/trainers/groepen";
import { BestandenClient } from "./bestanden-client";

export const metadata = { title: "Bestanden — Trainerportal" };

// Traineromgeving V2, Fase 3 (2026-08-23) — algemene Bestanden-pagina (spec
// §2). Puur server-side auth-gate + drie lokale Payload-leesqueries (geen
// Monday-verkeer, i.t.t. de meeste andere trainerportal-pagina's — algemene
// trainerbestanden hebben geen schoolkoppeling). Schoolspecifieke bestanden
// staan bewust NIET hier (spec §8: "een schoolbestand hoort primair bij de
// school") — die leven uitsluitend onder Scholen → [school] → Bestanden.
export default async function TrainerBestandenPagina() {
  const trainer = await haalIngelogdeTrainer();
  if (!trainer) redirect("/login");

  const payload = await getPayload({ config });
  const [mijnBestanden, gedeeldeBestanden, groepen] = await Promise.all([
    haalMijnBestanden(payload, trainer),
    haalMetMijGedeeldeBestanden(payload, trainer),
    haalActieveGroepenVoorTrainer(payload, trainer),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-h1 font-bold text-donkerblauw">Bestanden</h1>
        <p className="mt-1 text-body-lg text-grijs-600">Algemeen trainingsmateriaal — eigen bestanden en bestanden die met je gedeeld zijn.</p>
      </div>

      <BestandenClient initieelMijnBestanden={mijnBestanden} initieelGedeeldeBestanden={gedeeldeBestanden} groepen={groepen} />
    </div>
  );
}
