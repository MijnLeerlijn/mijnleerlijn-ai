import type { CollectionConfig, FieldAccess } from "payload";
import { adminFieldOnly, adminOnly, isAdmin, type AuthUser } from "../access/roles";
import { alleMenuPermissieIds } from "@/lib/admin-nav/nav-groups";

// Beheeromgeving-gebruikers (redacteuren/beheerders). Payload's ingebouwde
// authenticatie is de bron voor beheeraccounts. Per-gebruiker permissies
// versmallen de toegang van redacteuren, maar een beheerder moet altijd bij
// het gebruikersbeheer kunnen komen. Anders kan een eerder opgeslagen
// restricted-profiel een beheerder volledig uit "Gebruikers & rechten"
// sluiten, waardoor niemand die instelling nog kan herstellen.

/**
 * Een beheerder mag permissies van ANDERE accounts aanpassen, nooit die van
 * zichzelf. Zo kan niemand via het eigen profiel rechten verhogen of zichzelf
 * per ongeluk verder beperken. Een nieuw account heeft nog geen id en mag dus
 * door een beheerder met de gewenste rechten worden aangemaakt.
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
    // Beheerders moeten altijd alle accounts kunnen zien en beheren. Dit is
    // bewust NIET afhankelijk van permissionMode/permissions: juist dit scherm
    // is nodig om een foutief restricted-profiel te kunnen herstellen.
    // Niet-beheerders houden alleen toegang tot hun eigen account voor de
    // basale sessie-identiteit.
    read: ({ req }) => {
      const user = req.user as AuthUser | null;
      if (isAdmin(user)) return true;
      if (!user) return false;
      return { id: { equals: user.id } };
    },
    update: ({ req }) => {
      const user = req.user as AuthUser | null;
      if (isAdmin(user)) return true;
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
                  "Volledige toegang = ziet alles waar de rol recht op geeft. Beperkt via permissies = uitsluitend de hieronder aangevinkte onderdelen. Je kunt de toegang van je eigen account niet wijzigen; alleen een andere beheerder kan dat.",
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
