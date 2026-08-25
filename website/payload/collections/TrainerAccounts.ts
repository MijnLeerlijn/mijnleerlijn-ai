import type { CollectionConfig } from "payload";
import { adminOnly } from "../access/roles";
import { permissieOnly } from "../access/menu-permissions";
import { normaliseerNederlandsNummer } from "@/lib/trainers/telefonie/nummer";

// Traineromgeving V1, Ronde 1 (2026-08-19) — eigen auth-collectie voor
// trainers.mijnleerlijn.chat, structureel gescheiden van "users" (zie
// architectuurrapport §11):
//
// 1. NOOIT als payload.config.ts se `admin.user` geregistreerd — Payload
//    staat dan uitsluitend "users"-accounts toe om op /admin in te loggen,
//    framework-afgedwongen. Een trainer-accounts-account kan structureel
//    nooit in de gewone admin terechtkomen, ongeacht welke access-
//    controlecode hier ooit zou falen.
// 2. Het sessiecookie (payload-token) is een GLOBALE Payload-instelling
//    (cookiePrefix, zie node_modules/payload/dist/auth/cookies.js) — een
//    trainerssessie krijgt dus letterlijk dezelfde cookienaam als een
//    users-sessie. lib/trainers/auth.ts se verifyTrainerSessionCookie()
//    controleert daarom expliciet dat het JWT se collection-claim
//    letterlijk "trainer-accounts" is, nooit alleen cookie-aanwezigheid.
// 3. `access` hieronder is bewust volledig adminOnly, ook `read` — een
//    trainer raakt dit collectierecord in de portal NOOIT aan via Payload's
//    generieke REST-API; lib/trainers/auth.ts leest het eigen record
//    uitsluitend server-side via overrideAccess: true, ná de eigen
//    sessieverificatie hierboven. Kleinste mogelijke aanvalsoppervlak: geen
//    enkel Payload-REST-pad voor "trainer-accounts" is ooit vanuit de
//    browser bereikbaar voor een trainer zelf.
// 4. maxLoginAttempts/lockTime: native Payload-mechanisme i.p.v. een eigen
//    wrapper om /api/trainer-accounts/login — dat mechanisme bestaat
//    precies hiervoor en is al door Payload zelf getest/onderhouden.
//
// SLUG-INCIDENT (2026-08-19): deze collectie heette aanvankelijk "trainers".
// De productiedeploy faalde omdat er in productie al een tabel `trainers`
// bestaat — een bestaand, ongerelateerd technisch trainer-/boardmapping-
// mechanisme (kolommen als trainer_board_id/executor_item_id/
// master_id_column_id/status_column_id, géén Payload-authtabel), niet
// eerder bekend bij dit project. Die tabel blijft volledig onaangeraakt;
// deze collectie kreeg daarom de nieuwe, botsingsvrije slug
// "trainer-accounts" (tabel: trainer_accounts). Zie
// payload/migrations/20260819_100000_trainer_accounts_v1.ts voor de
// volledige analyse en de migratie zelf.
export const TrainerAccounts: CollectionConfig = {
  slug: "trainer-accounts",
  auth: {
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
  },
  labels: { singular: "Trainer-account", plural: "Trainer-accounts" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "email", "mondayTrainerboardId", "actief", "mobielNummer", "telefonieActief"],
    group: "Basis — Technisch beheer",
    description: "Accounts voor trainers.mijnleerlijn.chat — nooit bruikbaar om in te loggen op de gewone /admin.",
  },
  access: {
    create: permissieOnly("trainers.accounts", adminOnly),
    read: permissieOnly("trainers.accounts", adminOnly),
    update: permissieOnly("trainers.accounts", adminOnly),
    delete: permissieOnly("trainers.accounts", adminOnly),
  },
  // Herverificatieronde (na oplevering volledig traineraccountbeheer) — live
  // tegen echte Postgres getest en zo ontdekt: Payload's eigen loginOperation
  // kent geen concept "actief"/gedeactiveerd (dat is een veld dat DEZE
  // collectie zelf toevoegt) — zonder deze hook accepteert /api/trainer-
  // accounts/login (en dus ook payload.login()) een correct wachtwoord van
  // een gedeactiveerde trainer gewoon en geeft een geldig token terug. Elke
  // vervolgaanroep werd al wél correct geweigerd (lib/trainers/auth.ts se
  // verifyTrainerSessionCookie leest trainer.actief vers, zie aldaar) — een
  // gedeactiveerde trainer kon dus nooit daadwerkelijk iets GEBRUIKEN, maar
  // kreeg bij het inloggen zelf geen duidelijke melding en belandde pas na
  // een geslaagd ogende login weer terug op /login. Deze hook sluit dat gat
  // bij de bron, exact zoals het veld se eigen omschrijving hierboven al
  // belooft ("Uitgevinkt = kan niet meer inloggen"). Draait pas NA correcte
  // wachtwoordverificatie (Payload's loginOperation, geen eigen auth-hack) —
  // geen enkele informatie-asymmetrie t.o.v. een fout wachtwoord voor wie het
  // wachtwoord niet kent.
  hooks: {
    beforeLogin: [
      ({ user }) => {
        if (user && (user as { actief?: boolean }).actief === false) {
          throw new Error("Dit traineraccount is gedeactiveerd. Neem contact op met de beheerder.");
        }
        return user;
      },
    ],
  },
  fields: [
    { name: "name", type: "text", required: true, label: "Naam" },
    {
      name: "mondayTrainerboardId",
      type: "text",
      required: true,
      unique: true,
      label: "Monday-trainerboard-ID",
      admin: { description: "Board-ID van het persoonlijke trainerboard, bv. 18424768045 (\"Wessel - Trainingen\")." },
    },
    {
      name: "mondayUitvoerderItemId",
      type: "text",
      required: true,
      unique: true,
      label: "Monday-item-ID (5: Uitvoerder training)",
      admin: {
        description:
          "Item-ID van deze trainer op board \"5: Uitvoerder training\" (18420120602) — bepaalt via Master Data se Trainer-kolom welke scholen als \"Mijn scholen\" tonen (architectuurrapport §4).",
      },
    },
    {
      name: "actief",
      type: "checkbox",
      defaultValue: true,
      label: "Actief",
      admin: { description: "Uitgevinkt = kan niet meer inloggen, zonder het account te verwijderen." },
    },
    {
      name: "mobielNummer",
      type: "text",
      unique: true,
      label: "Mobiel nummer (telefonie)",
      admin: {
        description:
          "Genormaliseerd E.164-formaat, bv. +31612345678 (lib/trainers/telefonie/nummer.ts se normaliseerNederlandsNummer — altijd via die functie zetten, nooit ruwe invoer). Postgres' unique-index behandelt NULL als 'geen waarde, geen botsing' (meerdere trainers mogen dit dus leeg laten) — uniciteit geldt alleen zodra een nummer daadwerkelijk gezet is. Ronde 3.5 (2026-08-25): dit is uitsluitend een IDENTIFICATIESIGNAAL voor inkomende gesprekken (caller-ID is niet spoofing-bestendig) — geeft nooit rechtstreeks toestemming voor een definitieve Monday-write; alleen een concept aanmaken. Voor V1 alleen door een beheerder wijzigbaar (zie Profiel-pagina toelichting) — een zelfbedieningswijziging vereist eerst SMS-verificatie, nog niet gebouwd.",
      },
      // Vervolgronde (volledig traineraccountbeheer) — voorheen kon dit veld
      // alleen ooit correct gezet worden als de schrijvende code zelf al
      // netjes normaliseerNederlandsNummer aanriep (er bestond nog geen
      // enkele schrijfplek). Nu de admin dit veld via Payload's EIGEN
      // collectie-editor bewerkbaar heeft, normaliseert dit veld zichzelf —
      // ongeacht welke schrijfplek het aanroept (generieke admin-UI of een
      // eigen route) blijft lib/trainers/telefonie/trainer-lookup.ts se
      // exacte-matchquery zo altijd tegen een correct E.164-genormaliseerd
      // nummer werken (spec: "valideer formaat volgens bestaande
      // telefoniecode", "geen oude cache of duplicaat" — vindTrainerVoorTelefoonnummer
      // leest dit veld sowieso altijd vers, geen cache om te verversen).
      hooks: {
        beforeValidate: [
          ({ value }: { value?: string | null }) => {
            if (value === undefined || value === null || value.trim() === "") return value;
            const genormaliseerd = normaliseerNederlandsNummer(value);
            if (!genormaliseerd) {
              throw new Error("Ongeldig telefoonnummer — gebruik een geldig Nederlands mobiel nummer (bv. 06 12345678 of +31612345678).");
            }
            return genormaliseerd;
          },
        ],
      },
    },
    {
      name: "telefonieActief",
      type: "checkbox",
      defaultValue: false,
      label: "Telefonische verslaglegging (pilot)",
      admin: {
        description:
          "Ronde 3.5 (2026-08-25) — pilot-allowlist per trainer (spec §26), BEWUST geen hardcoded trainer-ID in businesslogica. Een trainer die telefonisch herkend wordt maar dit veld niet aan heeft staan, krijgt een nette 'nog niet beschikbaar'-melding, geen toegang tot trainingskeuze/opname.",
      },
    },
  ],
};
