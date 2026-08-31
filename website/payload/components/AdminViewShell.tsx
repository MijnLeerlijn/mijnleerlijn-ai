import type { AdminViewServerProps } from "payload";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DefaultTemplate } from "@payloadcms/next/templates";
import { formatAdminURL } from "payload/shared";
import { PAYLOAD_SESSION_COOKIE_NAME, verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { heeftAdminPermissie, type AuthUserMetPermissies } from "@/payload/access/menu-permissions";
import { DownloadbeheerView } from "./DownloadbeheerView";
import { DownloadcategorieenView } from "./DownloadcategorieenView";
import { VerbetercentrumView } from "./VerbetercentrumView";
import { HelpdeskVragenView } from "./HelpdeskVragenView";
import { VariantenView } from "./VariantenView";
import { KennisbasisView } from "./KennisbasisView";
import { CurriculumWerkplaatsView } from "./CurriculumWerkplaatsView";
import { CreatorView } from "./CreatorView";
import { SalesVandaagView } from "./SalesVandaagView";
import { SalesScholenView } from "./SalesScholenView";
import { SalesSchooldetailView } from "./SalesSchooldetailView";
import { SalesActiesView } from "./SalesActiesView";
import { SalesMondayDiagnoseView } from "./SalesMondayDiagnoseView";
import { TrainersMondayDiagnoseView } from "./TrainersMondayDiagnoseView";
import { TrainersOverzichtView } from "./TrainersOverzichtView";
import { TrainerDetailView } from "./TrainerDetailView";
import { TrainersTrainingenView } from "./TrainersTrainingenView";
import { TrainersTodoView } from "./TrainersTodoView";
import { TrainersActiviteitView } from "./TrainersActiviteitView";
import { SchoolDetailView } from "./SchoolDetailView";
import { TrainersUpsellView } from "./TrainersUpsellView";

// Admin-shell-fix (2026-07-28): custom views die via admin.components.views
// worden geregistreerd, krijgen van Payload's eigen RootPage-dispatcher géén
// templateType toegekend tenzij hun viewKey toevallig samenvalt met een
// ingebouwde route (zie getRouteData.js in @payloadcms/next) — er bestaat
// geen configuratievlag om dit alsnog af te dwingen (zie AdminViewConfig in
// payload/dist/admin/views/index.d.ts, die geen `template`-property kent).
// Zonder templateType rendert RootPage de view in een kaal React.Fragment:
// geen zijbalk, geen header, geen navigatie. Dit bestand is bewust GEEN
// "use client"-component — RenderServerComponent geeft serverProps
// (waaronder payload/req/permissies) alleen door aan componenten die als
// React Server Component herkend worden (isReactServerComponentOrFunction).
// Zo kan dit bestand alsnog Payload's eigen <DefaultTemplate> (dezelfde
// component die Dashboard/List/Edit al gebruiken) om de content heen
// renderen — geen zelfgebouwde zijbalk, wél de originele, ongewijzigde
// content-componenten als children.
// Auth-boundary-fix (2026-08-19, live gevonden door Wessel tijdens de
// Traineromgeving-test): Payload's eigen RootPage (@payloadcms/next/dist/
// views/Root/index.js, rechtstreeks gelezen) redirect anonieme/niet-
// geautoriseerde bezoekers alleen naar de loginpagina wanneer de route GEEN
// custom admin-view is:
//   if (!permissions.canAccessAdmin && !isPublicAdminRoute(...) &&
//       !isCustomAdminView(...)) { redirect(handleAuthRedirect(...)); }
// isCustomAdminView() (@payloadcms/next/dist/utilities/isCustomAdminView.js)
// geeft `true` zodra de route overeenkomt met ÉÉN van de paden onder
// admin.components.views — dus voor ALLE 13 hier geregistreerde custom
// views, ongeacht of ze bedoeld zijn als publiek. Dit is bewust Payload-
// gedrag (een custom view kan zelf publiek zijn, zoals de login-view), maar
// betekent dat Payload zelf hier NOOIT auth afdwingt — elke view moet dat
// zelf doen. Vóór deze fix deed geen enkele view dat server-side: de shell
// (DefaultTemplate hieronder, met volledige sidebar/nav) rendert dus altijd,
// en losse views zoals TrainersMondayDiagnoseView deden hun "Geen
// toegang"-check alleen client-side via useAuth() — ná hydratie, dus ná de
// shell al zichtbaar was.
//
// Centrale fix i.p.v. per view: InAdminShell is de ENIGE plek die alle 13
// views gemeen hebben (dashboard/login lopen hier bewust NIET doorheen — die
// hebben hun eigen registratie, zie payload.config.ts, en login moet juist
// wél zonder sessie bereikbaar blijven). Verifieert een geldige
// "users"-sessie VOORDAT DefaultTemplate (of children) ooit rendert —
// redirect() gooit hier een Next.js-navigatiesignaal dat de render meteen
// afbreekt, dus noch de shell, noch de view-inhoud wordt ooit naar de client
// gestuurd.
//
// Gedeelde cookienaam "payload-token" (zie lib/trainers/auth.ts en
// lib/auth/verify-session.ts se eigen, uitgebreide toelichting): een
// trainer-accounts-sessie gebruikt LETTERLIJK dezelfde cookienaam als een
// users-sessie (cookiePrefix is een globale Payload-instelling). Bewust
// NIET req.user/initPageResult.permissions.canAccessAdmin vertrouwd voor
// deze beslissing — dat zou impliciet aannemen dat Payload's eigen cookie-
// extractie hier altijd correct tussen de twee auth-collecties onderscheidt
// én immuun is voor de al eerder gevonden Origin/CSRF-afhankelijke
// cookie-extractiequirk (zie verify-session.ts). verifyAdminSessionCookie()
// doet in plaats daarvan een eigen, rechtstreekse JWT-verificatie die de
// `collection`-claim expliciet op "users" controleert (nooit "trainer-
// accounts", ongeacht hoe geldig dat token verder is) — al maanden bewezen
// in productie via meerdere bestaande API-routes, hier voor het eerst ook
// vóór het renderen van een Server Component ingezet i.p.v. alleen in
// routehandlers.
async function InAdminShell({
  children,
  props,
  viewType,
  requiredPermission,
}: {
  children: ReactNode;
  props: AdminViewServerProps;
  viewType: string;
  /**
   * Admin gebruikersbeheer (2026-08-25) — de permissie-ID (lib/admin-nav/
   * nav-groups.ts, bv. "trainers.telefonie") die bij DEZE view hoort.
   * Verplicht voor elke aanroeper hieronder — géén view mag hier ongemerkt
   * zonder gate blijven staan (opdrachtseis §4: directe-URL-toegang moet net
   * zo hard afgedwongen worden als de navigatiezichtbaarheid).
   */
  requiredPermission: string;
}) {
  const { initPageResult, params, searchParams } = props;
  const { req } = initPageResult;

  const cookieStore = await cookies();
  const sessieControle = await verifyAdminSessionCookie(req.payload, cookieStore.get(PAYLOAD_SESSION_COOKIE_NAME)?.value);

  if (!sessieControle.user) {
    // config.routes.admin (top-level) is het admin-basispad (bv. "/admin");
    // config.admin.routes.login is de relatieve login-subroute — twee
    // verschillende nestingsniveaus in Payload's config, zie ook hoe
    // RootPage (@payloadcms/next/dist/views/Root/index.js) en
    // BeheerLoginView.tsx dezelfde twee bronnen apart destructureren.
    const adminRoute = req.payload.config.routes.admin;
    const segments = Array.isArray((params as { segments?: unknown })?.segments)
      ? ((params as { segments: string[] }).segments ?? [])
      : [];
    const huidigePad = formatAdminURL({ adminRoute, path: `/${segments.join("/")}` });
    const loginUrl = formatAdminURL({ adminRoute, path: req.payload.config.admin.routes.login });
    redirect(`${loginUrl}?redirect=${encodeURIComponent(huidigePad)}`);
  }

  // Admin gebruikersbeheer (2026-08-25) — dezelfde heeftAdminPermissie() als
  // de navigatiefilter (lib/admin-nav/nav-groups.ts) en elke API-route/
  // collectie-access hieronder, hier toegepast op de PAGINA zelf: een
  // verborgen menu-item mag niet alleen visueel verborgen zijn (opdrachtseis
  // §4) — directe navigatie naar bv. /admin/curriculum-werkplaats moet voor
  // een gebruiker zonder die permissie precies zo geweigerd worden. Geen
  // redirect (dat zou een andere, mogelijk óók ontoegankelijke pagina
  // kunnen suggereren) — in plaats daarvan hetzelfde "geen toegang"-patroon
  // dat Payload's EIGEN native collectie-/global-pagina's al tonen wanneer
  // access.read false teruggeeft (in de shell, geen redirect, geen 500).
  const magToegang = heeftAdminPermissie(sessieControle.user as AuthUserMetPermissies, requiredPermission);

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={req.payload}
      permissions={initPageResult.permissions}
      req={req}
      searchParams={searchParams}
      user={req.user ?? undefined}
      viewType={viewType}
      visibleEntities={initPageResult.visibleEntities}
    >
      {magToegang ? children : <GeenToegang />}
    </DefaultTemplate>
  );
}

function GeenToegang() {
  return (
    <div className="ml-geen-toegang">
      <h1>Geen toegang</h1>
      <p>Je account heeft geen toegang tot dit onderdeel. Neem contact op met een beheerder als je hier wél toegang toe zou moeten hebben.</p>
    </div>
  );
}

export function DownloadbeheerViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="downloadbeheer" requiredPermission="algemeen.downloadbeheer">
      <DownloadbeheerView />
    </InAdminShell>
  );
}

export function DownloadcategorieenViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="downloadcategorieen" requiredPermission="algemeen.downloadcategorieen">
      <DownloadcategorieenView />
    </InAdminShell>
  );
}

export function VerbetercentrumViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="verbetercentrum" requiredPermission="helpdesk-ai.verbetercentrum">
      <VerbetercentrumView />
    </InAdminShell>
  );
}

export function HelpdeskVragenViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="helpdeskVragen" requiredPermission="helpdesk-ai.vragen">
      <HelpdeskVragenView />
    </InAdminShell>
  );
}

export function VariantenViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="varianten" requiredPermission="algemeen.varianten">
      <VariantenView />
    </InAdminShell>
  );
}

export function KennisbasisViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="kennisbasis" requiredPermission="helpdesk-ai.kennisbasis">
      <KennisbasisView />
    </InAdminShell>
  );
}

export function CurriculumWerkplaatsViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="curriculumWerkplaats" requiredPermission="curriculum-werkplaats.werkplaats">
      <CurriculumWerkplaatsView />
    </InAdminShell>
  );
}

export function CreatorViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="creator" requiredPermission="creator.creator">
      <CreatorView />
    </InAdminShell>
  );
}

export function SalesVandaagViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="salesVandaag" requiredPermission="sales.overzicht">
      <SalesVandaagView />
    </InAdminShell>
  );
}

export function SalesScholenViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="salesScholen" requiredPermission="sales.scholen">
      <SalesScholenView />
    </InAdminShell>
  );
}

// Drill-down vanaf Sales → Scholen (geen eigen nav-groups.ts-item) — erft de
// permissie van de lijstpagina waar hij altijd vanuit bereikt wordt.
export function SalesSchooldetailViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="salesSchooldetail" requiredPermission="sales.scholen">
      <SalesSchooldetailView />
    </InAdminShell>
  );
}

export function SalesActiesViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="salesActies" requiredPermission="sales.acties">
      <SalesActiesView />
    </InAdminShell>
  );
}

// TIJDELIJK diagnosescherm, geen eigen nav-groups.ts-item — erft de
// permissie van het bredere Sales-onderdeel waar het bij hoort.
export function SalesMondayDiagnoseViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="salesMondayDiagnose" requiredPermission="sales.overzicht">
      <SalesMondayDiagnoseView />
    </InAdminShell>
  );
}

// Traineromgeving-onderzoek (2026-08-19) — TIJDELIJK, zie
// TrainersMondayDiagnoseView.tsx se moduletoelichting voor de volledige
// opruimlijst. Geen eigen nav-groups.ts-item — erft de permissie van het
// bredere Trainers-onderdeel waar het bij hoort.
export function TrainersMondayDiagnoseViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="trainersMondayDiagnose" requiredPermission="trainers.dashboard">
      <TrainersMondayDiagnoseView />
    </InAdminShell>
  );
}

// Traineromgeving V2, Fase 4 (2026-08-24) — Admin Trainerdashboard (spec §1-§3).
export function TrainersOverzichtViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="trainersOverzicht" requiredPermission="trainers.dashboard">
      <TrainersOverzichtView />
    </InAdminShell>
  );
}

// Drill-down vanaf het Trainerdashboard (geen eigen nav-groups.ts-item) —
// erft de permissie van de lijstpagina waar hij altijd vanuit bereikt wordt.
export function TrainerDetailViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="trainersDetail" requiredPermission="trainers.dashboard">
      <TrainerDetailView />
    </InAdminShell>
  );
}

export function TrainersTrainingenViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="trainersTrainingen" requiredPermission="trainers.trainingen">
      <TrainersTrainingenView />
    </InAdminShell>
  );
}

export function TrainersTodoViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="trainersTodo" requiredPermission="trainers.todo">
      <TrainersTodoView />
    </InAdminShell>
  );
}

export function TrainersActiviteitViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="trainersActiviteit" requiredPermission="trainers.activiteit">
      <TrainersActiviteitView />
    </InAdminShell>
  );
}

// Traineromgeving V2, Fase 5 (2026-08-24) — Admin Schooldetail (spec §1).
// Drill-down vanaf het Trainerdashboard (geen eigen nav-groups.ts-item).
export function SchoolDetailViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="trainersSchool" requiredPermission="trainers.dashboard">
      <SchoolDetailView />
    </InAdminShell>
  );
}

// Upsell-ronde (2026-09-02, spec §12) — "Trainingen & upsell", eigen
// nav-groups.ts-item (i.t.t. de drill-downs hierboven) met eigen permissie.
export function TrainersUpsellViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="trainersUpsell" requiredPermission="trainers.upsell">
      <TrainersUpsellView />
    </InAdminShell>
  );
}
