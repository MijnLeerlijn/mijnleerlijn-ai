"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePreferences } from "@payloadcms/ui";
import { Calendar, ClipboardList, Sparkles, School, UserPlus, ListTodo, AlertCircle, Clock, Plus, Mail } from "lucide-react";
import { RelatiestatusBadge } from "./RelatiestatusBadge";
import { PlanningStatusBadge } from "./PlanningStatusBadge";
import { PlanActieKnop } from "./PlanActieKnop";
import { SalesProposalActies } from "./SalesProposalActies";
import { formatKorteDatum, lokaleDatumIso, vandaagIso, voegDagenToe } from "@/lib/sales/format-datum";
import { NAV_COLOR_STYLES } from "@/lib/admin-nav/nav-colors";
import type { TodoResultaat } from "@/lib/sales/dashboard-todo";
import type { LaatsteSyncStatus } from "@/lib/sales/sync";
import { VANDAAG_SNELKEUZES, type AgendaActieInvoer, type AgendaSalesActie, type SchoolMetMondayPlanning } from "@/lib/sales/vandaag";
import { bepaalPlanningStatus } from "@/lib/sales/planning-status";
import { bepaalWerkAgenda, type TaakInvoer, type WerkItem, type WerkTaakItem, type WerkAgendaEventItem } from "@/lib/werk/agenda";
import { parseQuickAdd, type QuickAddSchoolOptie, type QuickAddVoorstel } from "@/lib/werk/quick-add-parser";
import type { WachtenOpItem } from "@/lib/werk/wachten-op";
import type { GoogleCalendarEvent } from "@/lib/google-calendar/api";
import { heeftGmailScopes } from "@/lib/google-gmail/oauth";

// Sales UX-ronde 3 (2026-08-14) — vervangt SalesWidgetVandaag.tsx (het oude
// server-gerenderde "Sales vandaag"-widget, gebaseerd op
// lib/sales/widget-prioritering.ts se 4-tier-systeem). Client component
// (i.p.v. server component): de "Vraag"-tab heeft client-side interactiviteit
// nodig (schoolselector, chatgesprek, tab-onthouden via Payload Preferences)
// die een server component niet kan bieden. Hergebruikt bewust dezelfde
// kaart-/knop-/chat-CSS-klassen en apiGet/apiPost-patronen als
// SalesVandaagView.tsx/SalesScholenView.tsx — geen nieuw visueel systeem.
//
// Vier tabs, strikt gescheiden datasets (expliciete opdrachtseis):
// - "Vandaag": datumgestuurde, GECOMBINEERDE agenda (productiecorrectie
//   2026-08-16, punt 2, en de daaropvolgende functionele-inconsistentiefix):
//   de gebruiker kiest via ←/Vandaag/Morgen/Overmorgen/Kies datum/→ welke dag
//   getoond wordt (lib/sales/vandaag.ts se bepaalGecombineerdeAgenda), die
//   voor die dag zowel open lokale sales-acties ALS scholen met uitsluitend
//   een geldige Monday-vervolgdatum toont (root cause van de eerdere bug:
//   een school met alleen een Monday-datum verscheen nooit op haar eigen
//   geplande dag, ook al gold ze elders — To-do se "Gepland in Monday" — al
//   als gepland). Gededupliceerd op (school, datum): een school met al een
//   lokale actie op die dag krijgt nooit ook nog een Monday-kaart. Maakt/wist
//   nooit een sales-actions-record — puur een afgeleide weergave.
//   Achterstallige acties verschijnen uitsluitend als aparte subgroep wanneer
//   de gekozen datum vandaag zelf is, en zijn altijd uitsluitend lokale
//   acties (nooit Monday-kaarten). Geen AI-voorstellen, geen "scholen zonder
//   actie" — letterlijk "wat staat er op die dag gepland".
// - "To do": sales-proposals (pending/conflict) + het "mogelijk afgesloten/
//   inactief"-signaal — via lib/sales/dashboard-todo.ts, dat op zijn beurt
//   uitsluitend bestaande statusvelden/functies hergebruikt (geen nieuw
//   takenmodel).
// - "Wachten op" (Mijn Werk V1): school is aan zet, uitsluitend afgeleid uit
//   bestaande Sales-data (lib/werk/wachten-op.ts) — geen nieuwe opslag.
// - "Vraag": schoolselector (Mijn Werk / Alle scholen / een specifieke
//   school) boven een simpel chatgesprek — "Alle scholen" praat met
//   app/api/sales/chat (lib/sales/aggregate-chat.ts, gestructureerde lokale
//   selectie, nooit volledige logboeken), een specifieke school praat met de
//   AL BESTAANDE app/api/sales/school/[id]/chat (ongewijzigd, eigen isolatie).
//   Mijn Werk Fase 2 (2026-08-17): "Mijn Werk" is een DERDE, NIEUWE optie
//   (praat met app/api/werk/chat, intentie-routing over agenda/taken/sales/
//   school — lib/werk/context-router.ts) — de twee bestaande opties/hun
//   routes zijn hierboven niet aangeraakt.
// Mijn Werk V1 (2026-08-17) — vierde tab "Wachten op" toegevoegd aan de
// bestaande drie. TAB_PREFERENCE_KEY blijft bewust ongewijzigd: dit is een
// natuurlijke uitbreiding van "welke tab was actief" met een nieuwe geldige
// waarde, geen hergebruik/hernoeming van de betekenis — een bestaande
// opgeslagen voorkeur ("vandaag"/"todo"/"vraag") blijft exact zo werken.
type Tab = "vandaag" | "todo" | "wachtenop" | "vraag";
const TAB_PREFERENCE_KEY = "ml-sales-dashboard-tab";

interface SchoolRef {
  id: number;
  schoolName: string;
  relatiestatus?: string | null;
  plaats?: string | null;
}

interface SalesActionDoc {
  id: number;
  description: string;
  dueDate: string;
  type: string;
  channel?: string;
  school: SchoolRef | number;
}

// Mijn Werk V1 (2026-08-17) — ruwe vorm zoals Payload's REST-API
// personal-tasks teruggeeft (depth:0, dus school ongepopuleerd of SchoolRef
// bij depth:1 — hier bewust depth:0 zoals sales-schools se bulkfetch
// hieronder, de kaart heeft alleen id+naam nodig). Toegang is al
// eigenaar-gescoped op collectieniveau (ownRecordAccess, payload/access/
// roles.ts) — deze component hoeft zelf geen extra where[eigenaar]-filter
// mee te sturen.
interface PersonalTaskDoc {
  id: number;
  titel: string;
  beschrijving?: string | null;
  datum?: string | null;
  tijd?: string | null;
  status: "open" | "afgerond" | "vervallen";
  school?: SchoolRef | number | null;
}

// Productiecorrectie (functionele inconsistentie, vervolg op punt 2) —
// hergebruikt voor zowel de "Vraag over"-schoolselector als de
// gecombineerde agenda (scholenVoorAgenda hieronder): dezelfde, al bestaande
// fetch van alle scholen bevat deze velden al (Payload's REST-API levert
// standaard alle collectievelden), dus geen extra netwerk-aanroep nodig —
// alleen het TS-type verbreed om ze door te geven.
interface SchoolOptie {
  id: number;
  schoolName: string;
  relatiestatus?: string | null;
  plaats?: string | null;
  actief?: boolean;
  mondayVolgendeActieDatum?: string | null;
  cachedGeplandeActieTekst?: string | null;
}

function schoolRef(school: SchoolRef | number): SchoolRef {
  return typeof school === "number" ? { id: school, schoolName: `School #${school}` } : school;
}

// Mijn Werk Fase 2 (2026-08-17) — ruwe vorm van GET /api/google-connections
// (Payload's eigen native REST, ownRecordAccess-gescoped op collectieniveau —
// deze component ziet dus per definitie nooit andermans koppeling, geen
// extra filter nodig). Uitsluitend wat de UI nodig heeft, geen tokenvelden.
//
// Mijn Werk Fase 3 (2026-08-17) — `scopes` toegevoegd: Agenda en Gmail delen
// vanaf nu dezelfde koppelingsrij (incrementele autorisatie), dus "is er een
// koppeling" is niet meer hetzelfde als "is Agenda/Gmail specifiek
// toegekend" — zie heeftAgendaScope/heeftGmailScope hieronder.
interface GoogleConnectionDoc {
  id: number;
  emailAddress: string | null;
  status: "actief" | "verlopen";
  scopes: string[];
}

// Zelfde waarde als GOOGLE_CALENDAR_READONLY_SCOPE (lib/google-calendar/oauth.ts)
// — hier bewust een losse letterlijke waarde i.p.v. geïmporteerd: dat
// bestand importeert server-only env-config (requireEnv) en hoort niet in de
// clientbundel van dit "use client"-component. lib/google-gmail/oauth.ts se
// heeftGmailScopes hierboven IS wel veilig te importeren — dat bestand heeft
// bewust geen server-only imports.
const GOOGLE_CALENDAR_SCOPE_LITERAL = "https://www.googleapis.com/auth/calendar.readonly";

// Mijn Werk Fase 3 (2026-08-17) — ruwe vorm zoals GET /api/werk/mail
// teruggeeft (lib/werk/mail-signalen.ts se MailSignaalWeergave — lokaal
// gedupliceerd, zelfde bestaande conventie in dit bestand als
// Voorbereidingsvoorstel/VoorbereidingSignaalDoc hierboven).
interface MailSignaalDoc {
  gmailMessageId: string;
  gmailThreadId: string;
  van: string;
  onderwerp: string;
  ontvangenOp: string;
  reden: string;
  school: { id: number; schoolName: string } | null;
  signaalId: number;
}

interface MailAntwoordvoorstel {
  conceptTekst: string;
  aan: string;
  onderwerp: string;
}

/** Alleen de weergavenaam uit een "Naam <adres>"-headerwaarde — valt terug op de volledige headerwaarde als er geen naam vóór de `<...>` staat. */
function weergaveNaamAfzender(van: string): string {
  const zonderAdres = van
    .replace(/<[^>]*>/, "")
    .trim()
    .replace(/^"|"$/g, "");
  return zonderAdres || van;
}

// Voorbereidingsvoorstel — zelfde vorm als lib/werk/voorbereiding-ai.ts se
// Voorbereidingsvoorstel (lokaal gedupliceerd i.p.v. geïmporteerd, zelfde
// bestaande conventie in dit bestand als PersonalTaskDoc/SchoolOptie
// hierboven: dit is de ruwe JSON-vorm zoals de API 'm teruggeeft).
interface Voorbereidingsvoorstel {
  doelVanDeSessie: string;
  relevanteOnderwerpen: string[];
  watVoorafKlaarzetten: string[];
  mogelijkeVragen: string[];
  concreteVoorbereidingstaak: string;
}

interface VoorbereidingSignaalDoc {
  event: GoogleCalendarEvent;
  school: { id: number; schoolName: string } | null;
  schoolTwijfel: boolean;
  dagenTotEvent: number;
  status: "gesignaleerd" | "gedempt" | "uitgesteld" | "taak_aangemaakt";
}

// Visuele polish (2026-08-14) — urgentie is puur een afgeleide weergave van
// het al aanwezige dueDate, geen nieuw veld/model. Uitsluitend voor lokale
// Sales-acties — een Monday-kaart heeft geen eigen urgentiekleur (nooit
// "achterstallig": die classificatie hoort bij een concrete, lokaal
// vastgelegde actie, niet bij een afgeleide Monday-planning).
// Mijn Werk V1 (2026-08-17) — kern geëxtraheerd zodat TaakKaart (personal-
// tasks, datum optioneel) dezelfde urgentiekleuring krijgt als ActieKaart,
// zonder de bestaande functiesignatuur/het bestaande gedrag daarvan te
// wijzigen.
function urgentieVanDatum(datum: string | null): "achterstallig" | "vandaag" | null {
  if (!datum) return null;
  const vandaag = vandaagIso();
  if (datum < vandaag) return "achterstallig";
  if (datum === vandaag) return "vandaag";
  return null;
}

function urgentieVanActie(actie: { dueDate: string }): "achterstallig" | "vandaag" | null {
  return urgentieVanDatum(actie.dueDate.slice(0, 10));
}

// Sales-logica productiecorrectie 2026-08-16 (punt 1) — "Laatste sync:
// 11:58" wanneer de sync vandaag liep (lokale kalenderdag, nooit UTC — zie
// lokaleDatumIso), anders inclusief datum zodat een oude sync nooit
// aanvoelt alsof die net gebeurd is.
function formatSyncTijd(iso: string | null): string | null {
  if (!iso) return null;
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return null;
  const tijd = datum.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  return lokaleDatumIso(datum) === vandaagIso() ? tijd : `${formatKorteDatum(iso)}, ${tijd}`;
}

// Productiecorrectie 2026-08-16 (punt 2, uitgebreid met de gecombineerde
// agenda) — geëxtraheerd uit de "vandaag"-tab JSX zodat zowel de
// achterstallig-subgroep als de lijst-op-de-gekozen-datum hetzelfde kaartje
// renderen, zonder duplicatie. Werkt nu op de al-vlakke AgendaSalesActie
// (schoolId/schoolName/relatiestatus/plaats i.p.v. genest school-object) —
// dezelfde vorm die bepaalGecombineerdeAgenda() teruggeeft.
function ActieKaart({ actie }: { actie: AgendaSalesActie }) {
  const urgentie = urgentieVanActie(actie);
  // Productiecorrectie 2026-08-16 (punt 6) — ÉÉN badge voor vandaag/
  // achterstallig/gepland, hergebruikt bepaalPlanningStatus() i.p.v. een
  // eigen urgentie-label — dezelfde badge als To-do/Scholenoverzicht/
  // Schooldetail. De kaart-brede achtergrondkleur (ml-sales-widget__item--*)
  // blijft ongewijzigd op urgentieVanActie() gebaseerd, puur visuele nadruk.
  const planningStatus = bepaalPlanningStatus({ actief: true, openActieDatum: actie.dueDate });
  return (
    <div className={`ml-sales-widget__item${urgentie ? ` ml-sales-widget__item--${urgentie}` : ""}`}>
      <div className="ml-sales-widget__item-header">
        <Link href={`/admin/sales/school?id=${actie.schoolId}`} className="ml-sales-widget__schoolnaam" prefetch={false}>
          {actie.schoolName}
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <PlanningStatusBadge status={planningStatus.status} datum={planningStatus.datum} />
          <RelatiestatusBadge relatiestatus={actie.relatiestatus} />
        </div>
      </div>
      <p className="ml-sales-widget__meta" style={{ fontWeight: 600 }}>
        Sales-actie
      </p>
      <p className="ml-sales-widget__meta">
        {actie.type} · {formatKorteDatum(actie.dueDate)}
      </p>
      <p className="ml-sales-widget__context">{actie.description}</p>
      <div className="ml-sales__actie-knoppen">
        <Link href={`/admin/sales/school?id=${actie.schoolId}`} className="ml-sales__knop" prefetch={false}>
          Bekijk
        </Link>
        <Link href={`/admin/creator?mail=nieuw&school=${actie.schoolId}`} className="ml-sales__knop" prefetch={false}>
          Schrijf mail
        </Link>
      </div>
    </div>
  );
}

// Functionele-inconsistentiefix (vervolg op punt 2/3) — de tegenhanger van
// ActieKaart voor een school die uitsluitend via een geldige Monday
// "Datum volgende actie" op de gekozen dag verschijnt (nog geen lokale
// actie). Toont, waar beschikbaar, de gecachete actie-extractie
// (lib/sales/actie-extractie.ts se cachedGeplandeActieTekst) — bij een lege
// cache expliciet "omschrijving niet bekend" i.p.v. iets te verzinnen.
function MondayPlanningKaart({ item }: { item: Extract<WerkItem, { bron: "monday" }> }) {
  const planningStatus = bepaalPlanningStatus({ actief: true, mondayVolgendeActieDatum: item.datum });
  return (
    <div className="ml-sales-widget__item ml-sales-widget__item--rustig">
      <div className="ml-sales-widget__item-header">
        <Link href={`/admin/sales/school?id=${item.schoolId}`} className="ml-sales-widget__schoolnaam" prefetch={false}>
          {item.schoolName}
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <PlanningStatusBadge status={planningStatus.status} datum={planningStatus.datum} />
          <RelatiestatusBadge relatiestatus={item.relatiestatus} />
        </div>
      </div>
      <p className="ml-sales-widget__meta" style={{ fontWeight: 600 }}>
        Gepland in Monday
      </p>
      <p className="ml-sales-widget__context">{item.geplandeActieTekst || "Actie gepland in Monday — omschrijving niet bekend"}</p>
      <p className="ml-sales-widget__meta">{formatKorteDatum(item.datum)}</p>
      <div className="ml-sales__actie-knoppen">
        <Link href={`/admin/sales/school?id=${item.schoolId}`} className="ml-sales__knop" prefetch={false}>
          Bekijk
        </Link>
        <Link href={`/admin/creator?mail=nieuw&school=${item.schoolId}`} className="ml-sales__knop" prefetch={false}>
          Schrijf mail
        </Link>
      </div>
    </div>
  );
}

// Mijn Werk V1 (2026-08-17) — derde kaarttype naast ActieKaart/
// MondayPlanningKaart, zelfde visuele familie (hergebruikt
// .ml-sales-widget__item/.ml-sales__actie-knoppen/.ml-sales__plan-actie-form
// — geen nieuw kaartsysteem). Bron staat, net als bij de andere twee, als
// rustige meta-regel ("Taak") — opdrachtseis: bron subtiel zichtbaar, de
// titel/wat-en-wanneer blijft de hoofdzaak. Drie acties (afronden/datum
// wijzigen/bewerken/verwijderen) posten rechtstreeks naar Payload's eigen
// personal-tasks-REST-API, zelfde patroon als PlanActieKnop.tsx — geen
// aparte custom route nodig, toegang is al eigenaar-gescoped op
// collectieniveau. "Verwijderen" zet bewust status → "vervallen" (zachte,
// omkeerbare verwijdering) i.p.v. een echte DELETE — zelfde filosofie als
// sales-actions se cancellationReason, nooit stilzwijgend data kwijtraken.
// Een taak met schoolcontext triggert hier NERGENS een sales-actions-record
// of Monday-write-back — deze kaart doet uitsluitend PATCH-aanroepen naar
// personal-tasks zelf.
function TaakKaart({ taak, onGewijzigd }: { taak: WerkTaakItem; onGewijzigd: () => void }) {
  const urgentie = urgentieVanDatum(taak.datum);
  const [modus, setModus] = useState<"weergave" | "datum" | "bewerken">("weergave");
  const [bezig, setBezig] = useState(false);
  const [nieuweDatum, setNieuweDatum] = useState(taak.datum ?? vandaagIso());
  const [bewerkTitel, setBewerkTitel] = useState(taak.titel);
  const [bewerkBeschrijving, setBewerkBeschrijving] = useState(taak.beschrijving ?? "");
  const [bewerkDatum, setBewerkDatum] = useState(taak.datum ?? "");
  const [bewerkTijd, setBewerkTijd] = useState(taak.tijd ?? "");

  async function patch(body: Record<string, unknown>) {
    setBezig(true);
    try {
      const res = await fetch(`/api/personal-tasks/${taak.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setModus("weergave");
        onGewijzigd();
      }
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className={`ml-sales-widget__item${urgentie ? ` ml-sales-widget__item--${urgentie}` : ""}`}>
      <div className="ml-sales-widget__item-header">
        <span className="ml-sales-widget__schoolnaam">{taak.titel}</span>
      </div>
      <p className="ml-sales-widget__meta" style={{ fontWeight: 600 }}>
        Taak
        {taak.schoolName && (
          <>
            {" · "}
            <Link href={`/admin/sales/school?id=${taak.schoolId}`} prefetch={false}>
              {taak.schoolName}
            </Link>
          </>
        )}
      </p>
      {(taak.datum || taak.tijd) && (
        <p className="ml-sales-widget__meta">
          {taak.datum ? formatKorteDatum(taak.datum) : "Geen datum"}
          {taak.tijd ? ` · ${taak.tijd}` : ""}
        </p>
      )}
      {taak.beschrijving && <p className="ml-sales-widget__context">{taak.beschrijving}</p>}

      {modus === "weergave" && (
        <div className="ml-sales__actie-knoppen">
          <button type="button" className="ml-sales__knop" disabled={bezig} onClick={() => patch({ status: "afgerond" })}>
            Afronden
          </button>
          <button type="button" className="ml-sales__knop" disabled={bezig} onClick={() => setModus("datum")}>
            Datum wijzigen
          </button>
          <button type="button" className="ml-sales__knop" disabled={bezig} onClick={() => setModus("bewerken")}>
            Bewerken
          </button>
          <button type="button" className="ml-sales__knop" disabled={bezig} onClick={() => patch({ status: "vervallen" })}>
            Verwijderen
          </button>
        </div>
      )}

      {modus === "datum" && (
        <div className="ml-sales__plan-actie-form" onClick={(e) => e.stopPropagation()}>
          <input type="date" value={nieuweDatum} onChange={(e) => setNieuweDatum(e.target.value)} />
          <div className="ml-sales__actie-knoppen">
            <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={bezig} onClick={() => patch({ datum: nieuweDatum || null })}>
              Opslaan
            </button>
            <button type="button" className="ml-sales__knop" disabled={bezig} onClick={() => setModus("weergave")}>
              Annuleren
            </button>
          </div>
        </div>
      )}

      {modus === "bewerken" && (
        <div className="ml-sales__plan-actie-form" onClick={(e) => e.stopPropagation()}>
          <input type="text" value={bewerkTitel} onChange={(e) => setBewerkTitel(e.target.value)} placeholder="Titel" />
          <input type="text" value={bewerkBeschrijving} onChange={(e) => setBewerkBeschrijving(e.target.value)} placeholder="Beschrijving" />
          <input type="date" value={bewerkDatum} onChange={(e) => setBewerkDatum(e.target.value)} />
          <input type="text" value={bewerkTijd} onChange={(e) => setBewerkTijd(e.target.value)} placeholder="Tijd (bv. 14:30)" />
          <div className="ml-sales__actie-knoppen">
            <button
              type="button"
              className="ml-sales__knop ml-sales__knop--primair"
              disabled={bezig || !bewerkTitel.trim()}
              onClick={() =>
                patch({
                  titel: bewerkTitel.trim(),
                  beschrijving: bewerkBeschrijving.trim() || null,
                  datum: bewerkDatum || null,
                  tijd: bewerkTijd.trim() || null,
                })
              }
            >
              Opslaan
            </button>
            <button type="button" className="ml-sales__knop" disabled={bezig} onClick={() => setModus("weergave")}>
              Annuleren
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Mijn Werk Fase 2 (2026-08-17) — vierde kaarttype: een live Google Calendar-
// event. Bewust ALTIJD --rustig (geen urgentiekleur — een agenda-afspraak is
// geen "actie die moet gebeuren" zoals een taak/sales-actie) en zonder
// actieknoppen: dit is alleen-lezen weergave van iemands eigen agenda, geen
// beheerbaar MijnLeerlijn-object. Bron staat, net als bij de andere drie,
// als rustige meta-regel — opdrachtseis: bron subtiel zichtbaar, tijd/titel
// blijft de hoofdzaak (zie het voorbeeldkaartje uit de opdracht: "09:00 ·
// Agenda / Training Montessorischool X").
function GoogleAgendaKaart({ item }: { item: WerkAgendaEventItem }) {
  return (
    <div className="ml-sales-widget__item ml-sales-widget__item--rustig">
      <div className="ml-sales-widget__item-header">
        <span className="ml-sales-widget__schoolnaam">{item.titel}</span>
      </div>
      <p className="ml-sales-widget__meta" style={{ fontWeight: 600 }}>
        Agenda
      </p>
      <p className="ml-sales-widget__meta">
        {item.volledigeDag ? "Hele dag" : item.tijd}
        {!item.volledigeDag && item.eindTijd ? ` – ${item.eindTijd}` : ""}
      </p>
    </div>
  );
}

function AgendaKaart({ item, onGewijzigd }: { item: WerkItem; onGewijzigd: () => void }) {
  if (item.bron === "monday") return <MondayPlanningKaart item={item} />;
  if (item.bron === "taak") return <TaakKaart taak={item} onGewijzigd={onGewijzigd} />;
  if (item.bron === "agenda") return <GoogleAgendaKaart item={item} />;
  return <ActieKaart actie={item} />;
}

// Mijn Werk Fase 2 (2026-08-17) — voorbereidingssignaal-kaart, vier acties
// (opdrachtseis, exact deze vier): "Maak voorbereidingstaak" (deterministisch,
// direct), "Maak voorbereidingsvoorstel" (AI, uitsluitend na deze expliciete
// klik — zie app/api/werk/voorbereiding/ai-voorstel), "Ik ben al voorbereid"
// (dempt het signaal) en "Herinner morgen" (maakt een taak gedateerd op
// morgen). Het AI-voorstel toont zich pas na de klik, met "Taak toevoegen"/
// "Aanpassen" (bewerkbare titel/beschrijving vóór opslaan)/"Niet nodig" —
// GEEN automatische taak zonder een van deze expliciete bevestigingen.
function VoorbereidingsKaart({ signaal, vandaag, onGewijzigd }: { signaal: VoorbereidingSignaalDoc; vandaag: string; onGewijzigd: () => void }) {
  const [bezig, setBezig] = useState<string | null>(null);
  const [aiVoorstel, setAiVoorstel] = useState<Voorbereidingsvoorstel | null>(null);
  const [aiSchoolId, setAiSchoolId] = useState<number | null>(null);
  const [aiBewerken, setAiBewerken] = useState(false);
  const [aiTaakTitel, setAiTaakTitel] = useState("");
  const [aiTaakBeschrijving, setAiTaakBeschrijving] = useState("");
  const [fout, setFout] = useState<string | null>(null);

  const eventStart = `${signaal.event.datum}T${signaal.event.tijd ?? "00:00"}:00`;

  async function voerActieUit(actie: "dempen" | "taak" | "herinner_morgen", extra?: { taakTitel?: string; taakBeschrijving?: string }) {
    setBezig(actie);
    setFout(null);
    try {
      const datum = actie === "herinner_morgen" ? voegDagenToe(vandaag, 1) : vandaag;
      const { ok } = await apiPost("/api/werk/voorbereiding/actie", {
        actie,
        eventId: signaal.event.id,
        eventStart,
        eventTitel: signaal.event.titel,
        schoolId: (extra ? aiSchoolId : signaal.school?.id) ?? null,
        datum,
        taakTitel: extra?.taakTitel,
        taakBeschrijving: extra?.taakBeschrijving,
      });
      if (ok) onGewijzigd();
      else setFout("Actie mislukt — probeer het opnieuw.");
    } finally {
      setBezig(null);
    }
  }

  async function maakAiVoorstel() {
    setBezig("ai");
    setFout(null);
    const { ok, data } = await apiPost<{ voorstel: Voorbereidingsvoorstel; schoolId: number | null }>("/api/werk/voorbereiding/ai-voorstel", {
      eventId: signaal.event.id,
      schoolId: signaal.school?.id ?? null,
    });
    if (ok && data) {
      setAiVoorstel(data.voorstel);
      setAiSchoolId(data.schoolId);
      setAiTaakTitel(`Voorbereiden: ${signaal.event.titel}`);
      setAiTaakBeschrijving(data.voorstel.concreteVoorbereidingstaak);
    } else {
      setFout("Voorstel maken mislukt — probeer het opnieuw.");
    }
    setBezig(null);
  }

  return (
    <div className="ml-sales-widget__item ml-sales-widget__item--rustig">
      <div className="ml-sales-widget__item-header">
        <span className="ml-sales-widget__schoolnaam">{signaal.event.titel}</span>
      </div>
      <p className="ml-sales-widget__meta" style={{ fontWeight: 600 }}>
        {signaal.dagenTotEvent <= 0 ? "Vandaag" : signaal.dagenTotEvent === 1 ? "Morgen" : `Over ${signaal.dagenTotEvent} dagen`}
        {signaal.school && (
          <>
            {" · "}
            <Link href={`/admin/sales/school?id=${signaal.school.id}`} prefetch={false}>
              {signaal.school.schoolName}
            </Link>
          </>
        )}
      </p>
      {!signaal.school && signaal.schoolTwijfel && (
        <p className="ml-sales-widget__context">
          Meerdere scholen komen in aanmerking — <Link href="/admin/sales/scholen" prefetch={false}>School koppelen</Link>.
        </p>
      )}
      {!signaal.school && !signaal.schoolTwijfel && (
        <p className="ml-sales-widget__context">Er staat nog geen voorbereidingstaak klaar.</p>
      )}

      {!aiVoorstel && (
        <div className="ml-sales__actie-knoppen">
          <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={bezig !== null} onClick={() => voerActieUit("taak")}>
            {bezig === "taak" ? "Bezig…" : "Maak voorbereidingstaak"}
          </button>
          <button type="button" className="ml-sales__knop" disabled={bezig !== null} onClick={maakAiVoorstel}>
            {bezig === "ai" ? "Bezig…" : "Maak voorbereidingsvoorstel"}
          </button>
          <button type="button" className="ml-sales__knop" disabled={bezig !== null} onClick={() => voerActieUit("dempen")}>
            Ik ben al voorbereid
          </button>
          <button type="button" className="ml-sales__knop" disabled={bezig !== null} onClick={() => voerActieUit("herinner_morgen")}>
            Herinner morgen
          </button>
        </div>
      )}

      {aiVoorstel && !aiBewerken && (
        <div className="ml-werk-quickadd__voorstel">
          <dl className="ml-werk-quickadd__preview">
            <dt>Doel van de sessie</dt>
            <dd>{aiVoorstel.doelVanDeSessie}</dd>
            <dt>Relevante onderwerpen</dt>
            <dd>{aiVoorstel.relevanteOnderwerpen.join(", ") || "—"}</dd>
            <dt>Wat vooraf klaarzetten</dt>
            <dd>{aiVoorstel.watVoorafKlaarzetten.join(", ") || "—"}</dd>
            <dt>Mogelijke vragen</dt>
            <dd>{aiVoorstel.mogelijkeVragen.join(", ") || "—"}</dd>
            <dt>Voorbereidingstaak</dt>
            <dd>{aiVoorstel.concreteVoorbereidingstaak}</dd>
          </dl>
          <div className="ml-sales__actie-knoppen">
            <button
              type="button"
              className="ml-sales__knop ml-sales__knop--primair"
              disabled={bezig !== null}
              onClick={() => voerActieUit("taak", { taakTitel: aiTaakTitel, taakBeschrijving: aiTaakBeschrijving })}
            >
              {bezig === "taak" ? "Bezig…" : "Taak toevoegen"}
            </button>
            <button type="button" className="ml-sales__knop" disabled={bezig !== null} onClick={() => setAiBewerken(true)}>
              Aanpassen
            </button>
            <button type="button" className="ml-sales__knop" disabled={bezig !== null} onClick={() => voerActieUit("dempen")}>
              Niet nodig
            </button>
          </div>
        </div>
      )}

      {aiVoorstel && aiBewerken && (
        <div className="ml-sales__plan-actie-form" onClick={(e) => e.stopPropagation()}>
          <input type="text" value={aiTaakTitel} onChange={(e) => setAiTaakTitel(e.target.value)} placeholder="Titel" aria-label="Titel" />
          <input
            type="text"
            value={aiTaakBeschrijving}
            onChange={(e) => setAiTaakBeschrijving(e.target.value)}
            placeholder="Beschrijving"
            aria-label="Beschrijving"
          />
          <div className="ml-sales__actie-knoppen">
            <button
              type="button"
              className="ml-sales__knop ml-sales__knop--primair"
              disabled={bezig !== null || !aiTaakTitel.trim()}
              onClick={() => voerActieUit("taak", { taakTitel: aiTaakTitel.trim(), taakBeschrijving: aiTaakBeschrijving.trim() })}
            >
              {bezig === "taak" ? "Bezig…" : "Taak toevoegen"}
            </button>
            <button type="button" className="ml-sales__knop" disabled={bezig !== null} onClick={() => setAiBewerken(false)}>
              Terug
            </button>
          </div>
        </div>
      )}

      {fout && <p className="ml-sales-widget__meta">{fout}</p>}
    </div>
  );
}

// Mijn Werk Fase 3 (2026-08-17) — mailkaart, vierde bronkleur naast Agenda/
// Sales/Taken (groen, NAV_COLOR_STYLES.green — CSS-modifier
// ml-sales-widget__item--mail). Drie acties (opdrachtseis, exact deze drie):
// "Maak antwoordvoorstel" (AI, uitsluitend na deze klik — leest pas dan de
// volledige mail, zie app/api/werk/mail/antwoordvoorstel), "Maak taak"
// (deterministisch, altijd een bewerkbare bevestigingsstap, nooit direct
// opslaan) en "Niet relevant" (dempt het signaal). Het antwoordvoorstel is
// altijd bewerkbaar vóór versturen, en "Verstuur" vereist een aparte,
// expliciete bevestigingsstap (opdrachtseis) — geen enkele van deze acties
// verstuurt/plant/maakt ooit iets zonder een user-klik ertussen.
function MailKaart({ signaal, vandaag, onGewijzigd }: { signaal: MailSignaalDoc; vandaag: string; onGewijzigd: () => void }) {
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const [voorstel, setVoorstel] = useState<MailAntwoordvoorstel | null>(null);
  const [conceptTekst, setConceptTekst] = useState("");
  const [bevestigVersturen, setBevestigVersturen] = useState(false);

  const [taakModus, setTaakModus] = useState(false);
  const [taakTitel, setTaakTitel] = useState(`Beantwoorden: ${signaal.onderwerp}`);
  const [taakBeschrijving, setTaakBeschrijving] = useState(signaal.reden);
  const [taakDatum, setTaakDatum] = useState(vandaag);

  async function maakAntwoordvoorstel() {
    setBezig("voorstel");
    setFout(null);
    const { ok, data } = await apiPost<{ voorstel: MailAntwoordvoorstel }>("/api/werk/mail/antwoordvoorstel", {
      signaalId: signaal.signaalId,
      vandaag,
    });
    if (ok && data) {
      setVoorstel(data.voorstel);
      setConceptTekst(data.voorstel.conceptTekst);
    } else {
      setFout("Antwoordvoorstel maken mislukt — probeer het opnieuw.");
    }
    setBezig(null);
  }

  async function verstuur() {
    setBezig("versturen");
    setFout(null);
    const { ok } = await apiPost("/api/werk/mail/versturen", { signaalId: signaal.signaalId, bodyText: conceptTekst });
    if (ok) {
      onGewijzigd();
    } else {
      setFout("Versturen mislukt — probeer het opnieuw.");
      setBevestigVersturen(false);
    }
    setBezig(null);
  }

  async function dempen() {
    setBezig("dempen");
    setFout(null);
    const { ok } = await apiPost("/api/werk/mail/actie", { actie: "dempen", signaalId: signaal.signaalId });
    if (ok) onGewijzigd();
    else setFout("Actie mislukt — probeer het opnieuw.");
    setBezig(null);
  }

  async function bevestigTaak() {
    if (!taakTitel.trim()) return;
    setBezig("taak");
    setFout(null);
    const { ok } = await apiPost("/api/werk/mail/actie", {
      actie: "taak",
      signaalId: signaal.signaalId,
      taakTitel: taakTitel.trim(),
      taakBeschrijving: taakBeschrijving.trim(),
      datum: taakDatum,
    });
    if (ok) onGewijzigd();
    else setFout("Taak aanmaken mislukt — probeer het opnieuw.");
    setBezig(null);
  }

  return (
    <div className="ml-sales-widget__item ml-sales-widget__item--mail">
      <div className="ml-sales-widget__item-header">
        <span className="ml-sales-widget__schoolnaam">{weergaveNaamAfzender(signaal.van)}</span>
      </div>
      <p className="ml-sales-widget__meta" style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
        <Mail size={13} aria-hidden="true" style={{ color: NAV_COLOR_STYLES.green.fg }} />
        Mail · {formatSyncTijd(signaal.ontvangenOp)}
        {signaal.school && (
          <>
            {" · "}
            <Link href={`/admin/sales/school?id=${signaal.school.id}`} prefetch={false}>
              {signaal.school.schoolName}
            </Link>
          </>
        )}
      </p>
      <p className="ml-sales-widget__meta">{signaal.onderwerp}</p>
      <p className="ml-sales-widget__context">{signaal.reden}</p>

      {!voorstel && !taakModus && (
        <div className="ml-sales__actie-knoppen">
          <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={bezig !== null} onClick={maakAntwoordvoorstel}>
            {bezig === "voorstel" ? "Bezig…" : "Maak antwoordvoorstel"}
          </button>
          <button type="button" className="ml-sales__knop" disabled={bezig !== null} onClick={() => setTaakModus(true)}>
            Maak taak
          </button>
          <button type="button" className="ml-sales__knop" disabled={bezig !== null} onClick={dempen}>
            {bezig === "dempen" ? "Bezig…" : "Niet relevant"}
          </button>
        </div>
      )}

      {taakModus && (
        <div className="ml-sales__plan-actie-form" onClick={(e) => e.stopPropagation()}>
          <input type="text" value={taakTitel} onChange={(e) => setTaakTitel(e.target.value)} placeholder="Titel" aria-label="Titel" />
          <input
            type="text"
            value={taakBeschrijving}
            onChange={(e) => setTaakBeschrijving(e.target.value)}
            placeholder="Beschrijving"
            aria-label="Beschrijving"
          />
          <input type="date" value={taakDatum} onChange={(e) => setTaakDatum(e.target.value)} aria-label="Datum" />
          <div className="ml-sales__actie-knoppen">
            <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={bezig !== null || !taakTitel.trim()} onClick={bevestigTaak}>
              {bezig === "taak" ? "Bezig…" : "Taak toevoegen"}
            </button>
            <button type="button" className="ml-sales__knop" disabled={bezig !== null} onClick={() => setTaakModus(false)}>
              Annuleren
            </button>
          </div>
        </div>
      )}

      {voorstel && (
        <div className="ml-werk-quickadd__voorstel">
          <p className="ml-sales-widget__meta">
            Aan: {voorstel.aan} · Onderwerp: {voorstel.onderwerp}
          </p>
          <textarea
            className="ml-mail-antwoord__tekstveld"
            value={conceptTekst}
            onChange={(e) => setConceptTekst(e.target.value)}
            rows={8}
            aria-label="Conceptantwoord"
          />
          {!bevestigVersturen ? (
            <div className="ml-sales__actie-knoppen">
              <button
                type="button"
                className="ml-sales__knop ml-sales__knop--primair"
                disabled={bezig !== null || !conceptTekst.trim()}
                onClick={() => setBevestigVersturen(true)}
              >
                Verstuur
              </button>
              <button type="button" className="ml-sales__knop" disabled={bezig !== null} onClick={() => setVoorstel(null)}>
                Annuleren
              </button>
            </div>
          ) : (
            <div className="ml-sales__plan-actie-form">
              <p className="ml-sales-widget__context">
                Dit verstuurt de mail naar <strong>{voorstel.aan}</strong>. Dit kan niet ongedaan worden gemaakt.
              </p>
              <div className="ml-sales__actie-knoppen">
                <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={bezig !== null} onClick={verstuur}>
                  {bezig === "versturen" ? "Bezig…" : "Ja, versturen"}
                </button>
                <button type="button" className="ml-sales__knop" disabled={bezig !== null} onClick={() => setBevestigVersturen(false)}>
                  Annuleren
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {fout && <p className="ml-sales-widget__meta">{fout}</p>}
    </div>
  );
}

function voorstelAccentKlasse(proposalType: string, status: string): string {
  if (status === "conflict") return "ml-sales-widget__item--conflict";
  if (proposalType === "veld_correctie") return "ml-sales-widget__item--verrijking";
  if (proposalType === "bestaande_vervolgdatum") return "ml-sales-widget__item--bestaande-datum";
  return "ml-sales-widget__item--ai-voorstel";
}

async function apiGet<T>(url: string): Promise<T[]> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return [];
  const data = (await res.json()) as { docs?: T[] };
  return data.docs ?? [];
}

async function apiPost<T>(url: string, body?: unknown): Promise<{ ok: boolean; data: T | null }> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null;
  }
  return { ok: res.ok, data };
}

export function SalesDashboardPaneel() {
  const { getPreference, setPreference } = usePreferences();
  const [tab, setTab] = useState<Tab>("vandaag");
  const [tabGeladen, setTabGeladen] = useState(false);

  const [alleOpenActies, setAlleOpenActies] = useState<SalesActionDoc[]>([]);
  const [actiesDezeWeekAantal, setActiesDezeWeekAantal] = useState(0);
  const [todo, setTodo] = useState<TodoResultaat | null>(null);
  const [scholenVoorSelector, setScholenVoorSelector] = useState<SchoolOptie[]>([]);
  const [laden, setLaden] = useState(true);
  const [syncStatus, setSyncStatus] = useState<LaatsteSyncStatus | null>(null);
  const [syncBezig, setSyncBezig] = useState(false);
  const [syncFout, setSyncFout] = useState<string | null>(null);

  // Productiecorrectie 2026-08-16 (punt 2) — datumgestuurde "Vandaag"-tab.
  const [gekozenDatum, setGekozenDatum] = useState(vandaagIso());
  const [datumPickerOpen, setDatumPickerOpen] = useState(false);

  const [schoolKeuze, setSchoolKeuze] = useState<string>("alle");
  const [vraagInvoer, setVraagInvoer] = useState("");
  const [vraagBerichten, setVraagBerichten] = useState<{ vraag: string; antwoord: string }[]>([]);
  const [vraagBezig, setVraagBezig] = useState(false);
  const [vraagFout, setVraagFout] = useState<string | null>(null);

  // Mijn Werk V1 (2026-08-17) — eigen taken + Wachten op + de quick-add-
  // bevestigingsstap ("+ Wat wil je doen?"). quickAddVoorstel is null zolang
  // er niets geparsed is (invoerveld getoond); niet-null toont de
  // bevestigingskaart (voorstel/aanpassen/annuleren) — nooit automatisch
  // opslaan (opdrachtseis).
  const [taken, setTaken] = useState<PersonalTaskDoc[]>([]);
  const [wachtenOp, setWachtenOp] = useState<WachtenOpItem[]>([]);
  const [quickAddTekst, setQuickAddTekst] = useState("");
  const [quickAddVoorstel, setQuickAddVoorstel] = useState<QuickAddVoorstel | null>(null);
  const [quickAddBewerkVeld, setQuickAddBewerkVeld] = useState(false);
  const [quickAddBezig, setQuickAddBezig] = useState(false);

  // Mijn Werk Fase 2 (2026-08-17) — Google Agenda-koppeling (per gebruiker,
  // zie payload/collections/GoogleConnections.ts) + live agenda-events voor
  // de gekozen dag + voorbereidingssignalen. googleConnectionGeladen
  // voorkomt dat de koppel-CTA even flitst vóór de eerste fetch klaar is.
  const [googleConnection, setGoogleConnection] = useState<GoogleConnectionDoc | null>(null);
  const [googleConnectionGeladen, setGoogleConnectionGeladen] = useState(false);
  const [googleOntkoppelBezig, setGoogleOntkoppelBezig] = useState(false);
  const [agendaEvents, setAgendaEvents] = useState<GoogleCalendarEvent[]>([]);
  const [voorbereidingSignalen, setVoorbereidingSignalen] = useState<VoorbereidingSignaalDoc[]>([]);

  // Mijn Werk Fase 3 (2026-08-17) — mail die aandacht vraagt, zie
  // lib/werk/mail-signalen.ts. Gedreven door dezelfde googleConnection-state
  // hierboven (gedeelde koppeling) — geen los "gmailConnection"-fetch nodig.
  const [mailSignalen, setMailSignalen] = useState<MailSignaalDoc[]>([]);

  useEffect(() => {
    let actief = true;
    (async () => {
      const opgeslagen = await getPreference<Tab>(TAB_PREFERENCE_KEY);
      if (actief && opgeslagen) setTab(opgeslagen);
      if (actief) setTabGeladen(true);
    })();
    return () => {
      actief = false;
    };
  }, [getPreference]);

  function kiesTab(nieuweTab: Tab) {
    setTab(nieuweTab);
    setPreference(TAB_PREFERENCE_KEY, nieuweTab);
  }

  const laadData = useCallback(async () => {
    setLaden(true);
    const [openActies, todoData, scholenLijst, syncStatusData, takenData, wachtenOpData] = await Promise.all([
      apiGet<SalesActionDoc>(`/api/sales-actions?where[status][equals]=open&depth=1&sort=dueDate&limit=200`),
      fetch("/api/sales/dashboard/todo", { credentials: "include" })
        .then((r) => (r.ok ? (r.json() as Promise<TodoResultaat>) : null))
        .catch(() => null),
      apiGet<SchoolOptie>(`/api/sales-schools?depth=0&sort=schoolName&limit=1000`),
      fetch("/api/sales/sync/status", { credentials: "include" })
        .then((r) => (r.ok ? (r.json() as Promise<LaatsteSyncStatus>) : null))
        .catch(() => null),
      // Mijn Werk V1 — Payload's eigen REST-API is al eigenaar-gescoped
      // (ownRecordAccess), dus geen where[eigenaar]-filter nodig hier.
      apiGet<PersonalTaskDoc>(`/api/personal-tasks?depth=0&limit=500`),
      fetch("/api/werk/wachten-op", { credentials: "include" })
        .then((r) => (r.ok ? (r.json() as Promise<{ items: WachtenOpItem[] }>) : null))
        .catch(() => null),
    ]);
    setAlleOpenActies(openActies);
    const over7Dagen = new Date();
    over7Dagen.setDate(over7Dagen.getDate() + 7);
    const over7DagenIso = over7Dagen.toISOString().slice(0, 10);
    setActiesDezeWeekAantal(openActies.filter((a) => a.dueDate.slice(0, 10) <= over7DagenIso).length);
    setTodo(todoData);
    setScholenVoorSelector(scholenLijst);
    setSyncStatus(syncStatusData);
    setTaken(takenData);
    setWachtenOp(wachtenOpData?.items ?? []);
    setLaden(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    laadData();
  }, [laadData]);

  // Mijn Werk Fase 2 (2026-08-17) — koppelingsstatus via Payload's eigen
  // native REST (GET /api/google-connections), ownRecordAccess-gescoped: dit
  // levert per definitie uitsluitend de EIGEN koppeling van de ingelogde
  // gebruiker, of een lege lijst. Los van laadData() (dat blijft ongewijzigd
  // Sales-georiënteerd) — deze koppeling bepaalt op zijn beurt of de
  // agenda-/voorbereidingsfetches hieronder überhaupt zin hebben.
  const laadGoogleConnection = useCallback(async () => {
    const res = await fetch("/api/google-connections?limit=1&depth=0", { credentials: "include" });
    if (res.ok) {
      const data = (await res.json()) as { docs?: GoogleConnectionDoc[] };
      setGoogleConnection(data.docs?.[0] ?? null);
    }
    setGoogleConnectionGeladen(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    laadGoogleConnection();
  }, [laadGoogleConnection]);

  // Mijn Werk Fase 3 (2026-08-17) — Agenda en Gmail delen vanaf nu dezelfde
  // koppelingsrij (incrementele autorisatie, zie lib/google-calendar/oauth.ts
  // se buildGoogleAuthUrl), dus "is er een koppeling" (googleConnection) is
  // niet meer hetzelfde als "is déze capability toegekend" — een gebruiker
  // kan bv. uitsluitend Gmail gekoppeld hebben, nooit Agenda. Puur afgeleid,
  // geen state.
  const heeftAgendaScope = googleConnection?.status === "actief" && googleConnection.scopes.includes(GOOGLE_CALENDAR_SCOPE_LITERAL);
  const heeftGmailScope = googleConnection?.status === "actief" && heeftGmailScopes(googleConnection.scopes);

  // Live per gekozen dag opgehaald (geen bulkopslag, zie app/api/werk/agenda)
  // — herlaadt zodra de datumnavigatie wisselt. Uitsluitend aangeroepen met
  // een actieve koppeling; anders blijft agendaEvents leeg zonder onnodige
  // aanvraag.
  useEffect(() => {
    if (!heeftAgendaScope) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAgendaEvents([]);
      return;
    }
    let actief = true;
    fetch(`/api/werk/agenda?datum=${gekozenDatum}`, { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<{ connected: boolean; events: GoogleCalendarEvent[] }>) : null))
      .then((data) => {
        if (actief && data) setAgendaEvents(data.events);
      })
      .catch(() => {});
    return () => {
      actief = false;
    };
  }, [gekozenDatum, heeftAgendaScope]);

  // Voorbereidingssignalen zijn altijd relatief aan "vandaag" (niet aan
  // gekozenDatum, zie lib/werk/voorbereiding.ts) — herladen na elke actie op
  // een signaalkaart via onGewijzigd, net als laadData().
  const laadVoorbereidingSignalen = useCallback(async () => {
    if (!heeftAgendaScope) {
      setVoorbereidingSignalen([]);
      return;
    }
    const res = await fetch(`/api/werk/voorbereiding?vandaag=${vandaagIso()}`, { credentials: "include" });
    if (res.ok) {
      const data = (await res.json()) as { connected: boolean; signalen: VoorbereidingSignaalDoc[] };
      setVoorbereidingSignalen(data.signalen);
    }
  }, [heeftAgendaScope]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    laadVoorbereidingSignalen();
  }, [laadVoorbereidingSignalen]);

  // Mijn Werk Fase 3 (2026-08-17) — mail die aandacht vraagt, zelfde
  // "afgeleid van de koppelstatus, herladen via onGewijzigd"-patroon als
  // voorbereidingssignalen hierboven.
  const laadMailSignalen = useCallback(async () => {
    if (!heeftGmailScope) {
      setMailSignalen([]);
      return;
    }
    const res = await fetch("/api/werk/mail", { credentials: "include" });
    if (res.ok) {
      const data = (await res.json()) as { connected: boolean; signalen: MailSignaalDoc[] };
      setMailSignalen(data.signalen);
    }
  }, [heeftGmailScope]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    laadMailSignalen();
  }, [laadMailSignalen]);

  async function ontkoppelGoogleAgenda() {
    if (!googleConnection) return;
    setGoogleOntkoppelBezig(true);
    try {
      const res = await fetch(`/api/google-connections/${googleConnection.id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        setGoogleConnection(null);
        setAgendaEvents([]);
        setVoorbereidingSignalen([]);
        setMailSignalen([]);
      }
    } finally {
      setGoogleOntkoppelBezig(false);
    }
  }

  // Functionele-inconsistentiefix (vervolg op punt 2) — normaliseert de ruwe
  // API-vormen (school: SchoolRef|number, optionele scholenvelden) naar de
  // vlakke invoervormen die bepaalGecombineerdeAgenda() (lib/sales/vandaag.ts)
  // verwacht. Puur afgeleid van al opgehaalde state — geen extra fetch.
  const actiesVoorAgenda = useMemo<AgendaActieInvoer[]>(
    () =>
      alleOpenActies.map((a) => {
        const school = schoolRef(a.school);
        return {
          id: a.id,
          description: a.description,
          dueDate: a.dueDate,
          type: a.type,
          channel: a.channel,
          schoolId: school.id,
          schoolName: school.schoolName,
          relatiestatus: school.relatiestatus ?? null,
          plaats: school.plaats ?? null,
        };
      }),
    [alleOpenActies]
  );
  const scholenVoorAgenda = useMemo<SchoolMetMondayPlanning[]>(
    () =>
      scholenVoorSelector.map((s) => ({
        id: s.id,
        schoolName: s.schoolName,
        relatiestatus: s.relatiestatus ?? null,
        plaats: s.plaats ?? null,
        actief: s.actief ?? false,
        mondayVolgendeActieDatum: s.mondayVolgendeActieDatum ?? null,
        cachedGeplandeActieTekst: s.cachedGeplandeActieTekst ?? null,
      })),
    [scholenVoorSelector]
  );

  // Mijn Werk V1 (2026-08-17) — normaliseert de ruwe personal-tasks-API-vorm
  // naar TaakInvoer (lib/werk/agenda.ts), zelfde "puur afgeleid van al
  // opgehaalde state"-patroon als actiesVoorAgenda/scholenVoorAgenda hierboven.
  const takenVoorAgenda = useMemo<TaakInvoer[]>(
    () =>
      taken.map((t) => {
        const school = t.school ? schoolRef(t.school) : null;
        return {
          id: t.id,
          titel: t.titel,
          beschrijving: t.beschrijving ?? null,
          datum: t.datum ? t.datum.slice(0, 10) : null,
          tijd: t.tijd ?? null,
          status: t.status,
          schoolId: school?.id ?? null,
          schoolName: school?.schoolName ?? null,
        };
      }),
    [taken]
  );

  // Mijn Werk V1 — schoolopties voor de quick-add-parser (deterministische
  // schoolherkenning, lib/werk/quick-add-parser.ts) — puur afgeleid, geen
  // extra fetch.
  const scholenVoorQuickAdd = useMemo<QuickAddSchoolOptie[]>(
    () => scholenVoorSelector.map((s) => ({ id: s.id, schoolName: s.schoolName })),
    [scholenVoorSelector]
  );

  // Sales-logica productiecorrectie 2026-08-16 (punt 1) — EXACT dezelfde
  // sync-route/logica als de "Sync nu"-knop op Sales Overzicht
  // (SalesVandaagView.tsx): geen tweede sync-implementatie, alleen een
  // andere, compactere weergave van de uitkomst.
  async function voerSyncUit() {
    setSyncBezig(true);
    setSyncFout(null);
    const { ok } = await apiPost("/api/sales/sync");
    if (!ok) setSyncFout("Sync mislukt — probeer het opnieuw.");
    setSyncBezig(false);
    laadData();
  }

  // Mijn Werk V1 (2026-08-17) — quick-add-flow: parseren is puur client-side
  // (parseQuickAdd, geen netwerk-/AI-aanroep, zie lib/werk/quick-add-parser.ts),
  // opslaan gaat pas na expliciete bevestiging ("Taak toevoegen") rechtstreeks
  // naar Payload's eigen personal-tasks-REST-API — nooit automatisch opslaan.
  function maakQuickAddVoorstel() {
    const tekst = quickAddTekst.trim();
    if (!tekst) return;
    setQuickAddVoorstel(parseQuickAdd(tekst, vandaagIso(), scholenVoorQuickAdd));
    setQuickAddBewerkVeld(false);
  }

  function annuleerQuickAdd() {
    setQuickAddTekst("");
    setQuickAddVoorstel(null);
    setQuickAddBewerkVeld(false);
  }

  async function bevestigQuickAdd() {
    if (!quickAddVoorstel || !quickAddVoorstel.titel.trim()) return;
    setQuickAddBezig(true);
    try {
      const { ok } = await apiPost("/api/personal-tasks", {
        titel: quickAddVoorstel.titel.trim(),
        datum: quickAddVoorstel.datum,
        tijd: quickAddVoorstel.tijd,
        school: quickAddVoorstel.schoolId,
        status: "open",
      });
      if (ok) {
        annuleerQuickAdd();
        laadData();
      }
    } finally {
      setQuickAddBezig(false);
    }
  }

  async function stelVraag() {
    const vraag = vraagInvoer.trim();
    if (!vraag) return;
    setVraagInvoer("");
    setVraagBezig(true);
    setVraagFout(null);
    // Mijn Werk Fase 2 (2026-08-17) — derde, NIEUWE optie naast de twee
    // bestaande (Alle scholen/specifieke school, allebei ongewijzigd): praat
    // met app/api/werk/chat (intentie-routing over agenda/taken/sales/school,
    // zie lib/werk/context-router.ts). vandaagIso() (client-lokaal, zelfde
    // bron als de rest van dit bestand) bepaalt het look-ahead-anker voor
    // voorbereidingsvragen — niet gekozenDatum, dat is ongerelateerd aan wat
    // de gebruiker hier typt.
    const url = schoolKeuze === "mijnwerk" ? "/api/werk/chat" : schoolKeuze === "alle" ? "/api/sales/chat" : `/api/sales/school/${schoolKeuze}/chat`;
    const body = schoolKeuze === "mijnwerk" ? { vraag, vandaag: vandaagIso() } : { vraag };
    const { ok, data } = await apiPost<{ antwoord: string }>(url, body);
    if (ok && data) {
      setVraagBerichten((berichten) => [...berichten, { vraag, antwoord: data.antwoord }]);
    } else {
      setVraagFout("Vraag stellen mislukt — probeer het opnieuw.");
    }
    setVraagBezig(false);
  }

  // Productiecorrectie punt 13 (2026-08-16) — geplandInMonday telt bewust
  // NIET mee in todoAantal/het tabbadge: die scholen hebben al een geldige
  // Monday-planning en vragen geen beslissing, in tegenstelling tot
  // zonderVervolgactie (het vroegere "mogelijk afgesloten"-veiligheidsnet).
  const todoAantal = todo ? todo.proposals.length + todo.zonderVervolgactie.length : 0;

  // Productiecorrectie 2026-08-16 (punt 2, functionele-inconsistentiefix) —
  // vandaagWeergave stuurt de tab-INHOUD (reageert op gekozenDatum) en is nu
  // de GECOMBINEERDE agenda (lokale acties + Monday-planningen, gededupliceerd)
  // — vandaag/morgen/overmorgen/een aangepaste datum lopen allemaal door
  // dezelfde functie (opdrachtseis). Het tabbadge zelf blijft altijd "wat
  // moet er vandaag/achterstallig gebeuren" tonen, ongeacht welke datum net
  // binnen de tab bekeken wordt (anders zou het badge van betekenis
  // veranderen zodra iemand op "Morgen" klikt, terwijl een ANDERE tab actief is).
  // Mijn Werk Fase 2 — agendaEvents is al live opgehaald vóór gekozenDatum
  // (zie het useEffect hierboven), dus uitsluitend hier meegegeven, niet aan
  // badgeWeergave: het tabbadge blijft "wat moet er gebeuren" (acties/taken),
  // een agenda-afspraak heeft geen actieknop/afronding, dus telt daar bewust
  // niet in mee — ongewijzigde badge-semantiek.
  const vandaagWeergave = bepaalWerkAgenda(takenVoorAgenda, actiesVoorAgenda, scholenVoorAgenda, gekozenDatum, agendaEvents);
  const badgeWeergave = bepaalWerkAgenda(takenVoorAgenda, actiesVoorAgenda, scholenVoorAgenda, vandaagIso());
  const vandaagBadgeAantal = badgeWeergave.achterstallig.length + badgeWeergave.opGekozenDatum.length;

  // Sales-logica productiecorrectie 2026-08-16 (punt 1/11) — "159 scholen
  // bijgewerkt · 6 wijzigingen · Y bestaande planningen herkend · Z scholen
  // niet meer op Master Data-board gedeactiveerd · N verouderde AI-voorstellen
  // gesloten" bij de sync-knop. scholenGewijzigd is de striktere teller
  // (echte CRM-kernveldwijzigingen, zie lib/sales/sync.ts) — bewust géén
  // updatesNieuw (nieuwe Monday-comments zeggen niets over of een
  // CRM-kernveld ook echt veranderde). De 3 nieuwe tellers staan er, net als
  // scholenGewijzigd, ALTIJD bij (ook op 0) — opdrachtseis: "dan zie ik dat
  // reconciliation daadwerkelijk is uitgevoerd", 0 is hier een zichtbaar
  // bevestigd feit, geen weggelaten stilte. Alleen fouten blijft conditioneel
  // (0 fouten is de normale, geen-vermelding-waardige staat).
  const syncSamenvatting =
    syncStatus?.scholenVerwerkt != null
      ? [
          `${syncStatus.scholenVerwerkt} school${syncStatus.scholenVerwerkt === 1 ? "" : "en"} bijgewerkt`,
          `${syncStatus.scholenGewijzigd ?? 0} wijziging${(syncStatus.scholenGewijzigd ?? 0) === 1 ? "" : "en"}`,
          `${syncStatus.bestaandePlanningenHerkend ?? 0} bestaande planning${(syncStatus.bestaandePlanningenHerkend ?? 0) === 1 ? "" : "en"} herkend`,
          `${syncStatus.scholenVanBoardGehaald ?? 0} school${(syncStatus.scholenVanBoardGehaald ?? 0) === 1 ? "" : "en"} niet meer op Master Data-board gedeactiveerd`,
          `${syncStatus.verouderdeVoorstellenGesloten ?? 0} verouderd${(syncStatus.verouderdeVoorstellenGesloten ?? 0) === 1 ? "" : "e"} AI-voorstel${(syncStatus.verouderdeVoorstellenGesloten ?? 0) === 1 ? "" : "len"} gesloten`,
          syncStatus.fouten ? `${syncStatus.fouten} fout${syncStatus.fouten === 1 ? "" : "en"}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  // Snelle inzichten + AI-tip (visuele polish, 2026-08-14) — uitsluitend
  // afgeleid van hierboven al opgehaalde data, geen nieuwe fetch/AI-call.
  const scholenAantal = scholenVoorSelector.length;
  const prospectsAantal = scholenVoorSelector.filter((s) => s.relatiestatus === "Prospect").length;
  const tipTekst = (() => {
    if (!todo) return null;
    const prospectsZonderVervolg = todo.zonderVervolgactie.filter((s) => s.relatiestatus === "Prospect").length;
    if (prospectsZonderVervolg > 0) return `Er zijn ${prospectsZonderVervolg} prospect${prospectsZonderVervolg === 1 ? "" : "s"} zonder vervolgactie.`;
    const totaal = todo.zonderVervolgactie.length;
    if (totaal > 0) return `Er ${totaal === 1 ? "is" : "zijn"} ${totaal} school${totaal === 1 ? "" : "en"} mogelijk zonder vervolgactie.`;
    return null;
  })();

  if (laden || !tabGeladen) {
    return (
      <section className="ml-sales-widget">
        <div className="ml-sales__leeg">Laden…</div>
      </section>
    );
  }

  return (
    <section className="ml-sales-widget">
      <div className="ml-sales-widget__sync-rij">
        <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={syncBezig} onClick={voerSyncUit}>
          {syncBezig ? "Bezig…" : "Sync met Monday"}
        </button>
        <div className="ml-sales-widget__sync-status">
          <p className="ml-sales-widget__meta">{syncStatus?.laatsteSyncOp ? `Laatste sync: ${formatSyncTijd(syncStatus.laatsteSyncOp)}` : "Nog niet gesynchroniseerd"}</p>
          {syncSamenvatting && <p className="ml-sales-widget__meta">{syncSamenvatting}</p>}
          {syncFout && <p className="ml-sales-widget__meta">{syncFout}</p>}
        </div>
      </div>

      {/* Mijn Werk V1 (2026-08-17) — "prominent in Mijn dag" (opdrachtseis):
         boven de tabs, dus altijd zichtbaar ongeacht welke tab actief is.
         Nooit automatisch opslaan — quickAddVoorstel toont pas een
         bevestigingskaart (voorstel/aanpassen/annuleren) na parseren. */}
      <div className="ml-werk-quickadd">
        {!quickAddVoorstel ? (
          <form
            className="ml-werk-quickadd__invoer"
            onSubmit={(e) => {
              e.preventDefault();
              maakQuickAddVoorstel();
            }}
          >
            <Plus size={16} aria-hidden="true" style={{ color: "var(--ml-admin-accent)", flexShrink: 0 }} />
            <input
              type="text"
              value={quickAddTekst}
              onChange={(e) => setQuickAddTekst(e.target.value)}
              placeholder="Wat wil je doen? Bijv. 'Vrijdag presentatie Montessori afmaken'"
              aria-label="Wat wil je doen?"
            />
            <button type="submit" className="ml-sales__knop ml-sales__knop--primair" disabled={!quickAddTekst.trim()}>
              Toevoegen
            </button>
          </form>
        ) : (
          <div className="ml-werk-quickadd__voorstel">
            {!quickAddBewerkVeld ? (
              <>
                <dl className="ml-werk-quickadd__preview">
                  <dt>Titel</dt>
                  <dd>{quickAddVoorstel.titel}</dd>
                  <dt>Datum</dt>
                  <dd>{quickAddVoorstel.datum ? formatKorteDatum(quickAddVoorstel.datum) : "—"}</dd>
                  <dt>Tijd</dt>
                  <dd>{quickAddVoorstel.tijd ?? "—"}</dd>
                  {quickAddVoorstel.schoolName && (
                    <>
                      <dt>School</dt>
                      <dd>{quickAddVoorstel.schoolName}</dd>
                    </>
                  )}
                </dl>
                <div className="ml-sales__actie-knoppen">
                  <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={quickAddBezig} onClick={bevestigQuickAdd}>
                    {quickAddBezig ? "Bezig…" : "Taak toevoegen"}
                  </button>
                  <button type="button" className="ml-sales__knop" disabled={quickAddBezig} onClick={() => setQuickAddBewerkVeld(true)}>
                    Aanpassen
                  </button>
                  <button type="button" className="ml-sales__knop" disabled={quickAddBezig} onClick={annuleerQuickAdd}>
                    Annuleren
                  </button>
                </div>
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={quickAddVoorstel.titel}
                  onChange={(e) => setQuickAddVoorstel({ ...quickAddVoorstel, titel: e.target.value })}
                  placeholder="Titel"
                  aria-label="Titel"
                />
                <input
                  type="date"
                  value={quickAddVoorstel.datum ?? ""}
                  onChange={(e) => setQuickAddVoorstel({ ...quickAddVoorstel, datum: e.target.value || null })}
                  aria-label="Datum"
                />
                <input
                  type="text"
                  value={quickAddVoorstel.tijd ?? ""}
                  onChange={(e) => setQuickAddVoorstel({ ...quickAddVoorstel, tijd: e.target.value || null })}
                  placeholder="Tijd (bv. 14:30)"
                  aria-label="Tijd"
                />
                <select
                  value={quickAddVoorstel.schoolId ?? ""}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : null;
                    const school = scholenVoorQuickAdd.find((s) => s.id === id);
                    setQuickAddVoorstel({ ...quickAddVoorstel, schoolId: id, schoolName: school?.schoolName ?? null });
                  }}
                  aria-label="School"
                >
                  <option value="">Geen school</option>
                  {scholenVoorQuickAdd.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.schoolName}
                    </option>
                  ))}
                </select>
                <div className="ml-sales__actie-knoppen">
                  <button
                    type="button"
                    className="ml-sales__knop ml-sales__knop--primair"
                    disabled={quickAddBezig || !quickAddVoorstel.titel.trim()}
                    onClick={bevestigQuickAdd}
                  >
                    {quickAddBezig ? "Bezig…" : "Taak toevoegen"}
                  </button>
                  <button type="button" className="ml-sales__knop" disabled={quickAddBezig} onClick={annuleerQuickAdd}>
                    Annuleren
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="ml-sales-widget__tabs">
        <button type="button" className={`ml-sales-widget__tab${tab === "vandaag" ? " ml-sales-widget__tab--actief" : ""}`} onClick={() => kiesTab("vandaag")}>
          <Calendar size={15} aria-hidden="true" style={{ color: NAV_COLOR_STYLES.blue.fg }} />
          Vandaag
          {vandaagBadgeAantal > 0 && <span className="ml-sales-widget__tab-badge">{vandaagBadgeAantal}</span>}
        </button>
        <button type="button" className={`ml-sales-widget__tab${tab === "todo" ? " ml-sales-widget__tab--actief" : ""}`} onClick={() => kiesTab("todo")}>
          <ClipboardList size={15} aria-hidden="true" style={{ color: NAV_COLOR_STYLES.orange.fg }} />
          To do
          {todoAantal > 0 && <span className="ml-sales-widget__tab-badge">{todoAantal}</span>}
        </button>
        <button type="button" className={`ml-sales-widget__tab${tab === "wachtenop" ? " ml-sales-widget__tab--actief" : ""}`} onClick={() => kiesTab("wachtenop")}>
          <Clock size={15} aria-hidden="true" style={{ color: NAV_COLOR_STYLES.teal.fg }} />
          Wachten op
          {wachtenOp.length > 0 && <span className="ml-sales-widget__tab-badge">{wachtenOp.length}</span>}
        </button>
        <button type="button" className={`ml-sales-widget__tab${tab === "vraag" ? " ml-sales-widget__tab--actief" : ""}`} onClick={() => kiesTab("vraag")}>
          <Sparkles size={15} aria-hidden="true" style={{ color: NAV_COLOR_STYLES.purple.fg }} />
          Vraag
        </button>
      </div>

      {tab === "vandaag" && (
        <div className="ml-sales-widget__lijst">
          <div className="ml-sales-widget__datumnav">
            <button type="button" className="ml-sales__knop" onClick={() => setGekozenDatum(voegDagenToe(gekozenDatum, -1))} aria-label="Vorige dag">
              ←
            </button>
            {VANDAAG_SNELKEUZES.map((keuze) => {
              const datum = voegDagenToe(vandaagIso(), keuze.dagenVanaf);
              return (
                <button
                  type="button"
                  key={keuze.label}
                  className={`ml-sales__knop${gekozenDatum === datum ? " ml-sales__knop--primair" : ""}`}
                  onClick={() => setGekozenDatum(datum)}
                >
                  {keuze.label}
                </button>
              );
            })}
            <button type="button" className="ml-sales__knop" onClick={() => setDatumPickerOpen((o) => !o)}>
              Kies datum
            </button>
            <button type="button" className="ml-sales__knop" onClick={() => setGekozenDatum(voegDagenToe(gekozenDatum, 1))} aria-label="Volgende dag">
              →
            </button>
            {!vandaagWeergave.isVandaag && <span className="ml-sales-widget__meta">{formatKorteDatum(gekozenDatum)}</span>}
          </div>
          {datumPickerOpen && (
            <input
              type="date"
              value={gekozenDatum}
              onChange={(e) => {
                setGekozenDatum(e.target.value);
                setDatumPickerOpen(false);
              }}
              style={{ padding: "6px 10px", borderRadius: "var(--ml-admin-radius-sm)", border: "1px solid var(--theme-elevation-200)", marginBottom: 4 }}
            />
          )}

          {/* Mijn Werk Fase 2 (2026-08-17) — koppel-CTA. Kalm, geen technische
             OAuth-details in de UI (opdrachtseis): "Koppelen"/"Opnieuw
             verbinden" zijn gewone links naar app/api/google/oauth/start (een
             GET-redirect naar Google, geen fetch-aanroep) — dezelfde route
             stuurt na afloop terug. Zichtbaar ongeacht gekozenDatum (niet
             alleen op "vandaag"), zodat koppelen ook lukt terwijl je een
             andere dag bekijkt. */}
          {/* Mijn Werk Fase 3 (2026-08-17) — nu ook zichtbaar als er WEL een
             koppeling is maar zonder de calendar-scope specifiek (bv. een
             gebruiker die uitsluitend Gmail koppelde) — "is er een
             koppeling" is sinds incrementele autorisatie niet meer hetzelfde
             als "is Agenda toegekend". De verlopen-staat blijft een apart,
             gedeeld blok (zie hieronder): die betreft de hele koppeling. */}
          {googleConnectionGeladen && googleConnection?.status !== "verlopen" && !heeftAgendaScope && (
            <div className="ml-sales-widget__item ml-sales-widget__item--rustig">
              <p className="ml-sales-widget__meta" style={{ fontWeight: 600 }}>
                Koppel Google Agenda
              </p>
              <p className="ml-sales-widget__context">Toon je afspraken samen met taken en Sales.</p>
              <div className="ml-sales__actie-knoppen">
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /api/google/oauth/start is een API-route (OAuth-redirect naar Google), geen Next.js-pagina; <Link> zou hier verkeerd zijn (onderschept geen echte navigatie). */}
                <a href="/api/google/oauth/start?capability=agenda" className="ml-sales__knop ml-sales__knop--primair">
                  Agenda koppelen
                </a>
              </div>
            </div>
          )}

          {/* Mijn Werk Fase 3 (2026-08-17) — Gmail-koppelstatus, zelfde
             3-staten-patroon als Agenda hierboven (niet gekoppeld/verlopen/
             gekoppeld) — eigen groene accent (NAV_COLOR_STYLES.green) zodat
             Gmail-items visueel te onderscheiden zijn van Agenda/Sales/Taken. */}
          {googleConnectionGeladen && googleConnection?.status !== "verlopen" && !heeftGmailScope && (
            <div className="ml-sales-widget__item ml-sales-widget__item--rustig">
              <p className="ml-sales-widget__meta" style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Mail size={14} aria-hidden="true" style={{ color: NAV_COLOR_STYLES.green.fg }} />
                Koppel Gmail
              </p>
              <p className="ml-sales-widget__context">Zie mail die om een reactie vraagt, met een AI-antwoordvoorstel dat je zelf bekijkt en verstuurt.</p>
              <div className="ml-sales__actie-knoppen">
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /api/google/oauth/start is een API-route (OAuth-redirect naar Google), geen Next.js-pagina; <Link> zou hier verkeerd zijn (onderschept geen echte navigatie). */}
                <a href="/api/google/oauth/start?capability=gmail" className="ml-sales__knop ml-sales__knop--primair">
                  Gmail koppelen
                </a>
              </div>
            </div>
          )}

          {/* "Verlopen" geldt voor de hele koppeling (Agenda én Gmail, welke
             ooit gekoppeld waren) — één gedeeld herstelblok i.p.v. dat per
             capability te dupliceren, met een link per capability zodat je
             uitsluitend hoeft te herverbinden wat je ook daadwerkelijk gebruikt. */}
          {googleConnection?.status === "verlopen" && (
            <div className="ml-sales-widget__item ml-sales-widget__item--rustig">
              <p className="ml-sales-widget__meta" style={{ fontWeight: 600 }}>
                Google-koppeling verlopen
              </p>
              <p className="ml-sales-widget__context">De toestemming is verlopen of ingetrokken — verbind opnieuw om Agenda en/of Gmail weer te gebruiken.</p>
              <div className="ml-sales__actie-knoppen">
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /api/google/oauth/start is een API-route (OAuth-redirect naar Google), geen Next.js-pagina; <Link> zou hier verkeerd zijn (onderschept geen echte navigatie). */}
                <a href="/api/google/oauth/start?capability=agenda" className="ml-sales__knop ml-sales__knop--primair">
                  Agenda opnieuw verbinden
                </a>
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- zelfde reden als hierboven. */}
                <a href="/api/google/oauth/start?capability=gmail" className="ml-sales__knop">
                  Gmail opnieuw verbinden
                </a>
              </div>
            </div>
          )}

          {heeftAgendaScope && (
            <p className="ml-sales-widget__meta" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span>Google Agenda gekoppeld{googleConnection?.emailAddress ? `: ${googleConnection.emailAddress}` : ""}</span>
              <button type="button" className="ml-sales__knop" disabled={googleOntkoppelBezig} onClick={ontkoppelGoogleAgenda}>
                {googleOntkoppelBezig ? "Bezig…" : "Ontkoppelen"}
              </button>
            </p>
          )}
          {heeftGmailScope && (
            <p className="ml-sales-widget__meta" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Mail size={13} aria-hidden="true" style={{ color: NAV_COLOR_STYLES.green.fg }} />
                Gmail gekoppeld{googleConnection?.emailAddress ? `: ${googleConnection.emailAddress}` : ""}
              </span>
              {/* Zelfde Ontkoppelen-actie als Agenda — het is één gedeelde koppeling (zie de toelichting hierboven). */}
              <button type="button" className="ml-sales__knop" disabled={googleOntkoppelBezig} onClick={ontkoppelGoogleAgenda}>
                {googleOntkoppelBezig ? "Bezig…" : "Ontkoppelen"}
              </button>
            </p>
          )}

          {/* Mijn Werk Fase 2 — voorbereidingskaarten, uitsluitend bij het
             bekijken van vandaag zelf (een signaal is nooit gebonden aan
             gekozenDatum — het gaat altijd over de komende PREP_LOOKAHEAD_
             DAGEN vanaf de echte huidige dag). Alleen status "gesignaleerd":
             eenmaal gedempt/uitgesteld/taak-aangemaakt verdwijnt de kaart —
             het resultaat (indien een taak) blijft gewoon zichtbaar in de
             normale taken-/ongepland-lijst hieronder. */}
          {vandaagWeergave.isVandaag && voorbereidingSignalen.filter((s) => s.status === "gesignaleerd").length > 0 && (
            <>
              <p className="ml-sales-widget__meta" style={{ fontWeight: 600 }}>
                Voorbereiding nodig ({voorbereidingSignalen.filter((s) => s.status === "gesignaleerd").length})
              </p>
              {voorbereidingSignalen
                .filter((s) => s.status === "gesignaleerd")
                .map((signaal) => (
                  <VoorbereidingsKaart
                    key={signaal.event.id}
                    signaal={signaal}
                    vandaag={vandaagIso()}
                    onGewijzigd={() => {
                      laadVoorbereidingSignalen();
                      laadData();
                    }}
                  />
                ))}
            </>
          )}

          {/* Mijn Werk Fase 3 (2026-08-17) — mail die aandacht vraagt.
             Zelfde "uitsluitend op vandaag zelf"-regel als voorbereiding
             hierboven: een mailsignaal gaat over de laatste MAIL_LOOKBACK_
             DAGEN, niet over gekozenDatum, dus tonen op een andere bekeken
             dag zou verwarrend zijn. Alleen status "gesignaleerd" — eenmaal
             gedempt/beantwoord/taak-aangemaakt verdwijnt de kaart. */}
          {vandaagWeergave.isVandaag && mailSignalen.length > 0 && (
            <>
              <p className="ml-sales-widget__meta" style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Mail size={14} aria-hidden="true" style={{ color: NAV_COLOR_STYLES.green.fg }} />
                Mail die aandacht vraagt ({mailSignalen.length})
              </p>
              {mailSignalen.map((signaal) => (
                <MailKaart
                  key={signaal.gmailMessageId}
                  signaal={signaal}
                  vandaag={vandaagIso()}
                  onGewijzigd={() => {
                    laadMailSignalen();
                    laadData();
                  }}
                />
              ))}
            </>
          )}

          {vandaagWeergave.achterstallig.length > 0 && (
            <>
              <p className="ml-sales-widget__meta" style={{ fontWeight: 600 }}>
                Achterstallig ({vandaagWeergave.achterstallig.length})
              </p>
              {vandaagWeergave.achterstallig.map((item) =>
                item.bron === "taak" ? (
                  <TaakKaart taak={item} onGewijzigd={laadData} key={`taak-${item.id}`} />
                ) : (
                  <ActieKaart actie={item} key={`sales-${item.id}`} />
                )
              )}
            </>
          )}

          {vandaagWeergave.opGekozenDatum.length === 0 ? (
            <div className="ml-sales__leeg">
              {vandaagWeergave.isVandaag ? "Niets gepland voor vandaag." : `Niets gepland op ${formatKorteDatum(gekozenDatum)}.`}
            </div>
          ) : (
            vandaagWeergave.opGekozenDatum.map((item) => (
              <AgendaKaart
                item={item}
                onGewijzigd={laadData}
                key={
                  item.bron === "taak"
                    ? `taak-${item.id}`
                    : item.bron === "sales"
                      ? `sales-${item.id}`
                      : item.bron === "agenda"
                        ? `agenda-${item.id}`
                        : `monday-${item.schoolId}`
                }
              />
            ))
          )}

          {/* Mijn Werk V1 — ongeplande taken (amendement 1: een volwaardige,
             verwachte uitkomst, geen tussenstap), onafhankelijk van de
             gekozen datum. Zelfde rustige subsectie-stijl als "Gepland in
             Monday" in de To-do-tab hieronder — bestaande CSS-klasse. */}
          {vandaagWeergave.ongepland.length > 0 && (
            <div className="ml-sales-widget__gepland-monday">
              <p className="ml-sales-widget__meta" style={{ fontWeight: 600 }}>
                Ongepland ({vandaagWeergave.ongepland.length})
              </p>
              {vandaagWeergave.ongepland.map((taak) => (
                <TaakKaart taak={taak} onGewijzigd={laadData} key={`taak-${taak.id}`} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "todo" && (
        <div className="ml-sales-widget__lijst">
          {todoAantal === 0 ? (
            <div className="ml-sales__leeg">Niets dat een beslissing vraagt.</div>
          ) : (
            <>
              {todo?.proposals.map((voorstel) => {
                const school = voorstel.school;
                return (
                  <div className={`ml-sales-widget__item ${voorstelAccentKlasse(voorstel.proposalType, voorstel.status)}`} key={voorstel.id}>
                    <div className="ml-sales-widget__item-header">
                      <Link href={`/admin/sales/school?id=${school.id}`} className="ml-sales-widget__schoolnaam" prefetch={false}>
                        {school.schoolName}
                      </Link>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <PlanningStatusBadge status="voorstel_te_beoordelen" />
                        <RelatiestatusBadge relatiestatus={school.relatiestatus} />
                      </div>
                    </div>
                    <p className="ml-sales-widget__meta">
                      {[school.plaats, voorstel.confidence ? `vertrouwen: ${voorstel.confidence}` : null].filter(Boolean).join(" · ")}
                      {voorstel.status === "conflict" && (
                        <span className="ml-sales__badge ml-sales__badge--conflict" style={{ marginLeft: 6 }}>
                          ⚠ Conflict — Monday is gewijzigd
                        </span>
                      )}
                    </p>
                    <p className="ml-sales-widget__context">{voorstel.proposalText}</p>
                    {voorstel.reason && <p className="ml-sales-widget__meta">AI: {voorstel.reason}</p>}
                    <SalesProposalActies voorstel={voorstel} onGewijzigd={laadData} />
                  </div>
                );
              })}
              {todo?.zonderVervolgactie.map((school) => (
                <div className="ml-sales-widget__item ml-sales-widget__item--veiligheidsnet" key={`veiligheidsnet-${school.id}`}>
                  <div className="ml-sales-widget__item-header">
                    <Link href={`/admin/sales/school?id=${school.id}`} className="ml-sales-widget__schoolnaam" prefetch={false}>
                      {school.schoolName}
                    </Link>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <PlanningStatusBadge status="actie_nodig" />
                      <RelatiestatusBadge relatiestatus={school.relatiestatus} />
                    </div>
                  </div>
                  <p className="ml-sales-widget__meta">
                    Mogelijk afgesloten/inactief — geen open actie of voorstel
                    {school.lastMondayActivityAt ? ` · laatste contact: ${formatKorteDatum(school.lastMondayActivityAt)}` : " · nog nooit contact"}
                  </p>
                  <div className="ml-sales__actie-knoppen">
                    <Link href={`/admin/sales/school?id=${school.id}`} className="ml-sales__knop" prefetch={false}>
                      Bekijk
                    </Link>
                    <PlanActieKnop schoolId={school.id} onGepland={laadData} />
                  </div>
                </div>
              ))}
            </>
          )}
          {(todo?.geplandInMonday.length ?? 0) > 0 && (
            <div className="ml-sales-widget__gepland-monday">
              <p className="ml-sales-widget__meta" style={{ fontWeight: 600 }}>
                Gepland in Monday ({todo!.geplandInMonday.length}) — geen actie nodig
              </p>
              {todo!.geplandInMonday.map((school) => (
                <div className="ml-sales-widget__item ml-sales-widget__item--rustig" key={`gepland-${school.id}`}>
                  <div className="ml-sales-widget__item-header">
                    <Link href={`/admin/sales/school?id=${school.id}`} className="ml-sales-widget__schoolnaam" prefetch={false}>
                      {school.schoolName}
                    </Link>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <PlanningStatusBadge status="gepland" datum={school.mondayVolgendeActieDatum} />
                      <RelatiestatusBadge relatiestatus={school.relatiestatus} />
                    </div>
                  </div>
                  <p className="ml-sales-widget__meta">Volgende actie in Monday: {formatKorteDatum(school.mondayVolgendeActieDatum)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mijn Werk V1 (2026-08-17) — "Wachten op": school is aan zet, uitsluitend
         afgeleid uit bestaande Sales-data (lib/werk/wachten-op.ts), geen
         nieuwe opslag. Rustige weergave (--rustig, zelfde als "Gepland in
         Monday") — geen beslissing nodig, alleen ter info. */}
      {tab === "wachtenop" && (
        <div className="ml-sales-widget__lijst">
          {wachtenOp.length === 0 ? (
            <div className="ml-sales__leeg">Je wacht nergens op.</div>
          ) : (
            wachtenOp.map((item) => (
              <div className="ml-sales-widget__item ml-sales-widget__item--rustig" key={item.actionId}>
                <div className="ml-sales-widget__item-header">
                  <Link href={`/admin/sales/school?id=${item.schoolId}`} className="ml-sales-widget__schoolnaam" prefetch={false}>
                    {item.schoolName}
                  </Link>
                  <RelatiestatusBadge relatiestatus={item.relatiestatus} />
                </div>
                <p className="ml-sales-widget__meta" style={{ fontWeight: 600 }}>
                  Wachten op
                </p>
                <p className="ml-sales-widget__context">{item.waaropWachten}</p>
                <p className="ml-sales-widget__meta">
                  {item.sindsWanneer ? `Sinds ${formatKorteDatum(item.sindsWanneer)}` : "Sinds onbekend"} · Opvolgen op {formatKorteDatum(item.vervolgdatum)}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "vraag" && (
        <div className="ml-sales-widget__vraag">
          <div className="ml-sales-widget__schoolselector-rij">
            <span className="ml-sales-widget__schoolselector-label">
              <Sparkles size={13} aria-hidden="true" />
              Vraag over
            </span>
            <select
              className="ml-sales-widget__schoolselector"
              value={schoolKeuze}
              onChange={(e) => setSchoolKeuze(e.target.value)}
              aria-label="Kies scope voor de vraag"
            >
              <option value="mijnwerk">Mijn Werk (agenda, taken, sales)</option>
              <option value="alle">Alle scholen</option>
              {scholenVoorSelector.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.schoolName}
                </option>
              ))}
            </select>
          </div>

          {vraagBerichten.length > 0 && (
            <div className="ml-sales__chat-berichten">
              {vraagBerichten.map((bericht, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div className="ml-sales__chat-bericht ml-sales__chat-bericht--vraag">{bericht.vraag}</div>
                  <div className="ml-sales__chat-bericht ml-sales__chat-bericht--antwoord">{bericht.antwoord}</div>
                </div>
              ))}
            </div>
          )}
          {vraagFout && <p className="ml-sales-widget__meta">{vraagFout}</p>}

          <div className="ml-sales__chat-input-rij">
            <textarea
              value={vraagInvoer}
              onChange={(e) => setVraagInvoer(e.target.value)}
              placeholder={
                schoolKeuze === "mijnwerk"
                  ? "Bijv. wat heb ik morgen? Waar moet ik me deze week op voorbereiden?"
                  : schoolKeuze === "alle"
                    ? "Bijv. welke scholen hebben geen vervolgactie?"
                    : "Bijv. wat is de belangrijkste behoefte van deze school?"
              }
            />
            <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={vraagBezig || !vraagInvoer.trim()} onClick={stelVraag}>
              {vraagBezig ? "Bezig…" : "Vraag"}
            </button>
          </div>
        </div>
      )}

      <div className="ml-sales-widget__stats">
        <div className="ml-sales-widget__stat">
          <span className="ml-sales-widget__stat-icoon" style={{ "--item-fg": NAV_COLOR_STYLES.teal.fg, "--item-bg": NAV_COLOR_STYLES.teal.bg } as CSSProperties}>
            <School size={16} aria-hidden="true" />
          </span>
          <span className="ml-sales-widget__stat-tekst">
            <span className="ml-sales-widget__stat-getal">{scholenAantal}</span>
            <span className="ml-sales-widget__stat-label">Scholen</span>
          </span>
        </div>
        <div className="ml-sales-widget__stat">
          <span className="ml-sales-widget__stat-icoon" style={{ "--item-fg": NAV_COLOR_STYLES.purple.fg, "--item-bg": NAV_COLOR_STYLES.purple.bg } as CSSProperties}>
            <UserPlus size={16} aria-hidden="true" />
          </span>
          <span className="ml-sales-widget__stat-tekst">
            <span className="ml-sales-widget__stat-getal">{prospectsAantal}</span>
            <span className="ml-sales-widget__stat-label">Prospects</span>
          </span>
        </div>
        <div className="ml-sales-widget__stat">
          <span className="ml-sales-widget__stat-icoon" style={{ "--item-fg": NAV_COLOR_STYLES.orange.fg, "--item-bg": NAV_COLOR_STYLES.orange.bg } as CSSProperties}>
            <ListTodo size={16} aria-hidden="true" />
          </span>
          <span className="ml-sales-widget__stat-tekst">
            <span className="ml-sales-widget__stat-getal">{actiesDezeWeekAantal}</span>
            <span className="ml-sales-widget__stat-label">Acties deze week</span>
          </span>
        </div>
        <div className="ml-sales-widget__stat">
          <span className="ml-sales-widget__stat-icoon" style={{ "--item-fg": NAV_COLOR_STYLES.red.fg, "--item-bg": NAV_COLOR_STYLES.red.bg } as CSSProperties}>
            <AlertCircle size={16} aria-hidden="true" />
          </span>
          <span className="ml-sales-widget__stat-tekst">
            <span className="ml-sales-widget__stat-getal">{todoAantal}</span>
            <span className="ml-sales-widget__stat-label">Aandacht nodig</span>
          </span>
        </div>
      </div>

      {tipTekst && (
        <div className="ml-sales-widget__tip">
          <p className="ml-sales-widget__tip-tekst">
            <Sparkles size={14} aria-hidden="true" style={{ color: "var(--ml-admin-accent)", flexShrink: 0 }} />
            <span>
              <strong>AI-tip van vandaag:</strong> {tipTekst}
            </span>
          </p>
          <button type="button" className="ml-sales-widget__tip-knop" onClick={() => kiesTab("vraag")}>
            Stel een vraag →
          </button>
        </div>
      )}

      <Link href="/admin/sales" className="ml-sales-widget__alles-link" prefetch={false} style={{ display: "block", marginTop: 14 }}>
        Bekijk alle Sales →
      </Link>
    </section>
  );
}
