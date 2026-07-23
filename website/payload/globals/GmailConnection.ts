import type { GlobalConfig } from "payload";
import { adminOnly } from "../access/roles";

// Eén Gmail-helpdeskaccount-koppeling (OAuth 2.0) — een Global, geen
// Collection: er bestaat per definitie precies één koppeling, geen lijst.
// Uitsluitend gevuld/gewijzigd door app/api/gmail/oauth/callback (met
// overrideAccess: true, zelfde patroon als ContactSubmissions/AnswerFeedback
// — schrijven loopt nooit via de publieke API om de OAuth-state/toestemmings-
// controle nooit te kunnen omzeilen). Alleen beheerders mogen dit ooit lezen
// of wijzigen via de normale Payload-API — zie access/roles.ts adminOnly.
//
// Tokens staan uitsluitend versleuteld op (lib/gmail/encryption.ts,
// AES-256-GCM) — ook een beheerder ziet in het beheerscherm nooit meer dan
// de ciphertext. De "Test synchronisatie"-knop hieronder roept
// POST /api/gmail/sync aan (lib/gmail/sync.ts) — zie payload/collections/
// SupportThreads.ts voor waar de geïmporteerde threads terechtkomen.
export const GmailConnection: GlobalConfig = {
  slug: "gmail-connection",
  admin: {
    group: "Beheer",
    description:
      "Gmail-helpdeskkoppeling (alleen-lezen toegang). Koppelen/herkoppelen: log in op /admin en open /api/gmail/oauth/start in dezelfde browser.",
  },
  access: {
    read: adminOnly,
    update: adminOnly,
  },
  fields: [
    {
      name: "emailAddress",
      type: "email",
      label: "Gekoppeld Gmail-adres",
      admin: { readOnly: true, description: "Succesvol gekoppeld helpdesk-adres." },
    },
    {
      name: "syncAction",
      type: "ui",
      label: "Synchronisatie",
      admin: {
        components: {
          Field: "@/payload/components/GmailSyncButton#GmailSyncButton",
        },
      },
    },
    {
      // Analyseert tot 5 nog niet geanalyseerde threads met AI — zie
      // payload/collections/KnowledgeDrafts.ts.
      name: "analyzeAction",
      type: "ui",
      label: "AI-analyse",
      admin: {
        components: {
          Field: "@/payload/components/AnalyzeNewThreadsButton#AnalyzeNewThreadsButton",
        },
      },
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
      name: "lastSyncAt",
      type: "date",
      label: "Laatst gesynchroniseerd op",
      admin: {
        readOnly: true,
        description: "Wordt gezet door elke synchronisatieronde, ongeacht het resultaat per thread.",
      },
    },
  ],
};
