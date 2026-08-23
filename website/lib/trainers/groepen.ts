import type { Payload } from "payload";
import type { AuthTrainer } from "./auth";

// Traineromgeving V2, Fase 3 (2026-08-23) — Bestanden + Deelgroepen.
// Uitsluitend lezen: groepen zelf worden alleen via de gewone Payload-admin
// beheerd (payload/collections/TrainerDeelgroepen.ts — "Alleen admin/editor
// mag groepen beheren; trainers mogen groepen niet zelf aanpassen",
// opdrachtseis §3). Dit bestand levert een trainer uitsluitend zijn EIGEN,
// actuele lidmaatschap — voor de deel-dropdown bij upload
// (lib/trainers/bestanden.ts se maakAlgemeenBestand) en voor "via welke
// groep" op /bestanden.
//
// Bewust ELKE keer een live query (geen cache): rechten volgen dynamisch uit
// lidmaatschap (opdrachtseis §4) — een groep waar de trainer net uit is
// gehaald, mag hier onmiddellijk niet meer verschijnen, zonder dat er ergens
// een aparte "sync"-stap nodig is.

export interface TrainerDeelgroepSamenvatting {
  id: number;
  naam: string;
}

/**
 * Actieve deelgroepen waar déze trainer lid van is — de enige, canonieke
 * bron voor "waar mag deze trainer mee delen" (maakAlgemeenBestand
 * hergebruikt dit ter validatie, nooit een tweede interpretatie) én "via
 * welke groep zie ik dit" (haalMetMijGedeeldeBestanden).
 */
export async function haalActieveGroepenVoorTrainer(payload: Payload, trainer: AuthTrainer): Promise<TrainerDeelgroepSamenvatting[]> {
  const resultaat = await payload.find({
    collection: "trainer-deelgroepen",
    where: { and: [{ leden: { equals: trainer.id } }, { actief: { equals: true } }] },
    overrideAccess: true,
    depth: 0,
    limit: 200,
    sort: "naam",
  });
  return resultaat.docs.map((doc) => ({ id: doc.id, naam: doc.naam }));
}
