import type { Access, FieldAccess } from "payload";

// Eén gedeelde autorisatielaag, aangeroepen vanuit elke collection — zie
// docs/CMS-AND-EDITORIAL-WORKFLOW.md §Rollen & rechten: "Rolcontrole gebeurt
// via één gedeelde autorisatiefunctie ... niet los per pagina geïmplementeerd."
//
// Twee Payload-rollen (`admin`/`editor`), zoals vastgelegd in
// docs/CMS-AND-EDITORIAL-WORKFLOW.md. Het onderscheid tussen "centrale
// redacteur" en "variant-redacteur" uit docs/CONTENT-MODEL.md §Wie mag wat
// schrijven is GEEN aparte rol (dat zou een rol toevoegen zonder dat de
// documentatie een derde Payload-rol vastlegt) — het is dezelfde `editor`-rol,
// onderscheiden door het veld `variantScope` op de gebruiker: leeg = centrale
// redacteur (mag in de centrale boom schrijven), gevuld = variant-redacteur
// (mag uitsluitend VariantOverride-records voor díe variant schrijven). Dit
// implementeert het schema-niveau-afdwingbare onderscheid dat CONTENT-MODEL.md
// vereist, zonder een niet-gedocumenteerde rol te verzinnen.

// Payload's Postgres-adapter gebruikt numerieke (serial) id's — bevestigd
// tijdens Fase 4B live-verificatie. req.user en relatievelden zoals
// variantScope komen dus als number (onbepopuleerd) of { id: number }
// (bepopuleerd) binnen, nooit als string.
export interface AuthUser {
  id: number;
  role: "admin" | "editor";
  variantScope?: (number | { id: number }) | null;
}

export function isAdmin(user: AuthUser | null | undefined): boolean {
  return user?.role === "admin";
}

/** Ingelogde CMS-gebruiker, ongeacht rol — voor lezen van conceptcontent (nooit publiek). */
export function isEditor(user: AuthUser | null | undefined): boolean {
  return user?.role === "editor" || isAdmin(user);
}

/** Centrale redacteur: admin, of een editor zonder variantScope. Mag in de centrale boom schrijven. */
export function isCentralEditor(user: AuthUser | null | undefined): boolean {
  if (isAdmin(user)) return true;
  return user?.role === "editor" && !user.variantScope;
}

function variantScopeId(user: AuthUser): number | undefined {
  if (!user.variantScope) return undefined;
  return typeof user.variantScope === "number" ? user.variantScope : user.variantScope.id;
}

/** Variant-redacteur voor een specifieke variant, of admin (admin mag overal in). */
export function isVariantEditorFor(user: AuthUser | null | undefined, variantId: number): boolean {
  if (isAdmin(user)) return true;
  if (!user || user.role !== "editor") return false;
  return variantScopeId(user) === variantId;
}

// --- Herbruikbare Payload access-functies -----------------------------

export const adminOnly: Access = ({ req }) => isAdmin(req.user as AuthUser | null);

export const centralEditorOnly: Access = ({ req }) => isCentralEditor(req.user as AuthUser | null);

export const anyEditor: Access = ({ req }) => isEditor(req.user as AuthUser | null);

export const adminFieldOnly: FieldAccess = ({ req }) => isAdmin(req.user as AuthUser | null);

/**
 * Publiek leesbaar voor gepubliceerde content, alleen CMS-gebruikers zien
 * concepten — zie Fase 4 Stap 5: "drafts niet publiek zichtbaar; alleen
 * gepubliceerde content publiek wordt opgehaald."
 */
export const publishedOrEditor: Access = ({ req }) => {
  if (isEditor(req.user as AuthUser | null)) return true;
  return { articleStatus: { equals: "gepubliceerd" } };
};

/**
 * Publiek leesbaar voor gepubliceerde variant-overrides — nodig zodra Fase 5
 * de samenvoegfunctie bouwt (die leest overrides voor anonieme bezoekers om
 * variant-specifieke pagina's te renderen, zie services/payload.ts
 * getVariantOverrides). Ontdekt tijdens Fase 4B live-verificatie: met
 * `anyEditor` als enige leestoegang kon een anonieme/publieke aanvraag nooit
 * één override lezen, wat Fase 5 volledig zou blokkeren. Concepten blijven
 * wel alleen zichtbaar voor CMS-gebruikers, zelfde patroon als
 * publishedOrEditor.
 */
export const publishedOverrideOrEditor: Access = ({ req }) => {
  if (isEditor(req.user as AuthUser | null)) return true;
  return { status: { equals: "gepubliceerd" } };
};

/**
 * VariantOverride-toegang: een variant-redacteur mag alleen lezen/schrijven
 * binnen de eigen variant; een centrale redacteur heeft daar geen schrijfpad
 * naartoe nodig maar mag wel meelezen ter controle. Zie
 * docs/CONTENT-MODEL.md §Wie mag wat schrijven.
 *
 * Bij `create` bestaat er nog geen document om een Where-clause op te
 * filteren — Payload interpreteert een geretourneerd Where-object dan als
 * "toegestaan", ongeacht welke variant daadwerkelijk wordt ingezonden. Zonder
 * de `id`-check hieronder kon een variant-redacteur zo een override voor een
 * ANDERE variant aanmaken dan de eigen variantScope. Ontdekt en gefixt
 * tijdens Fase 4B live-verificatie (echte create-aanroep met
 * overrideAccess: false) — zie het opleveringsrapport.
 */
export const ownVariantOverrideAccess: Access = ({ req, data, id }) => {
  const user = req.user as AuthUser | null;
  if (isAdmin(user)) return true;
  if (!user || user.role !== "editor") return false;
  const scope = variantScopeId(user);
  if (!scope) return false; // centrale redacteur: geen schrijfpad naar overrides van een specifieke variant

  if (!id && data) {
    const submitted = typeof data.variant === "number" ? data.variant : (data.variant as { id?: number })?.id;
    return submitted === scope;
  }

  return { variant: { equals: scope } };
};
