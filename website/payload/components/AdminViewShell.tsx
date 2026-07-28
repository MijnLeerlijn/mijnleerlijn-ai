import type { AdminViewServerProps } from "payload";
import type { ReactNode } from "react";
import { DefaultTemplate } from "@payloadcms/next/templates";
import { DownloadbeheerView } from "./DownloadbeheerView";
import { DownloadcategorieenView } from "./DownloadcategorieenView";
import { VerbetercentrumView } from "./VerbetercentrumView";

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
