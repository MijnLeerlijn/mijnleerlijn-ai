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
  /**
   * Persistente permissiesleutel. Hiermee kan een item visueel naar een andere
   * groep verhuizen zonder bestaande restricted accounts hun toegang te laten
   * verliezen of onbedoeld extra toegang te geven.
   */
  permissionId?: string;
}

export interface NavGroupDef {
  id: "content" | "helpdesk-ai" | "curriculum" | "sales" | "training-begeleiding" | "beheer";
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  mutedItems?: NavItem[];
}

export const NAV_GROUPS: NavGroupDef[] = [
  {
    id: "content",
    label: "Content",
    icon: BookOpen,
    items: [
      { id: "artikelen", permissionId: "algemeen.artikelen", label: "Artikelen", href: "/admin/collections/articles", icon: PenTool, color: "blue", description: "Schrijf en beheer kennisartikelen.", permission: { type: "collection", slug: "articles" } },
      { id: "handleidingen", permissionId: "algemeen.handleidingen", label: "Handleidingen", href: "/admin/collections/handleidingen", icon: BookOpen, color: "green", description: "Beheer PDF-handleidingen voor gebruikers.", permission: { type: "collection", slug: "handleidingen" } },
      { id: "updates", permissionId: "algemeen.updates", label: "Updates", href: "/admin/collections/updates", icon: Megaphone, color: "red", description: "Nieuwsberichten en aankondigingen.", permission: { type: "collection", slug: "updates" } },
      { id: "creator", permissionId: "creator.creator", label: "Creator", href: "/admin/creator", icon: WandSparkles, color: "purple", description: "Maak en verspreid content met AI." },
      { id: "downloadbeheer", permissionId: "algemeen.downloadbeheer", label: "Downloads", href: "/admin/download-beheer", icon: FolderOpen, color: "teal", description: "Beheer wat gebruikers in de downloadbibliotheek zien." },
      { id: "downloadcategorieen", permissionId: "algemeen.downloadcategorieen", label: "Downloadcategorieën", href: "/admin/download-categorieen", icon: FolderTree, color: "orange", description: "Deel downloads logisch in." },
      { id: "media", permissionId: "algemeen.media", label: "Afbeeldingen & bestanden", href: "/admin/collections/media", icon: Image, color: "purple", description: "Afbeeldingen en bestanden die in content worden gebruikt.", permission: { type: "collection", slug: "media" } },
      { id: "categorieen", permissionId: "algemeen.categorieen", label: "Contentcategorieën", href: "/admin/collections/categories", icon: Tags, color: "orange", description: "Indeling van artikelen en handleidingen.", permission: { type: "collection", slug: "categories" } },
      { id: "bronnen", permissionId: "algemeen.bronnen", label: "Bronvermeldingen", href: "/admin/collections/sources", icon: Link2, color: "teal", description: "Externe links en bronvermeldingen bij content.", permission: { type: "collection", slug: "sources" } },
    ],
  },
  {
    id: "helpdesk-ai",
    label: "Helpdesk & AI",
    icon: Bot,
    items: [
      { id: "kennisbasis", permissionId: "helpdesk-ai.kennisbasis", label: "Kennisbasis", href: "/admin/kennisbasis", icon: BookMarked, color: "purple", description: "Beheer de achtergrondkennis die de AI gebruikt." },
      { id: "vragen", permissionId: "helpdesk-ai.vragen", label: "Gestelde vragen", href: "/admin/helpdesk-vragen", icon: CircleQuestionMark, color: "green", description: "Bekijk wat gebruikers aan de helpdesk vragen." },
      { id: "feedback", permissionId: "helpdesk-ai.feedback", label: "Feedback op antwoorden", href: "/admin/collections/answer-feedback", icon: ThumbsUp, color: "pink", description: "Bekijk positieve en negatieve feedback op AI-antwoorden.", permission: { type: "collection", slug: "answer-feedback" } },
      { id: "gesprekken", permissionId: "helpdesk-ai.gesprekken", label: "Gesprekken", href: "/admin/collections/assistant-conversations", icon: MessageSquare, color: "blue", description: "Bekijk volledige gesprekken met de AI-assistent.", permission: { type: "collection", slug: "assistant-conversations" } },
      { id: "verbetercentrum", permissionId: "helpdesk-ai.verbetercentrum", label: "Verbetercentrum", href: "/admin/verbetercentrum", icon: TrendingUp, color: "purple", description: "Verbeter AI-antwoorden op basis van echte vragen en feedback." },
      { id: "kennisbronnen", permissionId: "helpdesk-ai.kennisbronnen", label: "Kennisbronnen", href: "/admin/collections/knowledge-sources", icon: Database, color: "teal", description: "Documenten en bronnen die de AI-kennis voeden.", permission: { type: "collection", slug: "knowledge-sources" } },
      { id: "onderwerpen", permissionId: "helpdesk-ai.onderwerpen", label: "Onderwerpen", href: "/admin/collections/kennisbasis-onderwerpen", icon: Tag, color: "orange", description: "De onderwerpindeling voor helpdeskvragen.", permission: { type: "collection", slug: "kennisbasis-onderwerpen" } },
      { id: "evaluatievragen", permissionId: "helpdesk-ai.evaluatievragen", label: "AI-testvragen", href: "/admin/collections/assistant-eval-questions", icon: ListChecks, color: "blue", description: "Vaste testvragen om de kwaliteit van de AI te controleren.", permission: { type: "collection", slug: "assistant-eval-questions" } },
      { id: "evaluatieruns", permissionId: "helpdesk-ai.evaluatieruns", label: "AI-testresultaten", href: "/admin/collections/assistant-eval-runs", icon: CirclePlay, color: "green", description: "Resultaten van uitgevoerde AI-kwaliteitstests.", permission: { type: "collection", slug: "assistant-eval-runs" } },
    ],
  },
  {
    id: "curriculum",
    label: "Curriculum",
    icon: PenTool,
    items: [
      { id: "werkplaats", permissionId: "curriculum-werkplaats.werkplaats", label: "Curriculum Werkplaats", href: "/admin/curriculum-werkplaats", icon: PenTool, color: "teal", description: "Beheer en begeleid curriculumwerkplaatsen van scholen." },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    icon: Sunrise,
    items: [
      { id: "overzicht", label: "Dashboard", href: "/admin/sales", icon: LayoutGrid, color: "blue", description: "Commercieel dashboard met scholen, licenties, groei en doelen." },
      { id: "scholen", label: "Pipeline", href: "/admin/sales/scholen", icon: School, color: "teal", description: "Bekijk leads, prospects en klanten uit Monday." },
      { id: "doelstellingen", label: "Doelstellingen", href: "/admin/collections/sales-goals", icon: TrendingUp, color: "purple", description: "Beheer commerciële doelen op nieuwe licenties.", permission: { type: "collection", slug: "sales-goals" } },
      { id: "partners", label: "Partners", href: "/admin/collections/sales-partners", icon: UsersRound, color: "orange", description: "Partnerdossiers, afspraken, acties en resultaten.", permission: { type: "collection", slug: "sales-partners" } },
    ],
  },
  {
    id: "training-begeleiding",
    label: "Training & begeleiding",
    icon: GraduationCap,
    items: [
      { id: "dashboard", permissionId: "trainers.dashboard", label: "Dashboard", href: "/admin/trainers", icon: LayoutGrid, color: "teal", description: "Centraal overzicht van trainers en begeleiding." },
      { id: "trainingen", permissionId: "trainers.trainingen", label: "Trainingen", href: "/admin/trainers/trainingen", icon: CirclePlay, color: "blue", description: "Alle trainingen, met filters op trainer, school, status en periode." },
      { id: "upsell", permissionId: "trainers.upsell", label: "Trainingen & upsell", href: "/admin/trainers/upsell", icon: TrendingUp, color: "purple", description: "Bekijk MijnLeerlijn-trainingen en aanvullende trainingen." },
      { id: "startbegeleiding", permissionId: "trainers.startbegeleiding", label: "Startbegeleiding", href: "/admin/trainers/startbegeleiding", icon: Rocket, color: "purple", description: "Begeleid nieuwe scholen bij hun start." },
      { id: "todo", permissionId: "trainers.todo", label: "Taken", href: "/admin/trainers/todo", icon: ListTodo, color: "orange", description: "Openstaande acties over alle trainers en scholen." },
      { id: "activiteit", permissionId: "trainers.activiteit", label: "Verslagen & activiteit", href: "/admin/trainers/activiteit", icon: MessageSquare, color: "purple", description: "Chronologisch overzicht van verslagen en logboekitems." },
    ],
  },
  {
    id: "beheer",
    label: "Beheer",
    icon: Settings,
    items: [
      { id: "gebruikers", permissionId: "algemeen.gebruikers", label: "Gebruikers & rechten", href: "/admin/collections/users", icon: Users, color: "green", description: "Beheer accounts en bepaal welke onderdelen iemand mag zien.", permission: { type: "collection", slug: "users" } },
      { id: "varianten", permissionId: "algemeen.varianten", label: "Varianten / whitelabel", href: "/admin/varianten", icon: Globe, color: "blue", description: "Beheer MijnLeerlijn-varianten en whitelabels." },
      { id: "overrides", permissionId: "algemeen.overrides", label: "Content per variant", href: "/admin/collections/variant-overrides", icon: GitBranch, color: "orange", description: "Beheer afwijkende content per variant.", permission: { type: "collection", slug: "variant-overrides" } },
      { id: "accounts", permissionId: "trainers.accounts", label: "Traineraccounts", href: "/admin/collections/trainer-accounts", icon: GraduationCap, color: "teal", description: "Beheer accounts voor trainers.mijnleerlijn.chat.", permission: { type: "collection", slug: "trainer-accounts" } },
      { id: "telefonie", permissionId: "trainers.telefonie", label: "Ingesproken verslagen", href: "/admin/collections/trainer-telefonie-oproepen", icon: Phone, color: "teal", description: "Beheer telefonisch ingesproken trainingsverslagen.", permission: { type: "collection", slug: "trainer-telefonie-oproepen" } },
      { id: "bestanden", permissionId: "trainers.bestanden", label: "Trainerbestanden", href: "/admin/collections/trainer-bestanden", icon: FolderOpen, color: "orange", description: "Beheer schoolbestanden en algemene bestanden voor trainers.", permission: { type: "collection", slug: "trainer-bestanden" } },
      { id: "deelgroepen", permissionId: "trainers.deelgroepen", label: "Deelgroepen trainers", href: "/admin/collections/trainer-deelgroepen", icon: UsersRound, color: "purple", description: "Beheer groepen waarmee trainers bestanden delen.", permission: { type: "collection", slug: "trainer-deelgroepen" } },
      { id: "instellingen", permissionId: "algemeen.instellingen", label: "Helpdesk-instellingen", href: "/admin/globals/helpdesk-instellingen", icon: Settings, color: "slate", description: "Algemene instellingen van de Helpdesk.", permission: { type: "global", slug: "helpdesk-instellingen" } },
    ],
    mutedItems: [
      { id: "gmail", permissionId: "helpdesk-ai.gmail", label: "Gmail-koppeling", href: "/admin/globals/gmail-connection", icon: Mail, color: "slate", description: "Technische koppeling voor het lezen van supportmail.", permission: { type: "global", slug: "gmail-connection" } },
      { id: "drafts", permissionId: "helpdesk-ai.drafts", label: "AI-conceptartikelen", href: "/admin/collections/knowledge-drafts", icon: FilePen, color: "slate", description: "Door AI gemaakte conceptartikelen die nog moeten worden beoordeeld.", permission: { type: "collection", slug: "knowledge-drafts" } },
      { id: "threads", permissionId: "helpdesk-ai.threads", label: "Geïmporteerde supportmails", href: "/admin/collections/support-threads", icon: Inbox, color: "slate", description: "Technische opslag van geïmporteerde supportmailthreads.", permission: { type: "collection", slug: "support-threads" } },
      { id: "zoektester", permissionId: "helpdesk-ai.zoektester", label: "AI-zoektest", href: "/admin/globals/knowledge-search", icon: Search, color: "slate", description: "Test hoe de AI in de kennisbank zoekt.", permission: { type: "global", slug: "knowledge-search" } },
      { id: "evaluatie", permissionId: "helpdesk-ai.evaluatie", label: "AI-testinstellingen", href: "/admin/globals/assistant-eval", icon: FlaskConical, color: "slate", description: "Technische instellingen voor de AI-kwaliteitstest.", permission: { type: "global", slug: "assistant-eval" } },
    ],
  },
];

export function navItemPermissionId(groupId: NavGroupDef["id"], item: NavItem): string {
  return item.permissionId ?? `${groupId}.${item.id}`;
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
