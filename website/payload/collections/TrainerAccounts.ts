import type { CollectionConfig } from "payload";
import { adminOnly } from "../access/roles";

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
    defaultColumns: ["name", "email", "mondayTrainerboardId", "actief"],
    group: "Basis — Technisch beheer",
    description: "Accounts voor trainers.mijnleerlijn.chat — nooit bruikbaar om in te loggen op de gewone /admin.",
  },
  access: {
    create: adminOnly,
    read: adminOnly,
    update: adminOnly,
    delete: adminOnly,
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
  ],
};
