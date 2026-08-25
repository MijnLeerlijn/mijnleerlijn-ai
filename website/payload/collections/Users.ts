import type { CollectionConfig, FieldAccess } from "payload";
import { adminFieldOnly, adminOnly, isAdmin, type AuthUser } from "../access/roles";
import { heeftAdminPermissie, type AuthUserMetPermissies } from "../access/menu-permissions";
import { alleMenuPermissieIds } from "@/lib/admin-nav/nav-groups";

// Letterlijke permissie-ID van het "Gebruikers"-menu-item (algemeen-groep,
// item-id "gebruikers" — zie lib/admin-nav/nav-groups.ts). Bewust een
// letterlijke string i.p.v. een aanroep van navItemPermissionId(): die
// verwacht een volledig NavItem-object puur om er groupId+id uit te lezen,
// wat hier een onnodige/geforceerde partial-object-cast zou vergen voor twee
// vaste woorden die net zo min veranderen als de collectie-slug "users"
// zelf.
const GEBRUIKERS_PERMISSIE_ID = "algemeen.gebruikers";

// Beheeromgeving-gebruikers (redacteuren/beheerders) — zie
// docs/CMS-AND-EDITORIAL-WORKFLOW.md §Rollen & rechten. Payload's ingebouwde
// authenticatie (auth: true) is de authenticatieoplossing voor de
// beheeromgeving — zie docs/TODO.md beslissing 3 (Auth.js vs. Clerk): met
// Payload als CMS is een losse auth-provider overbodige complexiteit (twee
// gebruikers-/sessiesystemen naast elkaar) zonder functionele meerwaarde,
// terwijl Payload's rolgebonden access-control hier al op leunt. Zie het
// opleveringsrapport voor de volledige motivatie.
//
// Admin gebruikersbeheer — rechten per hoofdmenu en submenu (2026-08-25):
// twee nieuwe velden (permissionMode/permissions, tab "Toegang & menu") —
// zie payload/access/menu-permissions.ts voor de centrale permissiecheck en
// lib/admin-nav/nav-groups.ts voor de permissie-ID's/UI-bron. `role` en
// `variantScope` blijven ONGEWIJZIGD de grove poort (welke resources iemand
// ooit kan bereiken); de twee nieuwe velden versmallen daarbinnen per
// gebruiker WELKE van die resources deze specifieke persoon mag gebruiken.

/**
 * Zelfbeveiliging tegen twee dingen tegelijk (opdrachtseis §5 + §9):
 * (a) "gebruiker kan eigen permissions niet verhogen" — een gebruiker (ook
 *     een beheerder) mag NOOIT zijn/haar EIGEN permissionMode/permissions
 *     schrijven, via geen enkel pad (UI of rechtstreekse API-aanroep);
 * (b) "ik wil voorkomen dat ik mezelf per ongeluk buitensluit" — omdat (a)
 *     ook geldt voor het VERSCHERPEN van het eigen account, kan een
 *     beheerder zichzelf per constructie nooit per ongeluk (of expres)
 *     buitensluiten. Alleen een ANDER admin-account kan iemands
 *     toegangsmodus/permissies wijzigen. `id` ontbreekt bij create (een
 *     nieuw account is per definitie nooit "jezelf") — daar geldt alleen de
 *     gewone adminFieldOnly-rolcheck.
 */
const permissieVeldAccess: FieldAccess = ({ req, id }) => {
  const user = req.user as AuthUser | null;
  if (!isAdmin(user)) return false;
  if (id !== undefined && id !== null && String(id) === String(user?.id)) return false;
  return true;
};

export const Users: CollectionConfig = {
  slug: "users",
  auth: true,
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "email", "role", "variantScope"],
    group: "Basis — Technisch beheer",
    description: "Redacteuren en beheerders van de beheeromgeving.",
  },
  access: {
    create: adminOnly,
    // "Lees mijn eigen account" blijft ONVOORWAARDELIJK (basale
    // sessie-identiteit, bv. useAuth()/"wie ben ik"-weergave elders) — alleen
    // de "zie ALLE gebruikers"-tak (voor admins) is nu ook aan de
    // "Gebruikers"-menupermissie gekoppeld. Zie payload/access/
    // menu-permissions.ts se toelichting over waarom dit NIET via de
    // generieke permissieOnly()-wrapper loopt.
    read: ({ req }) => {
      const user = req.user as (AuthUser & AuthUserMetPermissies) | null;
      if (isAdmin(user) && heeftAdminPermissie(user, GEBRUIKERS_PERMISSIE_ID)) return true;
      if (!user) return false;
      return { id: { equals: user.id } };
    },
    update: ({ req }) => {
      const user = req.user as (AuthUser & AuthUserMetPermissies) | null;
      if (isAdmin(user) && heeftAdminPermissie(user, GEBRUIKERS_PERMISSIE_ID)) return true;
      if (!user) return false;
      return { id: { equals: user.id } };
    },
    delete: adminOnly,
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Algemeen",
          fields: [
            {
              name: "name",
              type: "text",
              required: true,
              label: "Naam",
            },
            {
              name: "role",
              type: "select",
              required: true,
              defaultValue: "editor",
              label: "Rol",
              options: [
                { label: "Beheerder", value: "admin" },
                { label: "Redacteur", value: "editor" },
              ],
              access: { update: adminFieldOnly },
              admin: {
                description:
                  "Beheerder kan alles inclusief varianten, rollen en AI-goedkeuring. Redacteur is beperkter.",
              },
            },
            {
              name: "variantScope",
              type: "relationship",
              relationTo: "variants",
              hasMany: false,
              label: "Beperkt tot variant",
              access: { update: adminFieldOnly },
              admin: {
                description:
                  "Leeg = centrale redacteur (mag centrale artikelen schrijven). Ingevuld = variant-redacteur (mag uitsluitend afwijkingen voor déze variant schrijven, nooit de centrale boom). Zie docs/CONTENT-MODEL.md.",
                condition: (_data, siblingData) => siblingData?.role === "editor",
              },
            },
          ],
        },
        {
          label: "Toegang & menu",
          fields: [
            {
              // Bewust GEEN required:true — anders vereist Payload's
              // gegenereerde Create-type dit veld expliciet bij elke
              // payload.create({collection: "users", ...})-aanroep in de
              // rest van de codebase (seed-scripts, testfixtures), ook al
              // vult defaultValue hieronder 'm sowieso in zodra het
              // ontbreekt. Runtime-gedrag is identiek; dit voorkomt puur
              // onnodige typefouten op bestaande, ongerelateerde aanroepen.
              name: "permissionMode",
              type: "select",
              defaultValue: "full",
              label: "Toegangsmodus",
              options: [
                { label: "Volledige toegang (standaard)", value: "full" },
                { label: "Beperkt via permissies", value: "restricted" },
              ],
              access: { update: permissieVeldAccess },
              admin: {
                description:
                  "Volledige toegang = ziet alles waar de rol (hiernaast) al recht op geeft — de standaard voor elk account. Beperkt via permissies = uitsluitend de hieronder aangevinkte hoofdmenu's/submenu's, ook al zou de rol méér toestaan. Dit veld van het EIGEN account is nooit wijzigbaar (ook niet door een beheerder) — zo kan niemand zichzelf per ongeluk buitensluiten of de eigen rechten verhogen; alleen een ánder beheerdersaccount kan dit hier aanpassen.",
              },
            },
            {
              name: "permissions",
              type: "json",
              label: "Toegestane menu-onderdelen",
              defaultValue: [],
              access: { update: permissieVeldAccess },
              validate: (value: unknown) => {
                if (value === undefined || value === null) return true;
                if (!Array.isArray(value)) return "Moet een lijst van permissie-ID's zijn.";
                const geldig = new Set(alleMenuPermissieIds());
                const onbekend = value.filter((v) => typeof v !== "string" || !geldig.has(v));
                if (onbekend.length > 0) return `Onbekende of verouderde permissie-ID('s): ${onbekend.join(", ")}`;
                return true;
              },
              admin: {
                description: "Alleen relevant bij 'Beperkt via permissies'.",
                condition: (_data, siblingData) => siblingData?.permissionMode === "restricted",
                components: {
                  Field: "@/payload/components/ToegangMenuField#ToegangMenuField",
                },
              },
            },
          ],
        },
      ],
    },
  ],
};
