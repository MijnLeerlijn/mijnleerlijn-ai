import type { Payload } from "payload";

// Admin volledig traineraccountbeheer (vervolgronde) — bewerken loopt
// bewust via Payload's EIGEN generieke collectie-editor
// (/admin/collections/trainer-accounts/{id}, zie
// payload/collections/TrainerAccounts.ts se access-blok — adminOnly, dus
// isAdmin, NIET isEditor: dit is de collectie se EIGEN, al bestaande,
// bewust strenge rechtenregel voor inloggegevens, hier ongewijzigd
// hergebruikt i.p.v. losser getrokken). Dit bestand bevat dus UITSLUITEND
// wat Payload's generieke editor niet kan: (a) een veilige, relatiebewuste
// verwijderfunctie — Payload's generieke "verwijderen" zou domweg de rauwe
// FK-uitkomst tonen (zie hieronder) — en (b) de expliciete
// deactiveer-snelkoppeling ("trainer op inactief zetten" — spec-eis, hergebruikt
// het al bestaande actief-veld, geen nieuwe soft-delete-architectuur).
//
// VEILIGHEIDSONDERZOEK verwijderen (opleverrapport) — alle 7 collecties die
// naar trainer-accounts verwijzen (live geverifieerd via
// payload/migrations/*.ts, geen aanname):
//   - trainer_kennisvragen.trainer_id  : NOT NULL, FK ON DELETE SET NULL
//   - trainer_bestanden.uploader_id    : NOT NULL, FK ON DELETE SET NULL
//   -> voor deze twee zou een kale payload.delete() een harde Postgres
//      NOT-NULL-constraintfout geven zodra er ook maar één rij bestaat.
//   - trainer_log_events.trainer_id, trainer_ai_log_events.trainer_id,
//     training_verslagen.trainer_id, trainer_telefonie_oproepen.trainer_id,
//     trainer_logboek_items.trainer_id : nullable, FK ON DELETE SET NULL
//   -> voor deze vijf zou een kale payload.delete() WEL slagen, maar de
//      trainer-toeschrijving op al die historische rijen stil op NULL
//      zetten — net zo'n vorm van "blind cascaden" als de opdracht verbiedt,
//      alleen onzichtbaar in plaats van een foutmelding.
// trainer-deelgroepen.leden is bewust NIET in onderstaande telling
// meegenomen: dat is een many-to-many-lidmaatschap (trainer_deelgroepen_rels,
// FK ON DELETE CASCADE) — geen historie, puur actueel groepslidmaatschap;
// het verdwijnen daarvan bij accountverwijdering is correct, geen dataverlies.
//
// Conclusie: hard delete is ALLEEN veilig wanneer een trainer in GEEN van
// de zeven collecties hieronder nog voorkomt. Zodra dat niet zo is, wordt
// nooit geprobeerd te verwijderen (voorkomt zowel de harde fout als het
// stille toeschrijvingsverlies) — de aanroeper krijgt een duidelijke
// "kan niet verwijderen"-uitkomst met de gevonden aantallen, en de UI wijst
// naar de bestaande, veilige alternatieve actie: deactiveren.

interface RelatieTelling {
  label: string;
  aantal: number;
}

async function telRelaties(payload: Payload, trainerId: number): Promise<RelatieTelling[]> {
  const collecties: { collection: "training-verslagen" | "trainer-logboek-items" | "trainer-telefonie-oproepen" | "trainer-bestanden" | "trainer-kennisvragen" | "trainer-log-events" | "trainer-ai-log-events"; veld: string; label: string }[] = [
    { collection: "training-verslagen", veld: "trainer", label: "trainingsverslagen" },
    { collection: "trainer-logboek-items", veld: "trainer", label: "logboekitems" },
    { collection: "trainer-telefonie-oproepen", veld: "trainer", label: "telefonie-oproepen" },
    { collection: "trainer-bestanden", veld: "uploader", label: "bestanden" },
    { collection: "trainer-kennisvragen", veld: "trainer", label: "kennisvragen" },
    { collection: "trainer-log-events", veld: "trainer", label: "logboekgebeurtenissen (audit)" },
    { collection: "trainer-ai-log-events", veld: "trainer", label: "AI-logboekgebeurtenissen (audit)" },
  ];

  const tellingen = await Promise.all(
    collecties.map(async ({ collection, veld, label }) => {
      const resultaat = await payload.find({ collection, where: { [veld]: { equals: trainerId } }, overrideAccess: true, limit: 0, depth: 0 });
      return { label, aantal: resultaat.totalDocs };
    })
  );
  return tellingen.filter((t) => t.aantal > 0);
}

export type TrainerVerwijderUitkomst =
  | { soort: "niet_gevonden" }
  | { soort: "heeft_relaties"; relaties: RelatieTelling[] }
  | { soort: "verwijderd" };

export async function verwijderTrainerAccountAlsAdmin(payload: Payload, trainerId: number): Promise<TrainerVerwijderUitkomst> {
  const bestaand = await payload.findByID({ collection: "trainer-accounts", id: trainerId, overrideAccess: true, depth: 0 }).catch(() => null);
  if (!bestaand) return { soort: "niet_gevonden" };

  const relaties = await telRelaties(payload, trainerId);
  if (relaties.length > 0) return { soort: "heeft_relaties", relaties };

  await payload.delete({ collection: "trainer-accounts", id: trainerId, overrideAccess: true });
  return { soort: "verwijderd" };
}

export type TrainerActiefUitkomst = { soort: "niet_gevonden" } | { soort: "ok"; actief: boolean };

/**
 * De "veiligste bestaande oplossing" i.p.v. hard delete (spec) — hergebruikt
 * het al bestaande actief-veld (TrainerAccounts.ts: "Uitgevinkt = kan niet
 * meer inloggen, zonder het account te verwijderen") en het al bestaande,
 * al werkende afdwingingsmechanisme: lib/trainers/auth.ts se
 * verifyTrainerSessionCookie leest trainer.actief bij ELKE aanroep vers uit
 * Payload (geen cache, geen los blokkeermechanisme nodig) en wijst een
 * sessie direct af zodra actief=false — ongeacht of er nog een geldig
 * cookie/token bestaat. Geen nieuwe blokkeerlogica nodig, alleen dit veld
 * zetten.
 */
export async function zetTrainerActiefStatus(payload: Payload, trainerId: number, actief: boolean): Promise<TrainerActiefUitkomst> {
  const bestaand = await payload.findByID({ collection: "trainer-accounts", id: trainerId, overrideAccess: true, depth: 0 }).catch(() => null);
  if (!bestaand) return { soort: "niet_gevonden" };
  await payload.update({ collection: "trainer-accounts", id: trainerId, overrideAccess: true, data: { actief } });
  return { soort: "ok", actief };
}
