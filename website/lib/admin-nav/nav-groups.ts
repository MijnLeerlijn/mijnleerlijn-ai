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
  School,
  Search,
  Settings,
  Sunrise,
  Tag,
  Tags,
  ThumbsUp,
  TrendingUp,
  Users,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import type { NavColor } from "@/lib/admin-nav/nav-colors";

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
// Raakt bewust GEEN enkele collectie-/global-config aan (geen admin.group-
// wijziging, geen admin.hidden) — de onderliggende Payload-nav/routes/
// field-schema's blijven exact zoals vandaag; alleen de presentatielaag
// verbergt de automatisch gegenereerde nav en vervangt 'm door wat hier staat.
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
   * toont. Custom views (bv. "Varianten", "AI Verbetercentrum") hebben geen
   * Payload-permissieobject en blijven daarom altijd zichtbaar.
   */
  permission?: NavItemPermission;
}

export interface NavGroupDef {
  id: "algemeen" | "helpdesk-ai" | "creator" | "curriculum-werkplaats" | "sales";
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
      { label: "Artikelen", href: "/admin/collections/articles", icon: PenTool, color: "blue", description: "Beheer de centrale kennisartikelen.", permission: { type: "collection", slug: "articles" } },
      { label: "Handleidingen", href: "/admin/collections/handleidingen", icon: BookOpen, color: "green", description: "PDF-handleidingen voor gebruikers.", permission: { type: "collection", slug: "handleidingen" } },
      { label: "Categorieën", href: "/admin/collections/categories", icon: Tags, color: "orange", description: "Indeling van artikelen en handleidingen.", permission: { type: "collection", slug: "categories" } },
      { label: "Media", href: "/admin/collections/media", icon: Image, color: "purple", description: "Afbeeldingen en bestanden voor content.", permission: { type: "collection", slug: "media" } },
      { label: "Bronnen", href: "/admin/collections/sources", icon: Link2, color: "teal", description: "Externe links en bronvermeldingen.", permission: { type: "collection", slug: "sources" } },
      { label: "Updates", href: "/admin/collections/updates", icon: Megaphone, color: "red", description: "Nieuwsberichten en aankondigingen.", permission: { type: "collection", slug: "updates" } },
      { label: "Varianten", href: "/admin/varianten", icon: Globe, color: "blue", description: "Beheer de white-label varianten." },
      { label: "Variant Overrides", href: "/admin/collections/variant-overrides", icon: GitBranch, color: "orange", description: "Content-afwijkingen per variant.", permission: { type: "collection", slug: "variant-overrides" } },
      { label: "Downloadbeheer", href: "/admin/download-beheer", icon: FolderOpen, color: "teal", description: "Curateer de publieke downloads-bibliotheek." },
      { label: "Downloadcategorieën", href: "/admin/download-categorieen", icon: FolderTree, color: "orange", description: "Indeling van de downloads-bibliotheek." },
      { label: "Gebruikers", href: "/admin/collections/users", icon: Users, color: "green", description: "Beheerders en redacteuren.", permission: { type: "collection", slug: "users" } },
      { label: "Helpdesk Instellingen", href: "/admin/globals/helpdesk-instellingen", icon: Settings, color: "slate", description: "Algemene instellingen van de Helpdesk.", permission: { type: "global", slug: "helpdesk-instellingen" } },
    ],
  },
  {
    id: "helpdesk-ai",
    label: "Helpdesk AI",
    icon: Bot,
    items: [
      { label: "Kennisbasis", href: "/admin/kennisbasis", icon: BookMarked, color: "purple", description: "Achtergrondkennis per variant voor de AI." },
      { label: "Kennisbronnen", href: "/admin/collections/knowledge-sources", icon: Database, color: "teal", description: "Brondocumenten voor de AI-kennisbank.", permission: { type: "collection", slug: "knowledge-sources" } },
      { label: "Helpdesk-onderwerpen", href: "/admin/collections/kennisbasis-onderwerpen", icon: Tag, color: "orange", description: "Onderwerpindeling voor helpdeskvragen.", permission: { type: "collection", slug: "kennisbasis-onderwerpen" } },
      { label: "Gestelde Helpdeskvragen", href: "/admin/helpdesk-vragen", icon: CircleQuestionMark, color: "green", description: "Vragen die bezoekers aan de AI stelden." },
      { label: "AI-feedback", href: "/admin/collections/answer-feedback", icon: ThumbsUp, color: "pink", description: "Duim omhoog/omlaag op AI-antwoorden.", permission: { type: "collection", slug: "answer-feedback" } },
      { label: "AI-gesprekken", href: "/admin/collections/assistant-conversations", icon: MessageSquare, color: "blue", description: "Volledige gesprekslog van de AI-assistent.", permission: { type: "collection", slug: "assistant-conversations" } },
      { label: "AI Verbetercentrum", href: "/admin/verbetercentrum", icon: TrendingUp, color: "purple", description: "Verbeter AI-antwoorden op basis van feedback." },
      { label: "AI-evaluatie", href: "/admin/globals/assistant-eval", icon: FlaskConical, color: "orange", description: "Instellingen voor de AI-kwaliteitstoets.", permission: { type: "global", slug: "assistant-eval" } },
      { label: "AI Evaluation Questions", href: "/admin/collections/assistant-eval-questions", icon: ListChecks, color: "blue", description: "Testvragen voor de AI-kwaliteitstoets.", permission: { type: "collection", slug: "assistant-eval-questions" } },
      { label: "AI Evaluation Runs", href: "/admin/collections/assistant-eval-runs", icon: CirclePlay, color: "green", description: "Resultaten van AI-kwaliteitstoetsen.", permission: { type: "collection", slug: "assistant-eval-runs" } },
    ],
    mutedItems: [
      { label: "Gmail-koppeling", href: "/admin/globals/gmail-connection", icon: Mail, color: "slate", description: "OAuth-koppeling voor het lezen van support-mail.", permission: { type: "global", slug: "gmail-connection" } },
      { label: "Knowledge Drafts", href: "/admin/collections/knowledge-drafts", icon: FilePen, color: "slate", description: "AI-conceptartikelen ter goedkeuring.", permission: { type: "collection", slug: "knowledge-drafts" } },
      { label: "Support Threads", href: "/admin/collections/support-threads", icon: Inbox, color: "slate", description: "Geïmporteerde support-mailthreads.", permission: { type: "collection", slug: "support-threads" } },
      { label: "Knowledge Search", href: "/admin/globals/knowledge-search", icon: Search, color: "slate", description: "Testtool voor semantisch zoeken.", permission: { type: "global", slug: "knowledge-search" } },
    ],
  },
  {
    id: "creator",
    label: "Creator",
    icon: WandSparkles,
    items: [{ label: "Creator", href: "/admin/creator", icon: WandSparkles, color: "purple", description: "Schrijf, herschrijf en verspreid content samen met AI." }],
  },
  {
    id: "curriculum-werkplaats",
    label: "Curriculum Werkplaats",
    icon: PenTool,
    items: [{ label: "Curriculum Werkplaats", href: "/admin/curriculum-werkplaats", icon: PenTool, color: "teal", description: "Open de gekoppelde Curriculum Werkplaats-app." }],
  },
  {
    id: "sales",
    label: "Sales",
    icon: Sunrise,
    items: [
      { label: "Vandaag", href: "/admin/sales", icon: Sunrise, color: "blue", description: "Dagelijks werkscherm: vandaag te doen, AI-voorstellen, wachtend." },
      { label: "Scholen", href: "/admin/sales/scholen", icon: School, color: "teal", description: "Overzicht van alle scholen uit Monday." },
      { label: "Acties", href: "/admin/sales/acties", icon: ListTodo, color: "orange", description: "Alle geaccepteerde Sales-acties." },
      { label: "Sales Instellingen", href: "/admin/globals/sales-instellingen", icon: Settings, color: "slate", description: "Standaard follow-up-termijn en voorkeurskanaal.", permission: { type: "global", slug: "sales-instellingen" } },
    ],
  },
];

export function isNavItemVisible(item: NavItem, permissions: SanitizedPermissions | null | undefined): boolean {
  if (!item.permission) return true;
  if (item.permission.type === "collection") {
    return Boolean(permissions?.collections?.[item.permission.slug]?.read);
  }
  return Boolean(permissions?.globals?.[item.permission.slug]?.read);
}

export interface VisibleNavGroup extends Omit<NavGroupDef, "items" | "mutedItems"> {
  items: NavItem[];
  mutedItems: NavItem[];
}

/**
 * Permissiebewuste versie van NAV_GROUPS — filtert items waar de ingelogde
 * gebruiker geen leestoegang toe heeft (bv. de 8 adminOnly-collecties/
 * -globals, onzichtbaar voor een redacteur) en laat een groep zonder enig
 * zichtbaar item helemaal weg.
 */
export function getVisibleNavGroups(permissions: SanitizedPermissions | null | undefined): VisibleNavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isNavItemVisible(item, permissions)),
    mutedItems: (group.mutedItems ?? []).filter((item) => isNavItemVisible(item, permissions)),
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
export function getSelectedDashboardCards(permissions: SanitizedPermissions | null | undefined, selectedHrefs: string[]): DashboardCardGroup[] {
  const gekozen = new Set(selectedHrefs);
  return getVisibleNavGroups(permissions)
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
export function getSelectableNavItems(permissions: SanitizedPermissions | null | undefined): SelectableNavItem[] {
  return getVisibleNavGroups(permissions).flatMap((group) =>
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
 * ziet, heeft er per definitie toegang toe.
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
