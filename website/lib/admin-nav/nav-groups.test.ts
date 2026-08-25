import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SanitizedPermissions } from "payload";
import {
  NAV_GROUPS,
  getVisibleNavGroups,
  getSelectedDashboardCards,
  getSelectableNavItems,
  findNavItemByPath,
  isNavItemVisible,
  navItemPermissionId,
  alleMenuPermissieIds,
} from "./nav-groups";
import type { AuthUserMetPermissies } from "@/payload/access/menu-permissions";

const ADMIN_PERMISSIONS = { canAccessAdmin: true } as SanitizedPermissions;

// Vóór de admin-gebruikersbeheerronde (2026-08-25) bestond er geen
// per-gebruiker menupermissie — elke test hieronder die "het gedrag van
// vandaag" wil nabootsen (d.w.z. uitsluitend Payload's eigen rolgebaseerde
// access.read, zoals vóór dit werk) geeft een gebruiker ZONDER
// permissionMode/permissions mee. heeftAdminPermissie() behandelt dat
// (net als een ontbrekend/"full" permissionMode) als "onbeperkt binnen de
// rol" — zie payload/access/menu-permissions.ts.
const VOLLEDIGE_TOEGANG_USER: AuthUserMetPermissies = {};

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
  // De negen bevestigd adminOnly-items (zie payload/access/roles.ts se
  // adminOnly-gebruik) krijgen hier GEEN leestoegang — zelfde als een echte
  // redacteur vandaag al niet in Payload's eigen automatisch gegenereerde
  // nav zou zien. trainer-telefonie-oproepen (2026-08-25, admin-zichtbaarheid)
  // toegevoegd: read: adminOnly op die collectie, zie
  // payload/collections/TrainerTelefonieOproepen.ts.
  for (const slug of [
    "knowledge-sources",
    "knowledge-drafts",
    "support-threads",
    "assistant-eval-questions",
    "assistant-eval-runs",
    "trainer-telefonie-oproepen",
  ]) {
    delete collections[slug];
  }
  for (const slug of ["gmail-connection", "knowledge-search", "assistant-eval"]) {
    delete globals[slug];
  }
  return { canAccessAdmin: true, collections, globals } as unknown as SanitizedPermissions;
}

describe("nav-groups", () => {
  it("bevat alle 6 verwachte hoofdgroepen, in vaste volgorde", () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(["algemeen", "helpdesk-ai", "creator", "curriculum-werkplaats", "sales", "trainers"]);
  });

  it("elk item heeft een kleur, omschrijving én uniek, stabiel item-id binnen de groep", () => {
    for (const group of NAV_GROUPS) {
      const idsInGroep = new Set<string>();
      for (const item of [...group.items, ...(group.mutedItems ?? [])]) {
        expect(item.color, `${item.label} mist color`).toBeTruthy();
        expect(item.description, `${item.label} mist description`).toBeTruthy();
        expect(item.id, `${item.label} mist id`).toBeTruthy();
        expect(idsInGroep.has(item.id), `${group.id}.${item.id} komt dubbel voor`).toBe(false);
        idsInGroep.add(item.id);
      }
    }
  });

  it("navItemPermissionId/alleMenuPermissieIds: bevat exact de uit de opdracht overgenomen Trainers-ID's", () => {
    const ids = alleMenuPermissieIds();
    for (const verwacht of [
      "trainers.dashboard",
      "trainers.trainingen",
      "trainers.todo",
      "trainers.activiteit",
      "trainers.accounts",
      "trainers.telefonie",
    ]) {
      expect(ids).toContain(verwacht);
    }
    // Elke ID komt precies één keer voor (globaal uniek, niet alleen per groep).
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("isNavItemVisible: een item zonder permission-veld (custom view) is zichtbaar zolang de gebruiker onbeperkt is", () => {
    const item = { id: "varianten", label: "Varianten", href: "/admin/varianten", icon: NAV_GROUPS[0]!.icon, color: "blue" as const, description: "" };
    expect(isNavItemVisible("algemeen", item, null, VOLLEDIGE_TOEGANG_USER)).toBe(true);
    expect(isNavItemVisible("algemeen", item, undefined, VOLLEDIGE_TOEGANG_USER)).toBe(true);
    expect(isNavItemVisible("algemeen", item, ADMIN_PERMISSIONS, VOLLEDIGE_TOEGANG_USER)).toBe(true);
  });

  it("isNavItemVisible: een collectie-item zonder leestoegang in permissions is onzichtbaar", () => {
    const item = {
      id: "kennisbronnen",
      label: "Kennisbronnen",
      href: "/admin/collections/knowledge-sources",
      icon: NAV_GROUPS[0]!.icon,
      color: "teal" as const,
      description: "",
      permission: { type: "collection" as const, slug: "knowledge-sources" },
    };
    expect(isNavItemVisible("helpdesk-ai", item, ADMIN_PERMISSIONS, VOLLEDIGE_TOEGANG_USER)).toBe(false);
    expect(
      isNavItemVisible(
        "helpdesk-ai",
        item,
        { canAccessAdmin: true, collections: { "knowledge-sources": { read: true } } } as unknown as SanitizedPermissions,
        VOLLEDIGE_TOEGANG_USER
      )
    ).toBe(true);
  });

  it("isNavItemVisible: geen toegang zonder ingelogde gebruiker, ook al staat de Payload-rolcheck op groen", () => {
    const item = { id: "varianten", label: "Varianten", href: "/admin/varianten", icon: NAV_GROUPS[0]!.icon, color: "blue" as const, description: "" };
    expect(isNavItemVisible("algemeen", item, ADMIN_PERMISSIONS, null)).toBe(false);
    expect(isNavItemVisible("algemeen", item, ADMIN_PERMISSIONS, undefined)).toBe(false);
  });

  it("getVisibleNavGroups: admin (alle collecties/globals leesbaar, onbeperkte gebruiker) ziet ieder item", () => {
    const zichtbaar = getVisibleNavGroups(maakVolledigeToegang(), VOLLEDIGE_TOEGANG_USER);
    const totaalVandaag = NAV_GROUPS.reduce((n, g) => n + g.items.length + (g.mutedItems?.length ?? 0), 0);
    const totaalZichtbaar = zichtbaar.reduce((n, g) => n + g.items.length + g.mutedItems.length, 0);
    expect(totaalZichtbaar).toBe(totaalVandaag);
  });

  it("getVisibleNavGroups: een redacteur zonder adminOnly-toegang ziet de acht adminOnly-items niet, maar wel alle andere items", () => {
    const zichtbaar = getVisibleNavGroups(maakEditorPermissions(), VOLLEDIGE_TOEGANG_USER);
    const alleZichtbareLabels = zichtbaar.flatMap((g) => [...g.items, ...g.mutedItems]).map((i) => i.label);

    expect(alleZichtbareLabels).not.toContain("Kennisbronnen");
    expect(alleZichtbareLabels).not.toContain("Knowledge Drafts");
    expect(alleZichtbareLabels).not.toContain("Support Threads");
    expect(alleZichtbareLabels).not.toContain("AI Evaluation Questions");
    expect(alleZichtbareLabels).not.toContain("AI Evaluation Runs");
    expect(alleZichtbareLabels).not.toContain("Gmail-koppeling");
    expect(alleZichtbareLabels).not.toContain("Knowledge Search");
    expect(alleZichtbareLabels).not.toContain("AI-evaluatie");
    // Telefoniebeheer (2026-08-25): read: adminOnly op de onderliggende
    // collectie (TrainerTelefonieOproepen.ts) — een redacteur mag dit item
    // dus niet zien, exact zoals de opdracht vereist ("moet niet ineens voor
    // onbevoegde gebruikers zichtbaar worden").
    expect(alleZichtbareLabels).not.toContain("Telefonie");

    // Custom views (geen permission-veld) blijven altijd zichtbaar.
    expect(alleZichtbareLabels).toContain("Varianten");
    expect(alleZichtbareLabels).toContain("AI Verbetercentrum");
    expect(alleZichtbareLabels).toContain("Curriculum Werkplaats");
    // Gewone, niet-adminOnly collecties blijven ook zichtbaar.
    expect(alleZichtbareLabels).toContain("Artikelen");
    expect(alleZichtbareLabels).toContain("AI-gesprekken");
  });

  it("getVisibleNavGroups: een admin ziet het Telefonie-item, in de 'trainers'-groep, met een geldige permission-koppeling naar de bestaande collectie", () => {
    // Traineromgeving V2, Fase 4 (2026-08-24) — verplaatst van "algemeen" naar
    // de nieuwe "trainers"-hoofdgroep (spec §1: bestaand trainerbeheer logisch
    // samenvoegen), zelfde item/href/permission, alleen de groep wijzigde.
    const zichtbaar = getVisibleNavGroups(maakVolledigeToegang(), VOLLEDIGE_TOEGANG_USER);
    const trainers = zichtbaar.find((g) => g.id === "trainers");
    const telefonie = trainers?.items.find((i) => i.label === "Telefonie");
    expect(telefonie).toBeDefined();
    expect(telefonie?.href).toBe("/admin/collections/trainer-telefonie-oproepen");
    expect(telefonie?.permission).toEqual({ type: "collection", slug: "trainer-telefonie-oproepen" });
  });

  it("findNavItemByPath: het Telefonie-item matcht zowel de lijst zelf als een individueel oproep-detailscherm", () => {
    const lijst = findNavItemByPath("/admin/collections/trainer-telefonie-oproepen");
    expect(lijst?.item.label).toBe("Telefonie");
    expect(lijst?.exact).toBe(true);

    const detail = findNavItemByPath("/admin/collections/trainer-telefonie-oproepen/6");
    expect(detail?.item.label).toBe("Telefonie");
    expect(detail?.exact).toBe(false);
  });

  it("getVisibleNavGroups: een groep waarvan het enige item geen permission-veld heeft (custom view) blijft altijd zichtbaar, ook zonder enige Payload-toegang", () => {
    const geenToegang = { canAccessAdmin: true, collections: {}, globals: {} } as unknown as SanitizedPermissions;
    const zichtbaar = getVisibleNavGroups(geenToegang, VOLLEDIGE_TOEGANG_USER);

    // Curriculum Werkplaats en Creator hebben allebei precies 1 item, zonder
    // permission-veld (custom view) — blijven dus altijd staan, ook zonder
    // enige toegang.
    expect(zichtbaar.some((g) => g.id === "curriculum-werkplaats")).toBe(true);
    expect(zichtbaar.some((g) => g.id === "creator")).toBe(true);
  });

  it("getSelectableNavItems: bevat ieder zichtbaar item, plat, met groepsinfo", () => {
    const selecteerbaar = getSelectableNavItems(maakVolledigeToegang(), VOLLEDIGE_TOEGANG_USER);
    expect(selecteerbaar.some((i) => i.label === "Artikelen" && i.groupId === "algemeen")).toBe(true);
    expect(selecteerbaar.some((i) => i.label === "Kennisbronnen" && i.groupId === "helpdesk-ai")).toBe(true);
    // Ook gemute "Technisch"-items zijn kiesbaar — de demping is alleen visueel in de nav.
    expect(selecteerbaar.some((i) => i.label === "Gmail-koppeling")).toBe(true);
  });

  it("getSelectedDashboardCards: toont uitsluitend de gekozen hrefs, gegroepeerd", () => {
    const gekozen = ["/admin/collections/articles", "/admin/kennisbasis", "/admin/collections/handleidingen"];
    const kaarten = getSelectedDashboardCards(maakVolledigeToegang(), VOLLEDIGE_TOEGANG_USER, gekozen);

    const algemeen = kaarten.find((g) => g.id === "algemeen");
    expect(algemeen?.items.map((i) => i.label).sort()).toEqual(["Artikelen", "Handleidingen"]);

    const helpdeskAi = kaarten.find((g) => g.id === "helpdesk-ai");
    expect(helpdeskAi?.items.map((i) => i.label)).toEqual(["Kennisbasis"]);

    // Niet-gekozen items verschijnen niet, ook al zijn ze zichtbaar/toegestaan.
    expect(kaarten.flatMap((g) => g.items.map((i) => i.label))).not.toContain("Categorieën");
  });

  it("getSelectedDashboardCards: geen selectie geeft een lege lijst (geen automatische kaarten)", () => {
    expect(getSelectedDashboardCards(maakVolledigeToegang(), VOLLEDIGE_TOEGANG_USER, [])).toEqual([]);
  });

  it("getSelectedDashboardCards: respecteert de permissiefilter — een adminOnly-item dat eerder gekozen was, verschijnt niet voor een redacteur", () => {
    const gekozen = ["/admin/collections/articles", "/admin/globals/assistant-eval"];
    const kaarten = getSelectedDashboardCards(maakEditorPermissions(), VOLLEDIGE_TOEGANG_USER, gekozen);
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

// Admin gebruikersbeheer — rechten per hoofdmenu en submenu (2026-08-25):
// nieuwe tests voor de per-gebruiker permissielaag zelf (los van Payload's
// rolgebaseerde access.read hierboven, die ongewijzigd blijft gelden).
describe("nav-groups — per-gebruiker menupermissies (restricted)", () => {
  it("een 'restricted'-gebruiker zonder enige toegekende permissie ziet helemaal niets", () => {
    const user: AuthUserMetPermissies = { permissionMode: "restricted", permissions: [] };
    const zichtbaar = getVisibleNavGroups(maakVolledigeToegang(), user);
    expect(zichtbaar).toEqual([]);
  });

  it("een 'restricted'-gebruiker ziet uitsluitend de expliciet toegekende submenu-items", () => {
    const user: AuthUserMetPermissies = {
      permissionMode: "restricted",
      permissions: ["trainers.dashboard", "trainers.trainingen", "trainers.bestanden"],
    };
    const zichtbaar = getVisibleNavGroups(maakVolledigeToegang(), user);
    const trainers = zichtbaar.find((g) => g.id === "trainers");
    const labels = trainers?.items.map((i) => i.label) ?? [];

    expect(labels).toContain("Dashboard");
    expect(labels).toContain("Alle trainingen");
    expect(labels).toContain("Trainer bestanden");
    expect(labels).not.toContain("To do");
    expect(labels).not.toContain("Activiteit");
    expect(labels).not.toContain("Trainer Accounts");
    expect(labels).not.toContain("Telefonie");
    expect(labels).not.toContain("Trainer deelgroepen");

    // Precies het voorbeeld uit de opdracht (§2): andere hoofdmenu's blijven
    // volledig weg zodra er geen enkele toegekende permissie in zit.
    expect(zichtbaar.some((g) => g.id === "sales")).toBe(false);
    expect(zichtbaar.some((g) => g.id === "creator")).toBe(false);
  });

  it("hoofdmenu verdwijnt volledig zodra geen enkel submenu-item ervan is toegekend, óók al bestaat de groep", () => {
    const user: AuthUserMetPermissies = { permissionMode: "restricted", permissions: ["sales.overzicht"] };
    const zichtbaar = getVisibleNavGroups(maakVolledigeToegang(), user);
    expect(zichtbaar.some((g) => g.id === "trainers")).toBe(false);
    expect(zichtbaar.some((g) => g.id === "algemeen")).toBe(false);
    expect(zichtbaar.some((g) => g.id === "sales")).toBe(true);
  });

  it("een 'restricted'-gebruiker heeft nooit MEER dan de rol al toestaat — een adminOnly-collectie blijft verborgen voor een redacteur, ook met de permissie expliciet toegekend", () => {
    const editorMetVolleigePermissie: AuthUserMetPermissies = {
      permissionMode: "restricted",
      // Ook "trainers.dashboard" toegekend, zodat de hele "trainers"-groep
      // sowieso zichtbaar blijft — dit isoleert de assertie hieronder tot
      // specifiek Telefonie (i.p.v. "de hele groep verdwijnt", al gedekt
      // door een andere test hierboven).
      permissions: ["trainers.dashboard", "trainers.telefonie"],
    };
    // maakEditorPermissions() simuleert een redacteur — trainer-telefonie-oproepen
    // heeft GEEN leestoegang (adminOnly op collectieniveau, zie roles.ts).
    const zichtbaar = getVisibleNavGroups(maakEditorPermissions(), editorMetVolleigePermissie);
    const trainers = zichtbaar.find((g) => g.id === "trainers");
    expect(trainers).toBeDefined();
    expect(trainers?.items.some((i) => i.label === "Telefonie")).toBe(false);
  });

  it("een custom view (geen permission-veld) is voor een restricted-gebruiker ook gewoon uit te zetten", () => {
    const user: AuthUserMetPermissies = { permissionMode: "restricted", permissions: ["trainers.dashboard"] };
    const zichtbaar = getVisibleNavGroups(maakVolledigeToegang(), user);
    // "Varianten" (algemeen.varianten) is een custom view zonder permission-veld
    // — vóór deze feature altijd zichtbaar; nu terecht verborgen zonder
    // expliciete toekenning.
    expect(zichtbaar.some((g) => g.id === "algemeen")).toBe(false);
  });

  it("permissionMode ontbrekend of 'full' gedraagt zich identiek aan vóór deze feature (backwards compatible default)", () => {
    const zonderVeld = getVisibleNavGroups(maakVolledigeToegang(), {});
    const expliciefVol = getVisibleNavGroups(maakVolledigeToegang(), { permissionMode: "full" });
    const totaalVandaag = NAV_GROUPS.reduce((n, g) => n + g.items.length + (g.mutedItems?.length ?? 0), 0);

    expect(zonderVeld.reduce((n, g) => n + g.items.length + g.mutedItems.length, 0)).toBe(totaalVandaag);
    expect(expliciefVol.reduce((n, g) => n + g.items.length + g.mutedItems.length, 0)).toBe(totaalVandaag);
  });
});
