import type { SanitizedPermissions } from "payload";
import {
  BookMarked,
  BookOpen,
  Bot,
  CirclePlay,
  CircleQuestionMark,
  Database,
  FilePen,
  FlaskConical,
  FolderOpen,
  FolderTree,
  GitBranch,
  GraduationCap,
  Globe,
  Image,
  Inbox,
  LayoutGrid,
  Link2,
  ListChecks,
  ListTodo,
  Mail,
  Megaphone,
  MessageSquare,
  PenTool,
  Phone,
  Rocket,
  School,
  Search,
  Settings,
  Sunrise,
  Tag,
  Tags,
  ThumbsUp,
  TrendingUp,
  Users,
  UsersRound,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import type { NavColor } from "@/lib/admin-nav/nav-colors";
import { heeftAdminPermissie, type AuthUserMetPermissies } from "@/payload/access/menu-permissions";

// Admin-rebrand Fase 1 (2026-08-12), uitgebreid in Fase 1B (2026-08-13):
// enige bron van waarheid voor de MijnLeerlijn-navigatie-indeling — vervangt
// de kale, ongegroepeerde Payload-standaardnav (24 collecties/globals in 3
// technische admin.group-secties) door 4 taakgerichte hoofdgroepen ("wat wil
// ik doen" i.p.v. "hoe heet de databasecollectie"). Puur data + functies,
// geen React — BeheerNavLinks.tsx (sidebar), BeheerDashboard.tsx (gekozen
// dashboardkaarten) én BeheerTopBar.tsx (breadcrumb + toevoegen/verwijderen-
// van-dashboard) lezen allemaal hieruit, zodat kleur/label/icoon/route/groep
// maar op één plek hoeft te kloppen (Fase 1B-eis: niet dupliceren).
//
// Raakt bewust GEEN enkele collectie-/global-config aan (geen admin.hidden) —
// de onderliggende Payload-routes/field-schema's blijven exact zoals vandaag;
// alleen de presentatielaag verbergt de automatisch gegenereerde nav en
// vervangt 'm door wat hier staat. Eén bewuste uitzondering (fix-ronde
// 2026-08-14): de Sales-collecties/-global gebruikten admin.group: "Sales",
// letterlijk dezelfde string als het label hieronder — Payload's <NavGroup>
// stempelt id={`nav-group-${label}`} zonder sanitatie, dus de CSS-regel die
// Payload's eigen (bedoelde) Sales-groep verbergt (admin-shell.css) verborg
// via die gedeelde id ONBEDOELD ook deze custom groep. admin.group op die 5
// bestanden is nu "Sales — systeem" (zuiver presentatie/organisatie, geen
// schema-wijziging, geen migratie nodig) — dit label hieronder blijft "Sales".
export type NavItemPermission = { type: "collection" | "global"; slug: string };

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Kleursleutel (lib/admin-nav/nav-colors.ts, hergebruikt het bestaande
   * categorie-kleurenpalet) — zelfde kleur op het navicoon én de
   * dashboardkaart van hetzelfde item (Fase 1B-eis). Gemute "Technisch"-
   * items houden hun bestaande neutrale grijs in de nav (admin-shell.css) —
   * dit veld is voor hen alleen relevant als ze ooit als dashboardkaart
   * gekozen worden.
   */
  color: NavColor;
  /** Korte omschrijving — gebruikt op de dashboardkaart. */
  description: string;
  /**
   * Alleen zetten voor items die een echte Payload-collectie/-global zijn —
   * bepaalt of `isNavItemVisible` dit item voor de ingelogde gebruiker
   * toont op basis van Payload's EIGEN rolgebaseerde access.read (adminOnly/
   * anyEditor/...). Custom views (bv. "Varianten", "AI Verbetercentrum")
   * hebben geen Payload-permissieobject — voor hen geldt uitsluitend de
   * onderstaande `id`/permissie-gate.
   */
  permission?: NavItemPermission;
  /**
   * Admin gebruikersbeheer — per-gebruiker menupermissies (2026-08-25,
   * "Admin gebruikersbeheer — rechten per hoofdmenu en submenu"): korte,
   * STABIELE identifier van dit item, uniek binnen de groep — NOOIT afgeleid
   * van `label` (een tekstwijziging in het menu mag nooit stilzwijgend
   * bestaande, opgeslagen gebruikersrechten breken). Samen met het
   * bijbehorende `NavGroupDef.id` vormt dit de volledige permissie-ID
   * (`${groupId}.${id}`, bv. "trainers.telefonie") — zie
   * `navItemPermissionId()` hieronder. Verplicht voor ELK item (ook items
   * zonder `permission`-veld) — dit is de ENIGE plek waar een menu-item-ID
   * wordt toegekend; er bestaat bewust geen tweede lijst (opdrachtseis: "Ik
   * wil niet handmatig een tweede lijst met menu-items onderhouden die later
   * uit sync raakt").
   */
  id: string;
}

export interface NavGroupDef {
  id: "algemeen" | "helpdesk-ai" | "creator" | "curriculum-werkplaats" | "sales" | "trainers";
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  /**
   * Alleen voor "Helpdesk AI": technische/pijplijn-tools (Gmail-koppeling,
   * AI-conceptartikelen, geïmporteerde support-threads, de zoek-tester) —
   * geen dagelijkse bestemmingen, dus visueel gedempt, maar NIET verborgen
   * of ingeklapt.
   */
  mutedItems?: NavItem[];
}

export const NAV_GROUPS: NavGroupDef[] = [
  {
    id: "algemeen",
    label: "Algemeen",
    icon: LayoutGrid,
    items: [
      { id: "artikelen", label: "Artikelen", href: "/admin/collections/articles", icon: PenTool, color: "blue", description: "Beheer de centrale kennisartikelen.", permission: { type: "collection", slug: "articles" } },
      { id: "handleidingen", label: "Handleidingen", href: "/admin/collections/handleidingen", icon: BookOpen, color: "green", description: "PDF-handleidingen voor gebruikers.", permission: { type: "collection", slug: "handleidingen" } },
      { id: "categorieen", label: "Categorieën", href: "/admin/collections/categories", icon: Tags, color: "orange", description: "Indeling van artikelen en handleidingen.", permission: { type: "collection", slug: "categories" } },
      { id: "media", label: "Media", href: "/admin/collections/media", icon: Image, color: "purple", description: "Afbeeldingen en bestanden voor content.", permission: { type: "collection", slug: "media" } },
      { id: "bronnen", label: "Bronnen", href: "/admin/collections/sources", icon: Link2, color: "teal", description: "Externe links en bronvermeldingen.", permission: { type: "collection", slug: "sources" } },
      { id: "updates", label: "Updates", href: "/admin/collections/updates", icon: Megaphone, color: "red", description: "Nieuwsberichten en aankondigingen.", permission: { type: "collection", slug: "updates" } },
      { id: "varianten", label: "Varianten", href: "/admin/varianten", icon: Globe, color: "blue", description: "Beheer de white-label varianten." },
      { id: "overrides", label: "Variant Overrides", href: "/admin/collections/variant-overrides", icon: GitBranch, color: "orange", description: "Content-afwijkingen per variant.", permission: { type: "collection", slug: "variant-overrides" } },
      { id: "downloadbeheer", label: "Downloadbeheer", href: "/admin/download-beheer", icon: FolderOpen, color: "teal", description: "Curateer de publieke downloads-bibliotheek." },
      { id: "downloadcategorieen", label: "Downloadcategorieën", href: "/admin/download-categorieen", icon: FolderTree, color: "orange", description: "Indeling van de downloads-bibliotheek." },
      { id: "gebruikers", label: "Gebruikers", href: "/admin/collections/users", icon: Users, color: "green", description: "Beheerders en redacteuren.", permission: { type: "collection", slug: "users" } },
      { id: "instellingen", label: "Helpdesk Instellingen", href: "/admin/globals/helpdesk-instellingen", icon: Settings, color: "slate", description: "Algemene instellingen van de Helpdesk.", permission: { type: "global", slug: "helpdesk-instellingen" } },
    ],
  },
  {
    id: "helpdesk-ai",
    label: "Helpdesk AI",
    icon: Bot,
    items: [
      { id: "kennisbasis", label: "Kennisbasis", href: "/admin/kennisbasis", icon: BookMarked, color: "purple", description: "Achtergrondkennis per variant voor de AI." },
      { id: "kennisbronnen", label: "Kennisbronnen", href: "/admin/collections/knowledge-sources", icon: Database, color: "teal", description: "Brondocumenten voor de AI-kennisbank.", permission: { type: "collection", slug: "knowledge-sources" } },
      { id: "onderwerpen", label: "Helpdesk-onderwerpen", href: "/admin/collections/kennisbasis-onderwerpen", icon: Tag, color: "orange", description: "Onderwerpindeling voor helpdeskvragen.", permission: { type: "collection", slug: "kennisbasis-onderwerpen" } },
      { id: "vragen", label: "Gestelde Helpdeskvragen", href: "/admin/helpdesk-vragen", icon: CircleQuestionMark, color: "green", description: "Vragen die bezoekers aan de AI stelden." },
      { id: "feedback", label: "AI-feedback", href: "/admin/collections/answer-feedback", icon: ThumbsUp, color: "pink", description: "Duim omhoog/omlaag op AI-antwoorden.", permission: { type: "collection", slug: "answer-feedback" } },
      { id: "gesprekken", label: "AI-gesprekken", href: "/admin/collections/assistant-conversations", icon: MessageSquare, color: "blue", description: "Volledige gesprekslog van de AI-assistent.", permission: { type: "collection", slug: "assistant-conversations" } },
      { id: "verbetercentrum", label: "AI Verbetercentrum", href: "/admin/verbetercentrum", icon: TrendingUp, color: "purple", description: "Verbeter AI-antwoorden op basis van feedback." },
      { id: "evaluatie", label: "AI-evaluatie", href: "/admin/globals/assistant-eval", icon: FlaskConical, color: "orange", description: "Instellingen voor de AI-kwaliteitstoets.", permission: { type: "global", slug: "assistant-eval" } },
      { id: "evaluatievragen", label: "AI Evaluation Questions", href: "/admin/collections/assistant-eval-questions", icon: ListChecks, color: "blue", description: "Testvragen voor de AI-kwaliteitstoets.", permission: { type: "collection", slug: "assistant-eval-questions" } },
      { id: "evaluatieruns", label: "AI Evaluation Runs", href: "/admin/collections/assistant-eval-runs", icon: CirclePlay, color: "green", description: "Resultaten van AI-kwaliteitstoetsen.", permission: { type: "collection", slug: "assistant-eval-runs" } },
    ],
    mutedItems: [
      { id: "gmail", label: "Gmail-koppeling", href: "/admin/globals/gmail-connection", icon: Mail, color: "slate", description: "OAuth-koppeling voor het lezen van support-mail.", permission: { type: "global", slug: "gmail-connection" } },
      { id: "drafts", label: "Knowledge Drafts", href: "/admin/collections/knowledge-drafts", icon: FilePen, color: "slate", description: "AI-conceptartikelen ter goedkeuring.", permission: { type: "collection", slug: "knowledge-drafts" } },
      { id: "threads", label: "Support Threads", href: "/admin/collections/support-threads", icon: Inbox, color: "slate", description: "Geïmporteerde support-mailthreads.", permission: { type: "collection", slug: "support-threads" } },
      { id: "zoektester", label: "Knowledge Search", href: "/admin/globals/knowledge-search", icon: Search, color: "slate", description: "Testtool voor semantisch zoeken.", permission: { type: "global", slug: "knowledge-search" } },
    ],
  },
  {
    id: "creator",
    label: "Creator",
    icon: WandSparkles,
    items: [{ id: "creator", label: "Creator", href: "/admin/creator", icon: WandSparkles, color: "purple", description: "Schrijf, herschrijf en verspreid content samen met AI." }],
  },
  {
    id: "curriculum-werkplaats",
    label: "Curriculum Werkplaats",
    icon: PenTool,
    items: [{ id: "werkplaats", label: "Curriculum Werkplaats", href: "/admin/curriculum-werkplaats", icon: PenTool, color: "teal", description: "Open de gekoppelde Curriculum Werkplaats-app." }],
  },
  {
    id: "sales",
    label: "Sales",
    icon: Sunrise,
    items: [
      // Sales UX-ronde 3 (2026-08-14) — label "Overzicht" i.p.v. "Vandaag":
      // het algemene dashboard (BeheerDashboard.tsx) heeft nu zijn eigen
      // "Vandaag"-tab (SalesDashboardPaneel.tsx) die het letterlijke
      // "wat moet ik vandaag doen"-antwoord geeft — dit menu-item/deze pagina
      // (nog steeds SalesVandaagView.tsx, ONGEWIJZIGD qua inhoud) is het
      // bredere Sales-overzicht (vandaag/AI-voorstellen/aandacht
      // nodig/binnenkort). href blijft bewust /admin/sales (veiligste optie,
      // geen routewijziging nodig voor een naamswijziging).
      { id: "overzicht", label: "Overzicht", href: "/admin/sales", icon: Sunrise, color: "blue", description: "Sales-overzicht: vandaag te doen, AI-voorstellen, aandacht nodig." },
      { id: "scholen", label: "Scholen", href: "/admin/sales/scholen", icon: School, color: "teal", description: "Overzicht van alle scholen uit Monday." },
      { id: "acties", label: "Acties", href: "/admin/sales/acties", icon: ListTodo, color: "orange", description: "Alle geaccepteerde Sales-acties." },
      { id: "instellingen", label: "Sales Instellingen", href: "/admin/globals/sales-instellingen", icon: Settings, color: "slate", description: "Standaard follow-up-termijn en voorkeurskanaal.", permission: { type: "global", slug: "sales-instellingen" } },
    ],
  },
  {
    // Traineromgeving V2, Fase 4 (2026-08-24) — Admin Trainerdashboard (spec
    // §1/§17): "Nieuw admin-hoofdonderdeel 'Trainers'... bestaande
    // onderdelen (Trainer Accounts, Telefonie, Trainer bestanden, Trainer
    // deelgroepen) mogen technisch blijven bestaan maar moeten logisch
    // georganiseerd worden zodat trainerbeheer als één samenhangend domein
    // voelt." De vier hieronder verplaatste items waren voorheen in
    // "algemeen" ondergebracht (zie git-historie) — geen enkele
    // collectie-config/route is gewijzigd, uitsluitend deze presentatielaag
    // (zelfde uitgangspunt als de rest van dit bestand, zie de toelichting
    // bovenaan). Zelfde vijf-nieuwe-paden-onder-één-prefix-opzet als "Sales"
    // hierboven (zie payload.config.ts se /trainers/*-registraties,
    // stuk-voor-stuk met exact: true om dezelfde prefix-matchreden).
    id: "trainers",
    label: "Trainers",
    icon: GraduationCap,
    items: [
      // Admin gebruikersbeheer (2026-08-25) — deze 6 item-id's zijn LETTERLIJK
      // overgenomen uit het opdrachtvoorbeeld ("trainers.dashboard",
      // "trainers.trainingen", "trainers.todo", "trainers.activiteit",
      // "trainers.accounts", "trainers.telefonie") — niet zelf verzonnen.
      { id: "dashboard", label: "Dashboard", href: "/admin/trainers", icon: LayoutGrid, color: "teal", description: "Centraal overzicht van alle trainers en hun werk." },
      { id: "trainingen", label: "Alle trainingen", href: "/admin/trainers/trainingen", icon: CirclePlay, color: "blue", description: "Alle trainingen van alle trainers — filters op trainer, school, status, periode, verslagstatus." },
      {
        id: "upsell",
        label: "Trainingen & upsell",
        href: "/admin/trainers/upsell",
        icon: TrendingUp,
        color: "purple",
        description: "MijnLeerlijn vs. aanvullende trainingen — totalen, verdeling per trainer/school, trainer-multiselect.",
      },
      { id: "todo", label: "To do", href: "/admin/trainers/todo", icon: ListTodo, color: "orange", description: "Openstaande acties over alle trainers, dezelfde logica als het trainerdashboard." },
      {
        id: "startbegeleiding",
        label: "Startbegeleiding",
        href: "/admin/trainers/startbegeleiding",
        icon: Rocket,
        color: "purple",
        description: "Nieuwe scholen uit Monday — AI-samenvatting, trainer koppelen, lichte opstarttaak.",
      },
      { id: "activiteit", label: "Activiteit", href: "/admin/trainers/activiteit", icon: MessageSquare, color: "purple", description: "Chronologische activiteit — verslagen en logboekitems van alle trainers." },
      { id: "accounts", label: "Trainer Accounts", href: "/admin/collections/trainer-accounts", icon: GraduationCap, color: "teal", description: "Accounts voor trainers.mijnleerlijn.chat.", permission: { type: "collection", slug: "trainer-accounts" } },
      { id: "telefonie", label: "Telefonie", href: "/admin/collections/trainer-telefonie-oproepen", icon: Phone, color: "teal", description: "Telefonisch ingesproken trainingsverslagen — status, foutdiagnose, transcriptiepogingen.", permission: { type: "collection", slug: "trainer-telefonie-oproepen" } },
      { id: "bestanden", label: "Trainer bestanden", href: "/admin/collections/trainer-bestanden", icon: FolderOpen, color: "orange", description: "Schoolbestanden en algemene trainerbestanden — uploader, scope, school, groepen.", permission: { type: "collection", slug: "trainer-bestanden" } },
      { id: "deelgroepen", label: "Trainer deelgroepen", href: "/admin/collections/trainer-deelgroepen", icon: UsersRound, color: "purple", description: "Groepen waarmee trainers algemene bestanden kunnen delen.", permission: { type: "collection", slug: "trainer-deelgroepen" } },
    ],
  },
];

/**
 * Volledige, stabiele permissie-ID van een menu-item — `${groupId}.${item.id}`
 * (bv. "trainers.telefonie"). De ENIGE plek waar deze twee velden worden
 * samengevoegd — zowel de navigatiefilters hieronder als de gebruikersbeheer-
 * UI (ToegangMenuField) als elke server-side enforcement-plek gebruiken
 * uitsluitend deze functie, nooit een losstaande letterlijke string, zodat
 * een toekomstige groeps- of item-id-wijziging hier maar op één plek hoeft.
 */
export function navItemPermissionId(groupId: NavGroupDef["id"], item: NavItem): string {
  return `${groupId}.${item.id}`;
}

/** Alle geldige menu-permissie-ID's, in NAV_GROUPS-volgorde — bron van waarheid voor de gebruikersbeheer-UI en voor validatie van opgeslagen permissies. */
export function alleMenuPermissieIds(): string[] {
  return NAV_GROUPS.flatMap((group) => [...group.items, ...(group.mutedItems ?? [])].map((item) => navItemPermissionId(group.id, item)));
}

/**
 * Zichtbaarheid van één item: vereist zowel (a) Payload's eigen rolgebaseerde
 * access.read — ONGEWIJZIGD, dekt de bestaande 24 adminOnly/anyEditor-
 * collecties/globals — als (b), nieuw, de per-gebruiker menupermissie uit
 * gebruikersbeheer. Een custom view (geen `permission`-veld) had voorheen
 * altijd (a) === true; nu geldt voor haar uitsluitend nog (b). Bij
 * `permissionMode !== "restricted"` (de standaardwaarde, ook voor elk
 * bestaand account na migratie) is (b) altijd waar — zie
 * `heeftAdminPermissie` in payload/access/menu-permissions.ts — dus dit
 * verandert niets aan het huidige gedrag totdat gebruikersbeheer een account
 * expliciet op "beperkt" zet.
 */
export function isNavItemVisible(
  groupId: NavGroupDef["id"],
  item: NavItem,
  permissions: SanitizedPermissions | null | undefined,
  user: AuthUserMetPermissies | null | undefined
): boolean {
  const roltoegang = !item.permission
    ? true
    : item.permission.type === "collection"
      ? Boolean(permissions?.collections?.[item.permission.slug]?.read)
      : Boolean(permissions?.globals?.[item.permission.slug]?.read);
  if (!roltoegang) return false;
  return heeftAdminPermissie(user, navItemPermissionId(groupId, item));
}

export interface VisibleNavGroup extends Omit<NavGroupDef, "items" | "mutedItems"> {
  items: NavItem[];
  mutedItems: NavItem[];
}

/**
 * Permissiebewuste versie van NAV_GROUPS — filtert items waar de ingelogde
 * gebruiker geen leestoegang toe heeft (rol EN individuele menupermissie) en
 * laat een groep zonder enig zichtbaar item helemaal weg (opdrachtseis §3:
 * "Als binnen een hoofdmenu geen enkel submenu toegankelijk is: hoofdmenu
 * niet tonen" — er bestaat bewust geen apart opgeslagen "hoofdmenu aan/uit"-
 * veld, dat zou een tweede, mogelijk-inconsistente waarheid zijn; zichtbaar
 * hoofdmenu = afgeleid van "heeft minstens één zichtbaar item").
 */
export function getVisibleNavGroups(permissions: SanitizedPermissions | null | undefined, user: AuthUserMetPermissies | null | undefined): VisibleNavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isNavItemVisible(group.id, item, permissions, user)),
    mutedItems: (group.mutedItems ?? []).filter((item) => isNavItemVisible(group.id, item, permissions, user)),
  })).filter((group) => group.items.length > 0 || group.mutedItems.length > 0);
}

export interface DashboardCardGroup {
  id: NavGroupDef["id"];
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

/**
 * Fase 1B: het dashboard toont uitsluitend wat de beheerder zelf gekozen
 * heeft (selectedHrefs, uit de preference — zie dashboard-preferences.ts),
 * niet meer automatisch alle collecties. Permissiefilter blijft gelden (een
 * eerder gekozen item dat een redacteur niet meer mag lezen, verschijnt niet
 * alsnog). Groepen zonder gekozen items vallen weg — de lege-staat wordt
 * door BeheerDashboard.tsx zelf getoond wanneer het totaal leeg is.
 */
export function getSelectedDashboardCards(
  permissions: SanitizedPermissions | null | undefined,
  user: AuthUserMetPermissies | null | undefined,
  selectedHrefs: string[]
): DashboardCardGroup[] {
  const gekozen = new Set(selectedHrefs);
  return getVisibleNavGroups(permissions, user)
    .map((group) => ({
      id: group.id,
      label: group.label,
      icon: group.icon,
      items: [...group.items, ...group.mutedItems].filter((item) => gekozen.has(item.href)),
    }))
    .filter((group) => group.items.length > 0);
}

export interface SelectableNavItem extends NavItem {
  groupId: NavGroupDef["id"];
  groupLabel: string;
}

/** Alle items die een beheerder aan het dashboard kan toevoegen (permissiebewust, geen placeholder-groepen). */
export function getSelectableNavItems(permissions: SanitizedPermissions | null | undefined, user: AuthUserMetPermissies | null | undefined): SelectableNavItem[] {
  return getVisibleNavGroups(permissions, user).flatMap((group) =>
    [...group.items, ...group.mutedItems].map((item) => ({ ...item, groupId: group.id, groupLabel: group.label }))
  );
}

export interface NavPathMatch {
  group: NavGroupDef;
  item: NavItem;
  /** true = dit IS de menupagina zelf (bv. de artikelenlijst); false = een subpad ervan (bv. één artikel bewerken). */
  exact: boolean;
}

/**
 * Zoekt bij een pathname het bijbehorende nav-item + groep op — gedeeld door
 * BeheerTopBar.tsx voor zowel de breadcrumb-labels als het "toevoegen/
 * verwijderen van dashboard"-schakelaar (alleen bij exact === true, zie de
 * opdracht: het gaat om het menu-item zelf, niet een los record erbinnen).
 * Draait op de volledige NAV_GROUPS (niet permissiebewust): wie de pagina al
 * ziet, heeft er per definitie toegang toe (die toegang wordt nu server-side
 * afgedwongen door AdminViewShell.tsx/collectie-access, dus deze aanname
 * blijft geldig — zie payload/access/menu-permissions.ts).
 *
 * Kiest bij meerdere subpad-matches (bv. "/admin/sales" én "/admin/sales/
 * scholen" matchen allebei "/admin/sales/scholen" als subpad) altijd de
 * LANGSTE/meest specifieke href, en geeft een exacte match altijd voorrang —
 * zonder dat zou elke Sales-subpagina onterecht als "Vandaag" (het kortste,
 * eerst-geregistreerde item) herkend worden. Ontdekt tijdens
 * browserverificatie van de Sales-assistent-nav.
 */
export function findNavItemByPath(pathname: string): NavPathMatch | null {
  let beste: NavPathMatch | null = null;
  for (const group of NAV_GROUPS) {
    for (const item of [...group.items, ...(group.mutedItems ?? [])]) {
      if (pathname === item.href) {
        return { group, item, exact: true };
      }
      const binnenSubpad = pathname.startsWith(item.href) && ["/", undefined].includes(pathname[item.href.length]);
      if (binnenSubpad && (!beste || item.href.length > beste.item.href.length)) {
        beste = { group, item, exact: false };
      }
    }
  }
  return beste;
}
