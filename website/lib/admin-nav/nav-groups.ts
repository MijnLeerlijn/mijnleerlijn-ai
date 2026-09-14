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

export type NavItemPermission = { type: "collection" | "global"; slug: string };

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  color: NavColor;
  description: string;
  permission?: NavItemPermission;
  id: string;
}

export interface NavGroupDef {
  id: "algemeen" | "helpdesk-ai" | "creator" | "curriculum-werkplaats" | "sales" | "trainers";
  label: string;
  icon: LucideIcon;
  items: NavItem[];
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
      // IDs van de bestaande routes blijven bewust stabiel: sales.overzicht en
      // sales.scholen blijven werken voor al bestaande restricted accounts.
      { id: "overzicht", label: "Dashboard", href: "/admin/sales", icon: LayoutGrid, color: "blue", description: "Commercieel dashboard met groei, funnel, licenties, doelen en upsell." },
      { id: "scholen", label: "Pipeline", href: "/admin/sales/scholen", icon: School, color: "teal", description: "Salespipeline en scholen uit Monday." },
      { id: "doelstellingen", label: "Doelstellingen", href: "/admin/collections/sales-goals", icon: TrendingUp, color: "purple", description: "Beheer commerciële doelen op nieuwe licenties.", permission: { type: "collection", slug: "sales-goals" } },
      { id: "partners", label: "Partners", href: "/admin/collections/sales-partners", icon: UsersRound, color: "orange", description: "Partnerdossiers, afspraken, acties en mijlpalen.", permission: { type: "collection", slug: "sales-partners" } },
    ],
  },
  {
    id: "trainers",
    label: "Trainers",
    icon: GraduationCap,
    items: [
      { id: "dashboard", label: "Dashboard", href: "/admin/trainers", icon: LayoutGrid, color: "teal", description: "Centraal overzicht van alle trainers en hun werk." },
      { id: "trainingen", label: "Alle trainingen", href: "/admin/trainers/trainingen", icon: CirclePlay, color: "blue", description: "Alle trainingen van alle trainers — filters op trainer, school, status, periode, verslagstatus." },
      { id: "upsell", label: "Trainingen & upsell", href: "/admin/trainers/upsell", icon: TrendingUp, color: "purple", description: "MijnLeerlijn vs. aanvullende trainingen — totalen, verdeling per trainer/school, trainer-multiselect." },
      { id: "todo", label: "To do", href: "/admin/trainers/todo", icon: ListTodo, color: "orange", description: "Openstaande acties over alle trainers, dezelfde logica als het trainerdashboard." },
      { id: "startbegeleiding", label: "Startbegeleiding", href: "/admin/trainers/startbegeleiding", icon: Rocket, color: "purple", description: "Nieuwe scholen uit Monday — AI-samenvatting, trainer koppelen, lichte opstarttaak." },
      { id: "activiteit", label: "Activiteit", href: "/admin/trainers/activiteit", icon: MessageSquare, color: "purple", description: "Chronologische activiteit — verslagen en logboekitems van alle trainers." },
      { id: "accounts", label: "Trainer Accounts", href: "/admin/collections/trainer-accounts", icon: GraduationCap, color: "teal", description: "Accounts voor trainers.mijnleerlijn.chat.", permission: { type: "collection", slug: "trainer-accounts" } },
      { id: "telefonie", label: "Telefonie", href: "/admin/collections/trainer-telefonie-oproepen", icon: Phone, color: "teal", description: "Telefonisch ingesproken trainingsverslagen — status, foutdiagnose, transcriptiepogingen.", permission: { type: "collection", slug: "trainer-telefonie-oproepen" } },
      { id: "bestanden", label: "Trainer bestanden", href: "/admin/collections/trainer-bestanden", icon: FolderOpen, color: "orange", description: "Schoolbestanden en algemene trainerbestanden — uploader, scope, school, groepen.", permission: { type: "collection", slug: "trainer-bestanden" } },
      { id: "deelgroepen", label: "Trainer deelgroepen", href: "/admin/collections/trainer-deelgroepen", icon: UsersRound, color: "purple", description: "Groepen waarmee trainers algemene bestanden kunnen delen.", permission: { type: "collection", slug: "trainer-deelgroepen" } },
    ],
  },
];

export function navItemPermissionId(groupId: NavGroupDef["id"], item: NavItem): string {
  return `${groupId}.${item.id}`;
}

export function alleMenuPermissieIds(): string[] {
  return NAV_GROUPS.flatMap((group) => [...group.items, ...(group.mutedItems ?? [])].map((item) => navItemPermissionId(group.id, item)));
}

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

export function getSelectableNavItems(permissions: SanitizedPermissions | null | undefined, user: AuthUserMetPermissies | null | undefined): SelectableNavItem[] {
  return getVisibleNavGroups(permissions, user).flatMap((group) =>
    [...group.items, ...group.mutedItems].map((item) => ({ ...item, groupId: group.id, groupLabel: group.label }))
  );
}

export interface NavPathMatch {
  group: NavGroupDef;
  item: NavItem;
  exact: boolean;
}

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
