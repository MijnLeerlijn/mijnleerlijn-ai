import { getPayload } from "payload";
import { sql } from "@payloadcms/db-postgres";
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
// Productieveiligheid (2026-08-19, incident productiemigratie
// "20260819_090000_trainers_v1" — zie het uitgebreide commentaar bovenaan
// dat migratiebestand voor de volledige analyse): een tabel die exact de
// naam van een auth-collectie draagt, maar Payload's eigen automatisch
// gegenereerde auth-kolommen (email/hash/salt/reset_password_token/
// login_attempts) volledig mist, kan onmogelijk door Payload zelf voor die
// collectie zijn aangemaakt — elke auth: true-collectie krijgt deze
// kolommen altijd, ongeacht eigen velden (zie referentieschema users/
// users_sessions in 20260721_135820_initial.ts). Zo'n tabel zou
// `payload migrate` alsnog laten falen: `CREATE TABLE IF NOT EXISTS` slaat
// de aanmaak dan stil over omdat de naam al bezet is, waarna een latere
// ALTER/CREATE INDEX op een ontbrekende kolom crasht — pas zichtbaar diep
// in de migratie-run, met een cryptische Postgres-foutmelding in plaats van
// een duidelijke.
//
// Bewuste scope-afbakening: dit is een generieke, goedkope eerste controle
// voor élke huidige én toekomstige auth-collectie (niet hard aan "trainers"
// gekoppeld), die uitsluitend "is dit uberhaupt een door Payload aangemaakte
// auth-tabel" beantwoordt. Het daadwerkelijke incident (een tabel die WEL
// de auth-vingerafdruk had, maar specifiek de twee Monday-ID-kolommen van
// de Trainers-collectie miste) wordt hier bewust NIET gedetecteerd — een
// generieke check die ALLE velden van ALLE collecties tegen de database
// verifieert, zou op een normale deploy die een nieuw veld + bijbehorende
// migratie in dezelfde commit toevoegt onterecht blokkeren (de migratie die
// die kolom toevoegt heeft dan simpelweg nog niet gedraaid op het moment
// dat deze preflight checkt). Die precieze, veilige controle hoort daarom
// thuis in de migratie zelf, die exact weet welke kolommen ze zelf gaat
// toevoegen — zie trainersTabelBestaat()/AUTH_VINGERAFDRUK_KOLOMMEN in
// 20260819_090000_trainers_v1.ts, die dat al doet.
const AUTH_VINGERAFDRUK_KOLOMMEN = ["email", "hash", "salt", "reset_password_token", "login_attempts"];

async function controleerAuthCollectieFingerprints(
  payload: Awaited<ReturnType<typeof getPayload>>
): Promise<string[]> {
  const problemen: string[] = [];

  for (const collection of Object.values(payload.collections)) {
    if (!collection.config.auth) continue;
    const tabelNaam = collection.config.slug;

    const tabelResultaat = await payload.db.drizzle.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${tabelNaam}
      ) AS "exists";
    `);
    const tabelBestaat = Boolean((tabelResultaat.rows[0] as { exists: boolean } | undefined)?.exists);
    if (!tabelBestaat) continue;

    const kolomResultaat = await payload.db.drizzle.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tabelNaam};
    `);
    const bestaandeKolommen = new Set(
      (kolomResultaat.rows as Array<{ column_name: string }>).map((rij) => rij.column_name)
    );
    const ontbrekend = AUTH_VINGERAFDRUK_KOLOMMEN.filter((kolom) => !bestaandeKolommen.has(kolom));

    if (ontbrekend.length > 0) {
      problemen.push(
        `  - "${tabelNaam}" (collectie "${collection.config.slug}"): mist ${ontbrekend.join(", ")}. ` +
          `Gevonden kolommen: ${[...bestaandeKolommen].sort().join(", ") || "(geen)"}.`
      );
    }
  }

  return problemen;
}

async function run() {
  const payload = await getPayload({ config });

  const fingerprintProblemen = await controleerAuthCollectieFingerprints(payload);
  if (fingerprintProblemen.length > 0) {
    console.error(
      "[migrate-preflight] GEBLOKKEERD: een of meer tabellen die overeenkomen met een auth-collectie bestaan al, " +
        "maar missen kolommen die Payload's auth-systeem altijd automatisch aanmaakt:\n\n" +
        fingerprintProblemen.join("\n") +
        "\n\nDit duidt op een tabel die niet (of niet volledig) door Payload's eigen migraties voor die " +
        "collectie is aangemaakt — mogelijk een andere, onbekende functie, of een eerdere onvolledige poging.\n" +
        "Onderzoek eerst handmatig wat deze tabel is en waar hij vandaan komt voordat je verder gaat.\n"
    );
    process.exit(1);
  }

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
    //
    // Bugfix (2026-08-19, ontdekt tijdens het testen van de slug-hernoeming
    // hierboven tegen een écht lege database): Drizzle's node-postgres-
    // adapter zet de onderliggende Postgres-foutmelding ("relation
    // \"payload_migrations\" does not exist") NIET in `error.message` zelf
    // (dat bevat alleen "Failed query: ..."), maar in `error.cause.message`.
    // De regex hieronder controleerde tot nu toe alleen `error.message` en
    // brak daardoor de build onterecht af bij precies het scenario dat dit
    // blok bedoelt te tolereren — leeg gebleven omdat elke eerder geteste
    // database hier altijd al een payload_migrations-tabel had (uit een
    // eerdere migratie-run). `boodschappen` doorloopt daarom nu ook de
    // `.cause`-keten.
    const boodschappen: string[] = [];
    let huidig: unknown = error;
    while (huidig instanceof Error) {
      boodschappen.push(huidig.message);
      huidig = huidig.cause;
    }
    if (boodschappen.length === 0) boodschappen.push(String(error));

    if (!boodschappen.some((boodschap) => /relation .* does not exist/i.test(boodschap))) {
      console.error(
        "[migrate-preflight] Onverwachte fout bij het controleren van payload-migrations:",
        boodschappen.join(" | ")
      );
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

  console.log(
    "[migrate-preflight] OK — geen batch: -1-record en geen auth-collectie-tabellen met ontbrekende " +
      "kernkolommen gevonden, veilig om te migreren."
  );
  process.exit(0);
}

run().catch((error) => {
  console.error("[migrate-preflight] Onverwacht mislukt:", error);
  process.exit(1);
});
