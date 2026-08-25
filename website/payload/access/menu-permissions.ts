import type { Access } from "payload";

// Admin gebruikersbeheer — rechten per hoofdmenu en submenu (2026-08-25).
// Breidt payload/access/roles.ts uit i.p.v. er een parallel systeem naast te
// bouwen (opdrachtseis §8): rol (`admin`/`editor`) blijft de grove,
// ONGEWIJZIGDE poort die bepaalt WELKE resources iemand ooit zou kunnen
// bereiken (adminOnly/anyEditor/... in roles.ts, letterlijk ongewijzigd);
// dit bestand voegt daar een tweede, per-gebruiker filter aan toe dat WELKE
// van die resources deze specifieke gebruiker daadwerkelijk mag zien/
// gebruiken — nooit andersom (deze laag kan rechten nooit VERRUIMEN t.o.v.
// wat de rol al toestaat, alleen versmallen). Zie lib/admin-nav/nav-groups.ts
// voor de permissie-ID's zelf (`${groupId}.${itemId}`, bv.
// "trainers.telefonie") en payload/collections/Users.ts voor het datamodel.
//
// Precies DEZE functie wordt gebruikt door zowel de navigatiefilters
// (nav-groups.ts, client + server) als elke server-side enforcementplek
// (custom admin-views via AdminViewShell.tsx, API-routes, Payload-
// collectie-/global-access-blokken via `permissieOnly` hieronder) —
// opdrachtseis §8/§11.5 ("hoe voorkom je dat UI en server-authorisatie uit
// elkaar gaan"): door er precies één plek voor te hebben die overal wordt
// aangeroepen, kan er geen tweede, afwijkende implementatie ontstaan.
// Bewust GEEN `extends AuthUser` — deze check leest uitsluitend de twee
// velden hieronder, nooit `role`/`variantScope` (zie de toelichting bij
// heeftAdminPermissie). Een striktere type-eis zou elke aanroepplek dwingen
// tot een volledig AuthUser-shape (incl. verplichte `role`), ook plekken die
// slechts een los, lichter gebruikersobject bij de hand hebben (bv.
// useAuth()'s ClientUser, of BeheerDashboard.tsx se eigen minimale
// serverProps-type) — onnodige wrijving voor velden die hier toch niet
// gebruikt worden.
export interface AuthUserMetPermissies {
  id?: unknown;
  /**
   * "full" (of ontbrekend/onbekend) = onbeperkt binnen wat de rol toestaat —
   * dit is de default voor elk bestaand account na migratie (opdrachtseis
   * §5/§9: bestaande accounts mogen nooit onverwacht rechten verliezen) en
   * voor elk NIEUW account totdat een beheerder het expliciet op "restricted"
   * zet. "restricted" = uitsluitend de ID's in `permissions` hieronder.
   */
  permissionMode?: "full" | "restricted" | null;
  /** Toegestane menu-permissie-ID's — alleen gelezen wanneer permissionMode === "restricted". */
  permissions?: unknown;
}

/**
 * DE centrale permissiecheck (opdrachtseis §8: "Maak één centrale helper
 * zoals heeftAdminPermissie(user, 'trainers.telefonie')"). Geeft `true` voor
 * elk bestaand/nieuw account met permissionMode "full" (of ontbrekend) —
 * backwards-compatible default, zie hierboven — en checkt bij "restricted"
 * of `permissionId` letterlijk in de opgeslagen lijst voorkomt.
 *
 * Bewust GEEN rolcheck hierin (geen isAdmin/isEditor-aanroep) — dit is een
 * AANVULLENDE beperking bovenop de bestaande rolcontrole, nooit een
 * vervanging ervan. Elke aanroepplek (route, view, collectie-access) blijft
 * zijn bestaande rolcheck behouden en voegt DEZE check ernaast toe — zie de
 * aanroepvoorbeelden in de collecties/routes die dit bestand importeren.
 */
export function heeftAdminPermissie(user: AuthUserMetPermissies | null | undefined, permissionId: string): boolean {
  if (!user) return false;
  if (user.permissionMode !== "restricted") return true;
  return Array.isArray(user.permissions) && user.permissions.includes(permissionId);
}

/**
 * Combineert een bestaande Payload-`Access`-functie (bv. `adminOnly`,
 * `anyEditor`, of een rijgebonden functie die een Where-object teruggeeft)
 * met de nieuwe permissiecheck — voor gebruik in collectie-/global-
 * `access`-blokken. Geeft `false` zodra ÓF de bestaande rolcheck ÓF de
 * permissiecheck faalt; geeft anders het ORIGINELE resultaat van `rolCheck`
 * terug (dus inclusief een eventueel Where-object voor rijgebonden scoping —
 * die scoping blijft intact, dit voegt alleen een extra alles-of-niets-poort
 * ervoor).
 *
 * NIET gebruikt op Users.ts se eigen read/update — "lees/wijzig mijn eigen
 * account" moet onvoorwaardelijk blijven werken voor elke ingelogde
 * beheerder/redacteur (basale sessie-identiteit, bv. useAuth()/"wie ben ik"-
 * weergave in meerdere views), ongeacht diens menupermissies. Zie de
 * toelichting in Users.ts.
 */
export function permissieOnly(permissionId: string, rolCheck: Access): Access {
  return async (args) => {
    const basis = await rolCheck(args);
    if (basis === false) return false;
    if (!heeftAdminPermissie(args.req.user as AuthUserMetPermissies | null, permissionId)) return false;
    return basis;
  };
}
