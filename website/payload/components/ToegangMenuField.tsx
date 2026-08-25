"use client";

import { useEffect, useRef } from "react";
import { useField, useDocumentInfo, useAuth } from "@payloadcms/ui";
import { NAV_GROUPS, navItemPermissionId, type NavGroupDef, type NavItem } from "@/lib/admin-nav/nav-groups";
import { berekenGroepTelling, toggleGroepInSelectie, toggleItemInSelectie } from "./toegang-menu-logica";

// Admin gebruikersbeheer — rechten per hoofdmenu en submenu (2026-08-25).
// Vervangt Payload's standaard JSON-tekstveld-widget voor Users.permissions
// (payload/collections/Users.ts) — opdrachtseis §7: "Maak in gebruikersbeheer
// een duidelijke boom/accordion met checkboxes." Rendert rechtstreeks vanuit
// NAV_GROUPS (lib/admin-nav/nav-groups.ts) — GEEN eigen kopie van de
// menustructuur (opdrachtseis: "geen tweede lijst die uit sync raakt"). De
// eigenlijke selectielogica staat in toegang-menu-logica.ts (puur, los van
// Payload's useField()-vormcontext) zodat die rechtstreeks getest kan worden.
//
// Alleen zichtbaar wanneer permissionMode === "restricted" (zie de
// `admin.condition` op het veld in Users.ts) — dit component hoeft dus geen
// eigen "full/restricted"-onderscheid te tekenen.
export function ToegangMenuField() {
  const { value, setValue } = useField<string[]>();
  const geselecteerd = new Set(Array.isArray(value) ? value : []);

  // Zelfbeveiliging zichtbaar maken, niet alleen afdwingen (opdrachtseis §5:
  // "ik wil voorkomen dat ik mezelf per ongeluk buitensluit"): de server
  // (permissieVeldAccess in Users.ts) weigert een save op je eigen
  // permissions/permissionMode altijd, maar zonder deze UI-hint zou een
  // beheerder op het eigen account de vinkjes kunnen aanklikken en pas bij
  // Opslaan (stilzwijgend) merken dat er niets is gebeurd — verwarrend.
  //
  // We herkennen "dit is mijn eigen account" hier bewust via een directe
  // id-vergelijking (huidige gebruiker vs. het geopende document), NIET via
  // docPermissions.fields.permissions: Payload's eigen
  // getEntityPermissions/populateFieldPermissions-pijplijn (die
  // docPermissions vult, zie node_modules/payload/dist/utilities/
  // getEntityPermissions/getEntityPermissions.js — de aanroep van
  // populateFieldPermissions geeft bewust of per ongeluk geen `id` mee)
  // roept custom field-access-functies voor déze UI-hint-berekening altijd
  // aan met `id: undefined`, ongeacht welk document open staat. permissieVeldAccess
  // ontvangt dus nooit een bruikbare id op dit pad en levert hier altijd
  // "toegestaan" op — dit geldt voor alle documenten en alle routes
  // (bevestigd door live doorlezen van Payload's broncode), niet alleen
  // /admin/account. De échte opslag-operatie roept access-functies wél met
  // een correcte id aan (bevestigd via een live klik+opslaan+database-
  // controle: een geforceerde klik op een niet-toegekend item bleef na
  // Opslaan onveranderd in Postgres) — dus de beveiliging zelf staat vast,
  // alleen deze UI-hint kon er niet blind op vertrouwen.
  const { id: documentId, docPermissions } = useDocumentInfo();
  const { user: ingelogdeGebruiker } = useAuth();
  const isEigenAccount =
    ingelogdeGebruiker?.id !== undefined &&
    ingelogdeGebruiker?.id !== null &&
    documentId !== undefined &&
    documentId !== null &&
    String(ingelogdeGebruiker.id) === String(documentId);
  const velden = docPermissions?.fields;
  const veldMagWijzigen = velden === true || velden?.permissions !== undefined;
  const magWijzigen = !isEigenAccount && veldMagWijzigen;

  return (
    <div className="field-type ml-toegang-menu">
      <label className="field-label ml-toegang-menu__label">Toegestane menu-onderdelen</label>
      {magWijzigen ? (
        <p className="ml-toegang-menu__hint">
          Een hoofdmenu is alleen zichtbaar zodra minstens één submenu-item hieronder is aangevinkt.
        </p>
      ) : (
        <p className="ml-toegang-menu__hint ml-toegang-menu__hint--waarschuwing">
          Dit is je eigen account — je kunt je eigen toegang hier niet wijzigen. Vraag een andere beheerder om dit aan te passen.
        </p>
      )}
      <div className={`ml-toegang-menu__groepen${magWijzigen ? "" : " ml-toegang-menu__groepen--readonly"}`}>
        {NAV_GROUPS.map((group) => (
          <ToegangGroep
            key={group.id}
            group={group}
            geselecteerd={geselecteerd}
            disabled={!magWijzigen}
            onToggleItem={(id) => setValue(Array.from(toggleItemInSelectie(geselecteerd, id)))}
            onToggleGroep={() => setValue(Array.from(toggleGroepInSelectie(geselecteerd, group)))}
          />
        ))}
      </div>
    </div>
  );
}

function ToegangGroep({
  group,
  geselecteerd,
  disabled,
  onToggleItem,
  onToggleGroep,
}: {
  group: NavGroupDef;
  geselecteerd: Set<string>;
  disabled: boolean;
  onToggleItem: (id: string) => void;
  onToggleGroep: () => void;
}) {
  const alleItems = [...group.items, ...(group.mutedItems ?? [])];
  const { aantalGeselecteerd, totaal, alles, niets } = berekenGroepTelling(group, geselecteerd);
  const GroepIcon = group.icon;

  // Native checkboxes kennen geen "indeterminate"-HTML-attribuut, alleen een
  // IDL-property — moet dus via een ref/effect gezet worden (React heeft
  // hier geen prop voor), zie opdrachtseis §7 "duidelijke indeterminate
  // state als maar een deel geselecteerd is".
  const checkboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = !alles && !niets;
  }, [alles, niets]);

  return (
    <details className="ml-toegang-groep" open>
      <summary className="ml-toegang-groep__summary">
        {/* stopPropagation: zonder dit tuimelt een klik op de checkbox ook de
            <details> zelf om (het native <summary>-klikgedrag), waardoor de
            accordion onbedoeld dichtklapt bij het aan/uitvinken van een hele
            groep. */}
        <span className="ml-toegang-groep__checkbox-wrap" onClick={(e) => e.stopPropagation()}>
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={alles}
            disabled={disabled}
            onChange={onToggleGroep}
            aria-label={`Alle onderdelen van ${group.label} in- of uitschakelen`}
          />
        </span>
        <GroepIcon size={16} aria-hidden="true" className="ml-toegang-groep__icon" />
        <span className="ml-toegang-groep__label">{group.label}</span>
        <span className="ml-toegang-groep__telling">
          {aantalGeselecteerd}/{totaal}
        </span>
      </summary>
      <ul className="ml-toegang-groep__items">
        {alleItems.map((item) => {
          const id = navItemPermissionId(group.id, item);
          return <ToegangItem key={id} item={item} checked={geselecteerd.has(id)} disabled={disabled} onChange={() => onToggleItem(id)} />;
        })}
      </ul>
    </details>
  );
}

function ToegangItem({ item, checked, disabled, onChange }: { item: NavItem; checked: boolean; disabled: boolean; onChange: () => void }) {
  return (
    <li className="ml-toegang-item">
      <label>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
        <span>{item.label}</span>
      </label>
    </li>
  );
}
