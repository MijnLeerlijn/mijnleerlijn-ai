import { getPayload } from "payload";
import config from "../payload.config";

// Eenmalig diagnostisch script (2026-07-27): read-only lijst van
// kennisbasis-onderwerpen, bedoeld om via een echte Vercel-build tegen de
// productiedatabase te draaien — dezelfde bewezen-betrouwbare route als
// migrate-preflight.ts, omdat `vercel env run` aantoonbaar stilzwijgend op
// lokale .env-bestanden terugvalt voor Sensitive variabelen (DATABASE_URI
// incluis) en dus GEEN betrouwbare manier is om productie te bereiken.
// Wijzigt niets: uitsluitend payload.find (SELECT-equivalent).
//
// Sluit ALTIJD af met een non-zero exitcode — met opzet: dit script mag
// nooit per ongeluk als (deel van) een build doorlopen naar `next build`
// of een echte deploy. Zie vercel.json, tijdelijk hierop gezet en na
// gebruik weer teruggezet op het normale build:production.
process.env.PAYLOAD_MIGRATING = "true";

async function run() {
  const payload = await getPayload({ config });

  const resultaat = await payload.find({
    collection: "kennisbasis-onderwerpen",
    limit: 200,
    overrideAccess: true,
    depth: 0,
  });

  console.log(`[check-kennisbasis-onderwerpen] aantal onderwerpen: ${resultaat.docs.length}`);
  for (const doc of resultaat.docs) {
    console.log(
      `[check-kennisbasis-onderwerpen] id=${doc.id} onderwerp="${doc.onderwerp}" ` +
        `officieleTerm="${doc.officieleTerm}" status=${doc.status ?? "onbekend"}`
    );
  }

  process.exit(1);
}

run().catch((error) => {
  console.error("[check-kennisbasis-onderwerpen] Mislukt:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
