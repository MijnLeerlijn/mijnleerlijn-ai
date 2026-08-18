import type { AdminViewServerProps } from "payload";
import type { ReactNode } from "react";
import { DefaultTemplate } from "@payloadcms/next/templates";
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
function InAdminShell({
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
