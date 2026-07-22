import type { CollectionConfig } from "payload";
import { adminFieldOnly, adminOnly, isAdmin, type AuthUser } from "../access/roles";

// Beheeromgeving-gebruikers (redacteuren/beheerders) — zie
// docs/CMS-AND-EDITORIAL-WORKFLOW.md §Rollen & rechten. Payload's ingebouwde
// authenticatie (auth: true) is de authenticatieoplossing voor de
// beheeromgeving — zie docs/TODO.md beslissing 3 (Auth.js vs. Clerk): met
// Payload als CMS is een losse auth-provider overbodige complexiteit (twee
// gebruikers-/sessiesystemen naast elkaar) zonder functionele meerwaarde,
// terwijl Payload's rolgebonden access-control hier al op leunt. Zie het
// opleveringsrapport voor de volledige motivatie.
export const Users: CollectionConfig = {
  slug: "users",
  auth: true,
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "email", "role", "variantScope"],
    group: "Beheer",
    description: "Redacteuren en beheerders van de beheeromgeving.",
  },
  access: {
    create: adminOnly,
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
};
