import type { CollectionConfig } from "payload";
import { ownRecordAccess } from "../access/roles";

// Mijn Werk Fase 2 (2026-08-17) — per-gebruiker Google Calendar-koppeling
// (alleen-lezen). Bewust een Collection, geen Global zoals payload/globals/
// GmailConnection.ts: daar bestaat per definitie precies één (gedeeld,
// admin-only) helpdesk-account; hier koppelt ELKE gebruiker zijn EIGEN
// Google-account, dus is er per gebruiker hoogstens één rij. Eigenaar-
// gescoped via ownRecordAccess (roles.ts, zelfde patroon als
// PersonalTasks.ts) — ook een admin ziet hier nooit andermans koppeling.
//
// create/update staan hier BEIDE volledig dicht (`() => false`), anders dan
// PersonalTasks.ts (dat create: anyEditor gebruikt + een beforeChange-hook
// om `eigenaar` te forceren). Reden: de ENIGE legitieme schrijver is
// app/api/google/oauth/callback — een cross-site OAuth-redirect zonder
// bruikbare payload.auth()-sessie (zelfde documenteerde reden als GmailConnection
// se callback), die daarom altijd met overrideAccess: true schrijft. Native
// create/update via de gewone API zou uitsluitend overbodige aanvalsoppervlak
// toevoegen (een gebruiker die zijn eigen ciphertext-velden met de hand kan
// aanpassen) zonder enig legitiem gebruik — vandaar dicht i.p.v. een hook.
// `delete` blijft wel ownRecordAccess: dat IS de "Ontkoppelen"-actie, gewoon
// via Payload's native DELETE-endpoint, geen aparte disconnect-route nodig.
//
// Geen timeZone-cacheveld: de Calendar API se events.list-respons bevat zelf
// al een top-level `timeZone` (zie lib/google-calendar/api.ts) — een aparte
// calendars/primary-aanroep zou alleen voor het e-mailadres nodig zijn, en
// die gebeurt uitsluitend eenmalig bij het koppelen (zie de callback-route),
// nooit per dashboard-lezing.
export const GoogleConnections: CollectionConfig = {
  slug: "google-connections",
  labels: { singular: "Google-koppeling", plural: "Google-koppelingen" },
  admin: {
    useAsTitle: "emailAddress",
    defaultColumns: ["emailAddress", "eigenaar", "status", "connectedAt"],
    group: "Mijn Werk — systeem",
    description: "Persoonlijke Google Agenda-koppelingen (alleen-lezen) — uitsluitend zichtbaar voor de eigenaar. Koppelen/ontkoppelen via het Mijn Werk-dashboard, niet deze lijst.",
  },
  access: {
    read: ownRecordAccess,
    create: () => false,
    update: () => false,
    delete: ownRecordAccess,
  },
  fields: [
    {
      name: "eigenaar",
      type: "relationship",
      relationTo: "users",
      required: true,
      unique: true,
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "emailAddress",
      type: "email",
      label: "Gekoppeld Google-account",
      admin: { readOnly: true, description: "Alleen-lezen weergave — nooit meer dan het e-mailadres." },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "actief",
      label: "Status",
      options: [
        { label: "Actief", value: "actief" },
        { label: "Verlopen — opnieuw verbinden nodig", value: "verlopen" },
      ],
      admin: { readOnly: true, description: "Wordt op 'verlopen' gezet zodra een vernieuwingspoging mislukt (ingetrokken toestemming e.d.)." },
    },
    {
      name: "encryptedAccessToken",
      type: "text",
      label: "Access token (versleuteld)",
      admin: { readOnly: true, description: "AES-256-GCM-ciphertext — nooit de platte token." },
    },
    {
      name: "encryptedRefreshToken",
      type: "text",
      label: "Refresh token (versleuteld)",
      admin: { readOnly: true, description: "AES-256-GCM-ciphertext — nooit de platte token." },
    },
    {
      name: "tokenExpiresAt",
      type: "date",
      label: "Access token verloopt op",
      admin: { readOnly: true },
    },
    {
      name: "scopes",
      type: "text",
      hasMany: true,
      label: "Toegekende scopes",
      admin: { readOnly: true },
    },
    {
      name: "connectedAt",
      type: "date",
      label: "Gekoppeld op",
      admin: { readOnly: true },
    },
    {
      name: "lastUsedAt",
      type: "date",
      label: "Laatst gebruikt op",
      admin: { readOnly: true, description: "Wordt gezet bij elke geslaagde live agenda-lezing." },
    },
  ],
};
