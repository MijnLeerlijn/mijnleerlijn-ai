import { describe, it, expect } from "vitest";
import type { SanitizedPermissions } from "payload";
import { NAV_GROUPS, getVisibleNavGroups, getDashboardCards, isNavItemVisible } from "./nav-groups";

const ADMIN_PERMISSIONS = { canAccessAdmin: true } as SanitizedPermissions;

/** Permissions-object met leestoegang tot elke collectie/global die ergens in NAV_GROUPS voorkomt. */
function maakVolledigeToegang(): SanitizedPermissions {
  const collections: Record<string, { read: true }> = {};
  const globals: Record<string, { read: true }> = {};
  for (const group of NAV_GROUPS) {
    for (const item of [...group.items, ...(group.mutedItems ?? [])]) {
      if (!item.permission) continue;
      const target = item.permission.type === "collection" ? collections : globals;
      target[item.permission.slug] = { read: true };
    }
  }
  return { canAccessAdmin: true, collections, globals } as unknown as SanitizedPermissions;
}

function maakEditorPermissions(): SanitizedPermissions {
  const collections: Record<string, { read?: true }> = {};
  const globals: Record<string, { read?: true }> = {};
  for (const group of NAV_GROUPS) {
    for (const item of [...group.items, ...(group.mutedItems ?? [])]) {
      if (!item.permission) continue;
      const target = item.permission.type === "collection" ? collections : globals;
      // Redacteur: alles behalve de bekende adminOnly-items zichtbaar — die
      // laten we hier bewust weg i.p.v. read:true te zetten.
      target[item.permission.slug] = { read: true };
    }
  }
  // De acht bevestigd adminOnly-items (zie payload/access/roles.ts se
  // adminOnly-gebruik) krijgen hier GEEN leestoegang — zelfde als een echte
  // redacteur vandaag al niet in Payload's eigen automatisch gegenereerde
  // nav zou zien.
  for (const slug of [
    "knowledge-sources",
    "knowledge-drafts",
    "support-threads",
    "assistant-eval-questions",
    "assistant-eval-runs",
  ]) {
    delete collections[slug];
  }
  for (const slug of ["gmail-connection", "knowledge-search", "assistant-eval"]) {
    delete globals[slug];
  }
  return { canAccessAdmin: true, collections, globals } as unknown as SanitizedPermissions;
}

describe("nav-groups", () => {
  it("bevat alle 4 verwachte hoofdgroepen, in vaste volgorde", () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(["algemeen", "helpdesk-ai", "creator", "curriculum-werkplaats"]);
  });

  it("isNavItemVisible: een item zonder permission-veld (custom view) is altijd zichtbaar", () => {
    const item = { label: "Varianten", href: "/admin/varianten", icon: NAV_GROUPS[0]!.icon };
    expect(isNavItemVisible(item, null)).toBe(true);
    expect(isNavItemVisible(item, undefined)).toBe(true);
    expect(isNavItemVisible(item, ADMIN_PERMISSIONS)).toBe(true);
  });

  it("isNavItemVisible: een collectie-item zonder leestoegang in permissions is onzichtbaar", () => {
    const item = {
      label: "Kennisbronnen",
      href: "/admin/collections/knowledge-sources",
      icon: NAV_GROUPS[0]!.icon,
      permission: { type: "collection" as const, slug: "knowledge-sources" },
    };
    expect(isNavItemVisible(item, ADMIN_PERMISSIONS)).toBe(false);
    expect(isNavItemVisible(item, { canAccessAdmin: true, collections: { "knowledge-sources": { read: true } } } as unknown as SanitizedPermissions)).toBe(true);
  });

  it("getVisibleNavGroups: admin (alle collecties/globals leesbaar) ziet ieder item", () => {
    const zichtbaar = getVisibleNavGroups(maakVolledigeToegang());
    const totaalVandaag = NAV_GROUPS.reduce((n, g) => n + g.items.length + (g.mutedItems?.length ?? 0), 0);
    const totaalZichtbaar = zichtbaar.reduce((n, g) => n + g.items.length + g.mutedItems.length, 0);
    expect(totaalZichtbaar).toBe(totaalVandaag);
  });

  it("getVisibleNavGroups: een redacteur zonder adminOnly-toegang ziet de acht adminOnly-items niet, maar wel alle andere items", () => {
    const zichtbaar = getVisibleNavGroups(maakEditorPermissions());
    const alleZichtbareLabels = zichtbaar.flatMap((g) => [...g.items, ...g.mutedItems]).map((i) => i.label);

    expect(alleZichtbareLabels).not.toContain("Kennisbronnen");
    expect(alleZichtbareLabels).not.toContain("Knowledge Drafts");
    expect(alleZichtbareLabels).not.toContain("Support Threads");
    expect(alleZichtbareLabels).not.toContain("AI Evaluation Questions");
    expect(alleZichtbareLabels).not.toContain("AI Evaluation Runs");
    expect(alleZichtbareLabels).not.toContain("Gmail-koppeling");
    expect(alleZichtbareLabels).not.toContain("Knowledge Search");
    expect(alleZichtbareLabels).not.toContain("AI-evaluatie");

    // Custom views (geen permission-veld) blijven altijd zichtbaar.
    expect(alleZichtbareLabels).toContain("Varianten");
    expect(alleZichtbareLabels).toContain("AI Verbetercentrum");
    expect(alleZichtbareLabels).toContain("Curriculum Werkplaats");
    // Gewone, niet-adminOnly collecties blijven ook zichtbaar.
    expect(alleZichtbareLabels).toContain("Artikelen");
    expect(alleZichtbareLabels).toContain("AI-gesprekken");
  });

  it("getVisibleNavGroups: een groep zonder enig zichtbaar item verdwijnt volledig, behalve met een placeholder", () => {
    const geenToegang = { canAccessAdmin: true, collections: {}, globals: {} } as unknown as SanitizedPermissions;
    const zichtbaar = getVisibleNavGroups(geenToegang);

    // Curriculum Werkplaats heeft precies 1 item, zonder permission-veld
    // (custom view) — blijft dus altijd staan, ook zonder enige toegang.
    expect(zichtbaar.some((g) => g.id === "curriculum-werkplaats")).toBe(true);
    // Creator heeft geen items maar wél een placeholder — blijft dus ook staan.
    expect(zichtbaar.some((g) => g.id === "creator")).toBe(true);
  });

  it("getDashboardCards: bevat uitsluitend items met dashboardCard: true, gegroepeerd per hoofdgroep", () => {
    const kaarten = getDashboardCards(maakVolledigeToegang());
    const algemeen = kaarten.find((g) => g.id === "algemeen");
    expect(algemeen?.items.map((i) => i.label)).toEqual(
      expect.arrayContaining(["Artikelen", "Handleidingen", "Categorieën", "Media", "Varianten", "Gebruikers", "Helpdesk Instellingen"])
    );
    expect(algemeen?.items.map((i) => i.label)).not.toContain("Bronnen"); // geen dashboardCard: true

    const creator = kaarten.find((g) => g.id === "creator");
    expect(creator?.placeholder).toEqual({ label: "Creator", badge: "Binnenkort" });
    expect(creator?.items).toEqual([]);
  });

  it("getDashboardCards: respecteert dezelfde permissiefilter als getVisibleNavGroups", () => {
    const kaarten = getDashboardCards(maakEditorPermissions());
    const helpdeskAi = kaarten.find((g) => g.id === "helpdesk-ai");
    expect(helpdeskAi?.items.map((i) => i.label)).not.toContain("AI-evaluatie");
    expect(helpdeskAi?.items.map((i) => i.label)).toContain("AI-gesprekken");
  });
});
