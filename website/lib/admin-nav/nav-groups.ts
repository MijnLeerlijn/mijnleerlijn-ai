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
  Mail,
  Megaphone,
  MessageSquare,
  PenTool,
  Search,
  Settings,
  Tag,
  Tags,
  ThumbsUp,
  TrendingUp,
  Users,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";

// Admin-rebrand Fase 1 (2026-08-12): enige bron van waarheid voor de
// MijnLeerlijn-navigatie-indeling — vervangt de kale, ongegroepeerde
// Payload-standaardnav (24 collecties/globals in 3 technische
// admin.group-secties) door 4 taakgerichte hoofdgroepen ("wat wil ik doen"
// i.p.v. "hoe heet de databasecollectie"). Puur data + functies, geen
// React — zowel BeheerNavLinks.tsx (sidebar) als BeheerDashboard.tsx
// (snelle-ingangen-kaarten) lezen hieruit, zodat de indeling maar op één
// plek hoeft te kloppen.
//
// Raakt bewust GEEN enkele collectie-/global-config aan (geen admin.group-
// wijziging, geen admin.hidden) — de onderliggende Payload-nav/routes/
// field-schema's blijven exact zoals vandaag; alleen de presentatielaag
// (payload/components/BeheerNavLinks.tsx + admin-shell.css) verbergt de
// automatisch gegenereerde nav en vervangt 'm door wat hier staat.
export type NavItemPermission = { type: "collection" | "global"; slug: string };

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Alleen zetten voor items die een echte Payload-collectie/-global zijn —
   * bepaalt of `isNavItemVisible` dit item voor de ingelogde gebruiker
   * toont. Custom views (bv. "Varianten", "AI Verbetercentrum") hebben geen
   * Payload-permissieobject en blijven daarom altijd zichtbaar — exact het
   * gedrag van de bestaande BasisNavLinks.tsx/VariantenNavLinks.tsx vandaag
   * (die renderen ook onvoorwaardelijk, wat vandaag geen probleem is omdat
   * geen van hun 7 doelen door een adminOnly-collectie wordt afgeschermd).
   */
  permission?: NavItemPermission;
  /** Toont dit item ook als snelle-ingang-kaart op het dashboard. */
  dashboardCard?: boolean;
}

export interface NavGroupDef {
  id: "algemeen" | "helpdesk-ai" | "creator" | "curriculum-werkplaats";
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  /**
   * Alleen voor "Helpdesk AI": technische/pijplijn-tools (Gmail-koppeling,
   * AI-conceptartikelen, geïmporteerde support-threads, de zoek-tester) —
   * geen dagelijkse bestemmingen, dus visueel gedempt, maar NIET verborgen
   * of ingeklapt (de opdracht was informatiearchitectuur, geen verwijdering).
   */
  mutedItems?: NavItem[];
  /** Alleen voor "Creator": nog geen functionaliteit, zie het plan Fase 1. */
  placeholder?: { label: string; badge: string };
}

export const NAV_GROUPS: NavGroupDef[] = [
  {
    id: "algemeen",
    label: "Algemeen",
    icon: LayoutGrid,
    items: [
      { label: "Artikelen", href: "/admin/collections/articles", icon: PenTool, permission: { type: "collection", slug: "articles" }, dashboardCard: true },
      { label: "Handleidingen", href: "/admin/collections/handleidingen", icon: BookOpen, permission: { type: "collection", slug: "handleidingen" }, dashboardCard: true },
      { label: "Categorieën", href: "/admin/collections/categories", icon: Tags, permission: { type: "collection", slug: "categories" }, dashboardCard: true },
      { label: "Media", href: "/admin/collections/media", icon: Image, permission: { type: "collection", slug: "media" }, dashboardCard: true },
      { label: "Bronnen", href: "/admin/collections/sources", icon: Link2, permission: { type: "collection", slug: "sources" } },
      { label: "Updates", href: "/admin/collections/updates", icon: Megaphone, permission: { type: "collection", slug: "updates" } },
      { label: "Varianten", href: "/admin/varianten", icon: Globe, dashboardCard: true },
      { label: "Variant Overrides", href: "/admin/collections/variant-overrides", icon: GitBranch, permission: { type: "collection", slug: "variant-overrides" } },
      { label: "Downloadbeheer", href: "/admin/download-beheer", icon: FolderOpen },
      { label: "Downloadcategorieën", href: "/admin/download-categorieen", icon: FolderTree },
      { label: "Gebruikers", href: "/admin/collections/users", icon: Users, permission: { type: "collection", slug: "users" }, dashboardCard: true },
      { label: "Helpdesk Instellingen", href: "/admin/globals/helpdesk-instellingen", icon: Settings, permission: { type: "global", slug: "helpdesk-instellingen" }, dashboardCard: true },
    ],
  },
  {
    id: "helpdesk-ai",
    label: "Helpdesk AI",
    icon: Bot,
    items: [
      { label: "Kennisbasis", href: "/admin/kennisbasis", icon: BookMarked, dashboardCard: true },
      { label: "Kennisbronnen", href: "/admin/collections/knowledge-sources", icon: Database, permission: { type: "collection", slug: "knowledge-sources" } },
      { label: "Helpdesk-onderwerpen", href: "/admin/collections/kennisbasis-onderwerpen", icon: Tag, permission: { type: "collection", slug: "kennisbasis-onderwerpen" } },
      { label: "Gestelde Helpdeskvragen", href: "/admin/helpdesk-vragen", icon: CircleQuestionMark, dashboardCard: true },
      { label: "AI-feedback", href: "/admin/collections/answer-feedback", icon: ThumbsUp, permission: { type: "collection", slug: "answer-feedback" } },
      { label: "AI-gesprekken", href: "/admin/collections/assistant-conversations", icon: MessageSquare, permission: { type: "collection", slug: "assistant-conversations" }, dashboardCard: true },
      { label: "AI Verbetercentrum", href: "/admin/verbetercentrum", icon: TrendingUp },
      { label: "AI-evaluatie", href: "/admin/globals/assistant-eval", icon: FlaskConical, permission: { type: "global", slug: "assistant-eval" }, dashboardCard: true },
      { label: "AI Evaluation Questions", href: "/admin/collections/assistant-eval-questions", icon: ListChecks, permission: { type: "collection", slug: "assistant-eval-questions" } },
      { label: "AI Evaluation Runs", href: "/admin/collections/assistant-eval-runs", icon: CirclePlay, permission: { type: "collection", slug: "assistant-eval-runs" } },
    ],
    mutedItems: [
      { label: "Gmail-koppeling", href: "/admin/globals/gmail-connection", icon: Mail, permission: { type: "global", slug: "gmail-connection" } },
      { label: "Knowledge Drafts", href: "/admin/collections/knowledge-drafts", icon: FilePen, permission: { type: "collection", slug: "knowledge-drafts" } },
      { label: "Support Threads", href: "/admin/collections/support-threads", icon: Inbox, permission: { type: "collection", slug: "support-threads" } },
      { label: "Knowledge Search", href: "/admin/globals/knowledge-search", icon: Search, permission: { type: "global", slug: "knowledge-search" } },
    ],
  },
  {
    id: "creator",
    label: "Creator",
    icon: WandSparkles,
    items: [],
    placeholder: { label: "Creator", badge: "Binnenkort" },
  },
  {
    id: "curriculum-werkplaats",
    label: "Curriculum Werkplaats",
    icon: PenTool,
    items: [{ label: "Curriculum Werkplaats", href: "/admin/curriculum-werkplaats", icon: PenTool, dashboardCard: true }],
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
 * zichtbaar item helemaal weg. Zonder dit zou de nieuwe, alles-in-één nav
 * een regressie zijn t.o.v. vandaag, waar Payload's eigen visibleEntities-
 * filtering dit al afdwingt voor de automatisch gegenereerde nav.
 */
export function getVisibleNavGroups(permissions: SanitizedPermissions | null | undefined): VisibleNavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isNavItemVisible(item, permissions)),
    mutedItems: (group.mutedItems ?? []).filter((item) => isNavItemVisible(item, permissions)),
  })).filter((group) => group.items.length > 0 || group.mutedItems.length > 0 || Boolean(group.placeholder));
}

export interface DashboardCardGroup {
  id: NavGroupDef["id"];
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  placeholder?: NavGroupDef["placeholder"];
}

/** Gecureerde subset van getVisibleNavGroups() voor de dashboard-snelle-ingangen — alleen items met dashboardCard: true. */
export function getDashboardCards(permissions: SanitizedPermissions | null | undefined): DashboardCardGroup[] {
  return getVisibleNavGroups(permissions)
    .map((group) => ({
      id: group.id,
      label: group.label,
      icon: group.icon,
      items: [...group.items, ...group.mutedItems].filter((item) => item.dashboardCard),
      placeholder: group.placeholder,
    }))
    .filter((group) => group.items.length > 0 || Boolean(group.placeholder));
}
