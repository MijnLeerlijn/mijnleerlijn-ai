import type { AdminViewServerProps } from "payload";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DefaultTemplate } from "@payloadcms/next/templates";
import { formatAdminURL } from "payload/shared";
import { PAYLOAD_SESSION_COOKIE_NAME, verifyAdminSessionCookie } from "@/lib/auth/verify-session";
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
}: {
  children: ReactNode;
  props: AdminViewServerProps;
  viewType: string;
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
      {children}
    </DefaultTemplate>
  );
}

export function DownloadbeheerViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="downloadbeheer">
      <DownloadbeheerView />
    </InAdminShell>
  );
}

export function DownloadcategorieenViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="downloadcategorieen">
      <DownloadcategorieenView />
    </InAdminShell>
  );
}

export function VerbetercentrumViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="verbetercentrum">
      <VerbetercentrumView />
    </InAdminShell>
  );
}

export function HelpdeskVragenViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="helpdeskVragen">
      <HelpdeskVragenView />
    </InAdminShell>
  );
}

export function VariantenViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="varianten">
      <VariantenView />
    </InAdminShell>
  );
}

export function KennisbasisViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="kennisbasis">
      <KennisbasisView />
    </InAdminShell>
  );
}

export function CurriculumWerkplaatsViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="curriculumWerkplaats">
      <CurriculumWerkplaatsView />
    </InAdminShell>
  );
}

export function CreatorViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="creator">
      <CreatorView />
    </InAdminShell>
  );
}

export function SalesVandaagViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="salesVandaag">
      <SalesVandaagView />
    </InAdminShell>
  );
}

export function SalesScholenViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="salesScholen">
      <SalesScholenView />
    </InAdminShell>
  );
}

export function SalesSchooldetailViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="salesSchooldetail">
      <SalesSchooldetailView />
    </InAdminShell>
  );
}

export function SalesActiesViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="salesActies">
      <SalesActiesView />
    </InAdminShell>
  );
}

export function SalesMondayDiagnoseViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="salesMondayDiagnose">
      <SalesMondayDiagnoseView />
    </InAdminShell>
  );
}

// Traineromgeving-onderzoek (2026-08-19) — TIJDELIJK, zie
// TrainersMondayDiagnoseView.tsx se moduletoelichting voor de volledige
// opruimlijst.
export function TrainersMondayDiagnoseViewShell(props: AdminViewServerProps) {
  return (
    <InAdminShell props={props} viewType="trainersMondayDiagnose">
      <TrainersMondayDiagnoseView />
    </InAdminShell>
  );
}
