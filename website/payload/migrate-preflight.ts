import { getPayload } from "payload";
import config from "../payload.config";

// Zonder dit zou dit "read-only" script buiten productie (NODE_ENV !==
// "production") zelf een dev-mode schema-push triggeren bij het
// initialiseren van Payload — precies het gedrag dat dit script controleert
// — en zo de batch: -1-marker die het detecteert stilzwijgend herschrijven.
// Zelfde vlag als payload/dist/bin/migrate.js zelf zet vóór het aanroepen
// van payload.init() (zie node_modules/@payloadcms/db-postgres/dist/
// connect.js: push-modus vereist NODE_ENV !== "production" ÉN
// PAYLOAD_MIGRATING !== "true"). In een echte Vercel-build staat NODE_ENV
// altijd al op "production", dus is dit daar sowieso al uitgesloten — dit
// is puur nodig om dit script ook lokaal daadwerkelijk read-only te laten
// zijn.
process.env.PAYLOAD_MIGRATING = "true";

// Productieveiligheid (2026-07-27): read-only voorcontrole vóór `payload
// migrate` in de productie-build (zie vercel.json + package.json's
// build:production). Wijzigt geen schema of data, toont geen secrets.
//
// AANLEIDING — bevestigd uit de exacte geïnstalleerde bron
// (node_modules/@payloadcms/drizzle@3.86.0/dist/migrate.js, volledig
// gelezen): `migrate()` toont een interactieve bevestigingsvraag zodra de
// `payload-migrations`-collectie een record met `batch: -1` bevat
// (geschreven door `next dev`'s dynamische schema-push). Zonder een
// TTY/stdin-antwoord hangt dat ONBEPAALD — empirisch bevestigd tijdens dit
// traject (een aanroep met /dev/null als stdin liep na 20+ seconden nog
// vast). Er bestaat geen --force/--yes-vlag voor het gewone
// migrate-commando (alleen migrate:create/migrate:fresh hebben
// forceAcceptWarning, migrate zelf niet — zie node_modules/payload/dist/
// bin/migrate.js). Blindweg "y" doorsturen naar élke interactieve vraag
// van dit commando is dus onwenselijk: dit script controleert in plaats
// daarvan vooraf, gericht en read-only exact dezelfde voorwaarde, en breekt
// de build met een duidelijke fout af i.p.v. de vraag ooit te laten
// verschijnen.
//
// WAT EEN BEVESTIGEND ANTWOORD ZOU DOEN (ter documentatie, uit dezelfde
// bron): het verwijdert of wijzigt GEEN data. Het filtert uitsluitend het
// batch: -1-record uit een in-memory array (`migrationsInDB = migrationsInDB
// .filter((m) => m.batch !== -1)`) zodat de batchnummering van echte,
// bestandsgedefinieerde migraties correct doorloopt — er is geen database-
// schrijfactie aan gekoppeld. Er is precies één `prompts()`-aanroep in dat
// bestand, uitsluitend gegate op deze batch: -1-conditie — dit script dekt
// dus het volledige interactieve oppervlak van `payload migrate` in deze
// versie.
async function run() {
  const payload = await getPayload({ config });

  let heeftDevModeMarker = false;
  try {
    const resultaat = await payload.find({
      collection: "payload-migrations",
      where: { batch: { equals: -1 } },
      limit: 1,
      overrideAccess: true,
      depth: 0,
    });
    heeftDevModeMarker = resultaat.docs.length > 0;
  } catch (error) {
    // De payload-migrations-tabel bestaat mogelijk nog niet (allereerste
    // migratie ooit op deze database) — dat is geen dev-mode-marker, gewoon
    // een lege/nieuwe staat, dus geen reden om de build te breken. Elke
    // andere fout (bv. geen databaseverbinding) moet dat wél doen.
    const boodschap = error instanceof Error ? error.message : String(error);
    if (!/relation .* does not exist/i.test(boodschap)) {
      console.error("[migrate-preflight] Onverwachte fout bij het controleren van payload-migrations:", boodschap);
      process.exit(1);
    }
  }

  if (heeftDevModeMarker) {
    console.error(
      "[migrate-preflight] GEBLOKKEERD: de payload-migrations-tabel bevat een batch: -1-record " +
        "(geschreven door `next dev`'s dynamische schema-push naar deze database).\n\n" +
        "Handmatige controle vereist vóór verdergaan:\n" +
        "  1. Bevestig of deze database ooit via `next dev` benaderd is (onverwacht op een echte productiedatabase).\n" +
        "  2. Is dat bevestigd en bedoeld: draai `payload migrate` handmatig en interactief tegen deze database\n" +
        "     om de vraag zelf te beantwoorden, buiten deze geautomatiseerde build om.\n" +
        "  3. Is dat NIET bevestigd/onverwacht: stop en onderzoek eerst hoe dit record hier terechtkwam voordat\n" +
        "     er iets migreert.\n"
    );
    process.exit(1);
  }

  console.log("[migrate-preflight] OK — geen batch: -1-record gevonden, veilig om te migreren.");
  process.exit(0);
}

run().catch((error) => {
  console.error("[migrate-preflight] Onverwacht mislukt:", error);
  process.exit(1);
});
