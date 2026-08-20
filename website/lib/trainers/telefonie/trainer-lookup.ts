import type { Payload } from "payload";
import type { AuthTrainer } from "../auth";
import { normaliseerNederlandsNummer } from "./nummer";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — trainerherkenning op
// telefoonnummer (spec §2/§3/§21). EXACTE match op het genormaliseerde
// E.164-nummer, nooit fuzzy (opdrachtseis, letterlijk). `limit: 2` is
// bewust: genoeg om "meer dan één" te detecteren zonder een onnodig grotere
// resultset op te halen — spec §21 verbiedt sowieso om ooit een van de twee
// te kiezen bij een conflict, dus meer dan 2 teruglezen zou geen extra
// informatie opleveren.
export type TrainerVoorTelefonieUitkomst =
  | { soort: "geen_geldig_nummer" }
  | { soort: "onbekend" }
  | { soort: "conflict_meerdere_trainers" }
  | { soort: "niet_in_pilot"; trainer: AuthTrainer }
  | { soort: "gevonden"; trainer: AuthTrainer };

/** Zelfde beperkte projectie als AuthTrainer overal elders (auth.ts) — geen volledige gegenereerde Payload-rij doorgeven. */
function naarAuthTrainer(doc: { id: number; name: string; email?: string | null; mondayTrainerboardId: string; mondayUitvoerderItemId: string; actief?: boolean | null }): AuthTrainer {
  return {
    id: doc.id,
    name: doc.name,
    email: doc.email ?? "",
    mondayTrainerboardId: doc.mondayTrainerboardId,
    mondayUitvoerderItemId: doc.mondayUitvoerderItemId,
    actief: Boolean(doc.actief),
  };
}

/**
 * Her-opzoeking van het volledige AuthTrainer-object bij een latere
 * webhookstap (kies-training/opname-status) — de call-state-rij bewaart
 * uitsluitend de Payload-relatie-ID (trainer.id), nooit een gekopieerd/
 * verouderd AuthTrainer-object. Zelfde principe als verifyTrainerSessionCookie
 * (auth.ts): altijd een verse lookup, nooit een client- of tussentijds
 * opgeslagen kopie vertrouwen — hier is de "client" een eerdere webhookstap
 * van dit eigen systeem, maar het principe is identiek.
 */
export async function haalAuthTrainerVoorId(payload: Payload, trainerId: number): Promise<AuthTrainer | null> {
  const doc = await payload.findByID({ collection: "trainer-accounts", id: trainerId, overrideAccess: true, depth: 0, disableErrors: true });
  if (!doc) return null;
  return naarAuthTrainer(doc);
}

export interface TelefonieProfiel {
  mobielNummer: string | null;
  telefonieActief: boolean;
}

/**
 * Ronde 3.5 (2026-08-25) — spec §24: "Toon in Profiel het geregistreerde
 * mobiele nummer." BEWUST geen los veld op AuthTrainer (dat type voedt overal
 * de Monday-resolutieladder en hoeft deze twee telefonie-specifieke velden
 * niet overal mee te dragen) — een eigen, kleine opzoeking, alleen gebruikt
 * door app/(trainers)/trainers/(portal)/profiel/page.tsx. Wijzigen blijft in
 * V1 bewust adminOnly (zie die pagina se toelichting) — deze functie is
 * uitsluitend lezen.
 */
export async function haalTelefonieProfiel(payload: Payload, trainerId: number): Promise<TelefonieProfiel> {
  const doc = await payload.findByID({ collection: "trainer-accounts", id: trainerId, overrideAccess: true, depth: 0, disableErrors: true });
  return { mobielNummer: doc?.mobielNummer ?? null, telefonieActief: Boolean(doc?.telefonieActief) };
}

export async function vindTrainerVoorTelefoonnummer(payload: Payload, ruwNummer: string | null): Promise<TrainerVoorTelefonieUitkomst> {
  if (!ruwNummer) return { soort: "geen_geldig_nummer" };
  const genormaliseerd = normaliseerNederlandsNummer(ruwNummer);
  if (!genormaliseerd) return { soort: "geen_geldig_nummer" };

  const resultaat = await payload.find({
    collection: "trainer-accounts",
    where: { and: [{ mobielNummer: { equals: genormaliseerd } }, { actief: { equals: true } }] },
    overrideAccess: true,
    limit: 2,
    depth: 0,
  });

  // Spec §21: "Eén actief telefoonnummer -> maximaal één actief
  // traineraccount... Als legacy-data dit toch schendt: geen trainer kiezen.
  // Call blokkeren en server-side diagnosticeren." De unique-constraint op
  // trainer-accounts.mobielNummer voorkomt dit voor NIEUWE data (spec §2),
  // maar deze controle blijft hier bewust bestaan als verdediging-in-diepte
  // tegen legacy-data die de constraint (nog) niet kende.
  if (resultaat.docs.length > 1) return { soort: "conflict_meerdere_trainers" };

  const doc = resultaat.docs[0];
  if (!doc) return { soort: "onbekend" };

  const trainer = naarAuthTrainer(doc);

  // Spec §26: pilot-allowlist via een veld op het traineraccount, nooit een
  // hardcoded ID in businesslogica.
  if (!doc.telefonieActief) return { soort: "niet_in_pilot", trainer };

  return { soort: "gevonden", trainer };
}
