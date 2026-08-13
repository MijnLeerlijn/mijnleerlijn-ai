import type { Payload } from "payload";

// Fase 1B (2026-08-13): dashboardkeuze per beheerder, opgeslagen via
// Payload's eigen, al bestaande "payload-preferences"-mechanisme
// (node_modules/payload/dist/preferences/config.js) — een standaard
// Payload-collectie die al sinds de eerste migratie van dit project bestaat
// (elke Payload+Postgres-installatie heeft 'm), automatisch gescoped op de
// ingelogde gebruiker (access control vergelijkt user.value/user.relationTo
// met req.user). Geen nieuw schema, geen migratie. Waarde is de array
// hrefs (uit lib/admin-nav/nav-groups.ts) die de beheerder heeft gekozen,
// in keuzevolgorde — client-side gelezen/geschreven via @payloadcms/ui se
// usePreferences() (BeheerTopBar.tsx), server-side hier gelezen zodat het
// dashboard (BeheerDashboard.tsx, server component) zonder laadflits meteen
// de juiste kaarten toont.
export const DASHBOARD_PREFERENCE_KEY = "ml-dashboard-items";

interface PreferenceUser {
  id: number | string;
  collection: string;
}

export async function getDashboardSelection(payload: Payload, user: PreferenceUser | null | undefined): Promise<string[]> {
  if (!user) return [];

  const result = await payload.find({
    collection: "payload-preferences",
    where: {
      and: [{ key: { equals: DASHBOARD_PREFERENCE_KEY } }, { "user.value": { equals: user.id } }, { "user.relationTo": { equals: user.collection } }],
    },
    limit: 1,
    depth: 0,
  });

  const waarde = result.docs[0]?.value;
  return Array.isArray(waarde) ? waarde.filter((v): v is string => typeof v === "string") : [];
}
