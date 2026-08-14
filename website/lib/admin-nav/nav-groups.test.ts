import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SanitizedPermissions } from "payload";
import { NAV_GROUPS, getVisibleNavGroups, getSelectedDashboardCards, getSelectableNavItems, findNavItemByPath, isNavItemVisible } from "./nav-groups";

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
  it("bevat alle 5 verwachte hoofdgroepen, in vaste volgorde", () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(["algemeen", "helpdesk-ai", "creator", "curriculum-werkplaats", "sales"]);
  });

  it("elk item heeft een kleur en een omschrijving (nodig voor nav-icoon én dashboardkaart)", () => {
    for (const group of NAV_GROUPS) {
      for (const item of [...group.items, ...(group.mutedItems ?? [])]) {
        expect(item.color, `${item.label} mist color`).toBeTruthy();
        expect(item.description, `${item.label} mist description`).toBeTruthy();
      }
    }
  });

  it("isNavItemVisible: een item zonder permission-veld (custom view) is altijd zichtbaar", () => {
    const item = { label: "Varianten", href: "/admin/varianten", icon: NAV_GROUPS[0]!.icon, color: "blue" as const, description: "" };
    expect(isNavItemVisible(item, null)).toBe(true);
    expect(isNavItemVisible(item, undefined)).toBe(true);
    expect(isNavItemVisible(item, ADMIN_PERMISSIONS)).toBe(true);
  });

  it("isNavItemVisible: een collectie-item zonder leestoegang in permissions is onzichtbaar", () => {
    const item = {
      label: "Kennisbronnen",
      href: "/admin/collections/knowledge-sources",
      icon: NAV_GROUPS[0]!.icon,
      color: "teal" as const,
      description: "",
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

  it("getVisibleNavGroups: een groep waarvan het enige item geen permission-veld heeft (custom view) blijft altijd zichtbaar, ook zonder enige toegang", () => {
    const geenToegang = { canAccessAdmin: true, collections: {}, globals: {} } as unknown as SanitizedPermissions;
    const zichtbaar = getVisibleNavGroups(geenToegang);

    // Curriculum Werkplaats en Creator hebben allebei precies 1 item, zonder
    // permission-veld (custom view) — blijven dus altijd staan, ook zonder
    // enige toegang.
    expect(zichtbaar.some((g) => g.id === "curriculum-werkplaats")).toBe(true);
    expect(zichtbaar.some((g) => g.id === "creator")).toBe(true);
  });

  it("getSelectableNavItems: bevat ieder zichtbaar item, plat, met groepsinfo", () => {
    const selecteerbaar = getSelectableNavItems(maakVolledigeToegang());
    expect(selecteerbaar.some((i) => i.label === "Artikelen" && i.groupId === "algemeen")).toBe(true);
    expect(selecteerbaar.some((i) => i.label === "Kennisbronnen" && i.groupId === "helpdesk-ai")).toBe(true);
    // Ook gemute "Technisch"-items zijn kiesbaar — de demping is alleen visueel in de nav.
    expect(selecteerbaar.some((i) => i.label === "Gmail-koppeling")).toBe(true);
  });

  it("getSelectedDashboardCards: toont uitsluitend de gekozen hrefs, gegroepeerd", () => {
    const gekozen = ["/admin/collections/articles", "/admin/kennisbasis", "/admin/collections/handleidingen"];
    const kaarten = getSelectedDashboardCards(maakVolledigeToegang(), gekozen);

    const algemeen = kaarten.find((g) => g.id === "algemeen");
    expect(algemeen?.items.map((i) => i.label).sort()).toEqual(["Artikelen", "Handleidingen"]);

    const helpdeskAi = kaarten.find((g) => g.id === "helpdesk-ai");
    expect(helpdeskAi?.items.map((i) => i.label)).toEqual(["Kennisbasis"]);

    // Niet-gekozen items verschijnen niet, ook al zijn ze zichtbaar/toegestaan.
    expect(kaarten.flatMap((g) => g.items.map((i) => i.label))).not.toContain("Categorieën");
  });

  it("getSelectedDashboardCards: geen selectie geeft een lege lijst (geen automatische kaarten)", () => {
    expect(getSelectedDashboardCards(maakVolledigeToegang(), [])).toEqual([]);
  });

  it("getSelectedDashboardCards: respecteert de permissiefilter — een adminOnly-item dat eerder gekozen was, verschijnt niet voor een redacteur", () => {
    const gekozen = ["/admin/collections/articles", "/admin/globals/assistant-eval"];
    const kaarten = getSelectedDashboardCards(maakEditorPermissions(), gekozen);
    const alleLabels = kaarten.flatMap((g) => g.items.map((i) => i.label));
    expect(alleLabels).toContain("Artikelen");
    expect(alleLabels).not.toContain("AI-evaluatie");
  });

  it("findNavItemByPath: exacte match op een menupagina", () => {
    const match = findNavItemByPath("/admin/collections/articles");
    expect(match?.item.label).toBe("Artikelen");
    expect(match?.group.id).toBe("algemeen");
    expect(match?.exact).toBe(true);
  });

  it("findNavItemByPath: subpad (bv. één document bewerken) matcht hetzelfde item, maar niet exact", () => {
    const match = findNavItemByPath("/admin/collections/articles/123");
    expect(match?.item.label).toBe("Artikelen");
    expect(match?.exact).toBe(false);
  });

  it("findNavItemByPath: onbekend pad levert niets op", () => {
    expect(findNavItemByPath("/admin/collections/onbekend")).toBeNull();
    expect(findNavItemByPath("/admin")).toBeNull();
  });

  /**
   * Regressietest (fix-ronde, 2026-08-14): "Sales-navigatie ontbreekt in
   * productiemenu". Bevestigde root cause: Payload's <NavGroup> stempelt
   * id={`nav-group-${label}`} letterlijk (@payloadcms/ui, geen sanitatie).
   * De Sales-collecties/-global gebruikten admin.group: "Sales" — exact
   * dezelfde string als het label van deze eigen, custom Sales-groep. De
   * CSS-regel die Payload's natieve (bedoelde) Sales-groep verbergt
   * (admin-shell.css, op diezelfde id) verborg via die botsing ONBEDOELD ook
   * de custom groep zelf: geen enkele test/typecheck/lint ving dit, want
   * beide kanten waren voor zich genomen correct — pas een échte browser liet
   * het zien. Deze test leest de daadwerkelijke admin.group-waarden uit
   * payload/collections/*.ts en payload/globals/*.ts en bevestigt dat geen
   * ervan ooit weer letterlijk gelijk is aan een NAV_GROUPS-label — zodat een
   * toekomstige nieuwe collectie/global dezelfde fout niet stilzwijgend kan
   * herhalen.
   */
  it("geen enkele admin.group-waarde van een collectie/global botst met een NAV_GROUPS-label (voorkomt de Sales-nav-regressie)", () => {
    const customLabels = new Set(NAV_GROUPS.map((g) => g.label));
    const projectRoot = join(__dirname, "../..");
    const bronMappen = [join(projectRoot, "payload/collections"), join(projectRoot, "payload/globals")];

    const gevondenGroepen: { bestand: string; group: string }[] = [];
    for (const map of bronMappen) {
      for (const bestand of readdirSync(map)) {
        if (!bestand.endsWith(".ts") || bestand.endsWith(".test.ts")) continue;
        const inhoud = readFileSync(join(map, bestand), "utf-8");
        for (const match of inhoud.matchAll(/\bgroup:\s*"([^"]+)"/g)) {
          gevondenGroepen.push({ bestand, group: match[1]! });
        }
      }
    }

    // Sanity check op de scan zelf — als dit ooit 0 oplevert, controleert de
    // test hieronder stilzwijgend niets meer (bv. door een pad-wijziging).
    expect(gevondenGroepen.length).toBeGreaterThan(10);

    const botsingen = gevondenGroepen.filter((g) => customLabels.has(g.group));
    expect(botsingen, `admin.group-waarde(s) botsen met een NAV_GROUPS-label: ${JSON.stringify(botsingen)}`).toEqual([]);
  });

  // Regressietest (Sales-assistent V1, 2026-08-14; label "Vandaag" ->
  // "Overzicht" in Sales UX-ronde 3): "/admin/sales" (Overzicht) is een
  // prefix van "/admin/sales/scholen"/"/admin/sales/acties" — de eerste,
  // kortste-match-wint implementatie herkende elke Sales-subpagina onterecht
  // als het kortste item. Ontdekt tijdens browserverificatie.
  it("findNavItemByPath: een langer, exact matchend sub-item wint van een korter item waarvan het pad een prefix is", () => {
    const matchScholen = findNavItemByPath("/admin/sales/scholen");
    expect(matchScholen?.item.label).toBe("Scholen");
    expect(matchScholen?.exact).toBe(true);

    const matchActies = findNavItemByPath("/admin/sales/acties");
    expect(matchActies?.item.label).toBe("Acties");
    expect(matchActies?.exact).toBe(true);

    const matchOverzicht = findNavItemByPath("/admin/sales");
    expect(matchOverzicht?.item.label).toBe("Overzicht");
    expect(matchOverzicht?.exact).toBe(true);
  });

  it("findNavItemByPath: kiest bij meerdere subpad-matches (geen exacte match) de langste/meest specifieke", () => {
    // "/admin/sales/scholen/iets-onbekends" matcht als subpad zowel Overzicht
    // ("/admin/sales") als Scholen ("/admin/sales/scholen") — Scholen moet winnen.
    const match = findNavItemByPath("/admin/sales/scholen/iets-onbekends");
    expect(match?.item.label).toBe("Scholen");
    expect(match?.exact).toBe(false);
  });
});
