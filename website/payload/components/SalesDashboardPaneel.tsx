"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePreferences } from "@payloadcms/ui";
import { Calendar, ClipboardList, Sparkles, School, UserPlus, ListTodo, AlertCircle, Clock, Plus } from "lucide-react";
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
import { bepaalWerkAgenda, type TaakInvoer, type WerkItem, type WerkTaakItem } from "@/lib/werk/agenda";
import { parseQuickAdd, type QuickAddSchoolOptie, type QuickAddVoorstel } from "@/lib/werk/quick-add-parser";
import type { WachtenOpItem } from "@/lib/werk/wachten-op";

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
// - "Vraag": schoolselector (Alle scholen / een specifieke school) boven een
//   simpel chatgesprek — "Alle scholen" praat met app/api/sales/chat
//   (lib/sales/aggregate-chat.ts, gestructureerde lokale selectie, nooit
//   volledige logboeken), een specifieke school praat met de AL BESTAANDE
//   app/api/sales/school/[id]/chat (ongewijzigd, eigen isolatie).
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

function AgendaKaart({ item, onGewijzigd }: { item: WerkItem; onGewijzigd: () => void }) {
  if (item.bron === "monday") return <MondayPlanningKaart item={item} />;
  if (item.bron === "taak") return <TaakKaart taak={item} onGewijzigd={onGewijzigd} />;
  return <ActieKaart actie={item} />;
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
    laadData();
  }, [laadData]);

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
    const url = schoolKeuze === "alle" ? "/api/sales/chat" : `/api/sales/school/${schoolKeuze}/chat`;
    const { ok, data } = await apiPost<{ antwoord: string }>(url, { vraag });
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
  const vandaagWeergave = bepaalWerkAgenda(takenVoorAgenda, actiesVoorAgenda, scholenVoorAgenda, gekozenDatum);
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
                key={item.bron === "taak" ? `taak-${item.id}` : item.bron === "sales" ? `sales-${item.id}` : `monday-${item.schoolId}`}
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
              placeholder={schoolKeuze === "alle" ? "Bijv. welke scholen hebben geen vervolgactie?" : "Bijv. wat is de belangrijkste behoefte van deze school?"}
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
