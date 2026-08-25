import { navItemPermissionId, type NavGroupDef } from "@/lib/admin-nav/nav-groups";

// Admin gebruikersbeheer — rechten per hoofdmenu en submenu (2026-08-25).
// Pure, framework-onafhankelijke logica achter ToegangMenuField.tsx —
// losgetrokken van de component zelf zodat dit rechtstreeks (zonder
// Payload's useField()/vormcontext) getest kan worden, zelfde uitgangspunt
// als lib/content/markdown-headings.ts elders in dit project.

/** Alle permissie-ID's binnen één hoofdmenu (gewone items + gemute "Technisch"-items). */
export function alleItemIds(group: NavGroupDef): string[] {
  return [...group.items, ...(group.mutedItems ?? [])].map((item) => navItemPermissionId(group.id, item));
}

export interface GroepTelling {
  aantalGeselecteerd: number;
  totaal: number;
  /** true = elk item in de groep is aangevinkt. */
  alles: boolean;
  /** true = geen enkel item in de groep is aangevinkt. */
  niets: boolean;
}

/** Telling voor de tri-state groepscheckbox — "alles"/"niets"/ertussenin (indeterminate). */
export function berekenGroepTelling(group: NavGroupDef, geselecteerd: ReadonlySet<string>): GroepTelling {
  const ids = alleItemIds(group);
  const aantalGeselecteerd = ids.filter((id) => geselecteerd.has(id)).length;
  return { aantalGeselecteerd, totaal: ids.length, alles: aantalGeselecteerd === ids.length, niets: aantalGeselecteerd === 0 };
}

/** Eén los item aan/uit — retourneert een NIEUWE Set (onveranderlijk, geschikt voor React state). */
export function toggleItemInSelectie(geselecteerd: ReadonlySet<string>, id: string): Set<string> {
  const nieuw = new Set(geselecteerd);
  if (nieuw.has(id)) nieuw.delete(id);
  else nieuw.add(id);
  return nieuw;
}

/**
 * Hele hoofdmenu aan/uit (opdrachtseis §7: "alles selecteren binnen
 * hoofdmenu; alles uitzetten"). Al volledig geselecteerd -> alles uit;
 * anders (niets of gedeeltelijk) -> alles aan. Retourneert een NIEUWE Set.
 */
export function toggleGroepInSelectie(geselecteerd: ReadonlySet<string>, group: NavGroupDef): Set<string> {
  const ids = alleItemIds(group);
  const alGeselecteerd = ids.every((id) => geselecteerd.has(id));
  const nieuw = new Set(geselecteerd);
  if (alGeselecteerd) ids.forEach((id) => nieuw.delete(id));
  else ids.forEach((id) => nieuw.add(id));
  return nieuw;
}
