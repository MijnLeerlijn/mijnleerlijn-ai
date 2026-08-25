import type { Payload } from "payload";
import type { AuthTrainer } from "./auth";

// Correctieronde Admin Traineromgeving (2026-08-25) — trainer wijzigt eigen
// wachtwoord (spec: alleen zelfbediening, geen adminfunctionaliteit hier).
//
// Verificatie van het HUIDIGE wachtwoord loopt via payload.login() — Payload's
// eigen loginOperation (dezelfde die /api/trainer-accounts/login gebruikt,
// zie app/(trainers)/trainers/login/page.tsx en het live-bevestigde gebruik
// in app/api/trainers/trainingen/[id]/route.real-auth.test.ts): echte
// bcrypt-vergelijking, geen zelfgebouwde hashing/vergelijking. Het NIEUWE
// wachtwoord wordt opgeslagen via payload.update({data:{password:...}}) —
// Payload hasht dit zelf via dezelfde strategie (generatePasswordSaltHash),
// en valideert het zelf via zijn eigen password-fieldvalidator
// (node_modules/payload/dist/fields/validations.js se `password`-functie).
//
// Payload's daadwerkelijke standaardregel (geverifieerd tegen de
// geïnstalleerde payload@3.86-broncode, GEEN aanname): minLength 3, maxLength
// alleen als config.defaultMaxTextLength gezet is (hier niet het geval, dus
// in de praktijk onbegrensd). payload.config.ts/TrainerAccounts.ts zetten
// géén eigen, strenger wachtwoordbeleid — er bestaat dus vandaag geen ander
// "bestaand beleid" om hier toe te passen. Dit bestand verzint daarom BEWUST
// geen eigen, strengere regel (bv. "minimaal 8 tekens") — dat zou het
// door de opdracht verboden "willekeurig afwijkend beleid" zijn. Payload's
// payload.update() hieronder is dus de ENIGE plek waar het nieuwe wachtwoord
// daadwerkelijk gevalideerd wordt; onGeldigNieuwWachtwoord vangt die afwijzing
// alleen op om een nette Nederlandse melding te geven.
//
// trainerId komt hier ALTIJD uit het server-geverifieerde AuthTrainer-object
// (nooit uit request-body) — zelfde garantie als lib/trainers/logboek.ts.

export type WachtwoordWijzigenUitkomst =
  | { soort: "ok" }
  | { soort: "onjuist_huidig_wachtwoord" }
  | { soort: "ongeldige_invoer"; boodschap: string }
  | { soort: "nieuw_wachtwoord_geweigerd"; boodschap: string };

export async function wijzigEigenWachtwoord(
  payload: Payload,
  trainer: AuthTrainer,
  huidigWachtwoord: string,
  nieuwWachtwoord: string,
  nieuwWachtwoordBevestiging: string
): Promise<WachtwoordWijzigenUitkomst> {
  if (!huidigWachtwoord || !nieuwWachtwoord || !nieuwWachtwoordBevestiging) {
    return { soort: "ongeldige_invoer", boodschap: "Vul alle velden in." };
  }
  if (nieuwWachtwoord !== nieuwWachtwoordBevestiging) {
    return { soort: "ongeldige_invoer", boodschap: "De bevestiging komt niet overeen met het nieuwe wachtwoord." };
  }

  try {
    await payload.login({ collection: "trainer-accounts", data: { email: trainer.email, password: huidigWachtwoord } });
  } catch {
    // Zelfde generieke, veilige boodschap ongeacht de precieze reden (fout
    // wachtwoord, tijdelijk geblokkeerd account, etc.) — geen onderscheid dat
    // een aanvaller iets zou leren, zelfde principe als de bestaande
    // loginpagina (zie de LockedAuth-toelichting daar).
    return { soort: "onjuist_huidig_wachtwoord" };
  }

  try {
    await payload.update({ collection: "trainer-accounts", id: trainer.id, overrideAccess: true, data: { password: nieuwWachtwoord } });
  } catch {
    return { soort: "nieuw_wachtwoord_geweigerd", boodschap: "Nieuw wachtwoord voldoet niet aan de eisen. Kies een ander wachtwoord." };
  }

  return { soort: "ok" };
}
