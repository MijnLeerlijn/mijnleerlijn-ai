"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePreferences } from "@payloadcms/ui";
import { Calendar, ClipboardList, Sparkles, School, UserPlus, ListTodo, AlertCircle } from "lucide-react";
import { RelatiestatusBadge } from "./RelatiestatusBadge";
import { PlanningStatusBadge } from "./PlanningStatusBadge";
import { PlanActieKnop } from "./PlanActieKnop";
import { SalesProposalActies } from "./SalesProposalActies";
import { formatKorteDatum, lokaleDatumIso, vandaagIso, voegDagenToe } from "@/lib/sales/format-datum";
import { NAV_COLOR_STYLES } from "@/lib/admin-nav/nav-colors";
import type { TodoResultaat } from "@/lib/sales/dashboard-todo";
import type { LaatsteSyncStatus } from "@/lib/sales/sync";
import { bepaalVandaagWeergave, VANDAAG_SNELKEUZES } from "@/lib/sales/vandaag";
import { bepaalPlanningStatus } from "@/lib/sales/planning-status";

// Sales UX-ronde 3 (2026-08-14) — vervangt SalesWidgetVandaag.tsx (het oude
// server-gerenderde "Sales vandaag"-widget, gebaseerd op
// lib/sales/widget-prioritering.ts se 4-tier-systeem). Client component
// (i.p.v. server component): de "Vraag"-tab heeft client-side interactiviteit
// nodig (schoolselector, chatgesprek, tab-onthouden via Payload Preferences)
// die een server component niet kan bieden. Hergebruikt bewust dezelfde
// kaart-/knop-/chat-CSS-klassen en apiGet/apiPost-patronen als
// SalesVandaagView.tsx/SalesScholenView.tsx — geen nieuw visueel systeem.
//
// Drie tabs, strikt gescheiden datasets (expliciete opdrachtseis):
// - "Vandaag": UITSLUITEND open sales-acties, datumgestuurd (productiecorrectie
//   2026-08-16, punt 2) — de gebruiker kiest via ←/Vandaag/Morgen/Overmorgen/
//   Kies datum/→ welke dag getoond wordt (lib/sales/vandaag.ts se
//   bepaalVandaagWeergave); achterstallige acties verschijnen uitsluitend als
//   aparte subgroep wanneer de gekozen datum vandaag zelf is, nooit vermengd
//   met een andere datum. Geen AI-voorstellen, geen "scholen zonder actie" —
//   letterlijk "wat moet ik op die dag doen".
// - "To do": sales-proposals (pending/conflict) + het "mogelijk afgesloten/
//   inactief"-signaal — via lib/sales/dashboard-todo.ts, dat op zijn beurt
//   uitsluitend bestaande statusvelden/functies hergebruikt (geen nieuw
//   takenmodel).
// - "Vraag": schoolselector (Alle scholen / een specifieke school) boven een
//   simpel chatgesprek — "Alle scholen" praat met app/api/sales/chat
//   (lib/sales/aggregate-chat.ts, gestructureerde lokale selectie, nooit
//   volledige logboeken), een specifieke school praat met de AL BESTAANDE
//   app/api/sales/school/[id]/chat (ongewijzigd, eigen isolatie).
type Tab = "vandaag" | "todo" | "vraag";
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

interface SchoolOptie {
  id: number;
  schoolName: string;
  relatiestatus?: string | null;
}

function schoolRef(school: SchoolRef | number): SchoolRef {
  return typeof school === "number" ? { id: school, schoolName: `School #${school}` } : school;
}

// Visuele polish (2026-08-14) — urgentie is puur een afgeleide weergave van
// het al aanwezige dueDate, geen nieuw veld/model.
function urgentieVanActie(actie: SalesActionDoc): "achterstallig" | "vandaag" | null {
  const datum = actie.dueDate.slice(0, 10);
  const vandaag = vandaagIso();
  if (datum < vandaag) return "achterstallig";
  if (datum === vandaag) return "vandaag";
  return null;
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

// Productiecorrectie 2026-08-16 (punt 2) — geëxtraheerd uit de "vandaag"-tab
// JSX zodat zowel de achterstallig-subgroep als de lijst-op-de-gekozen-datum
// hetzelfde kaartje renderen, zonder duplicatie.
function ActieKaart({ actie }: { actie: SalesActionDoc }) {
  const school = schoolRef(actie.school);
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
        <Link href={`/admin/sales/school?id=${school.id}`} className="ml-sales-widget__schoolnaam" prefetch={false}>
          {school.schoolName}
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <PlanningStatusBadge status={planningStatus.status} datum={planningStatus.datum} />
          <RelatiestatusBadge relatiestatus={school.relatiestatus} />
        </div>
      </div>
      <p className="ml-sales-widget__meta">
        {actie.type} · {formatKorteDatum(actie.dueDate)}
      </p>
      <p className="ml-sales-widget__context">{actie.description}</p>
      <div className="ml-sales__actie-knoppen">
        <Link href={`/admin/sales/school?id=${school.id}`} className="ml-sales__knop" prefetch={false}>
          Bekijk
        </Link>
        <Link href={`/admin/creator?mail=nieuw&school=${school.id}`} className="ml-sales__knop" prefetch={false}>
          Schrijf mail
        </Link>
      </div>
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
    const [openActies, todoData, scholenLijst, syncStatusData] = await Promise.all([
      apiGet<SalesActionDoc>(`/api/sales-actions?where[status][equals]=open&depth=1&sort=dueDate&limit=200`),
      fetch("/api/sales/dashboard/todo", { credentials: "include" })
        .then((r) => (r.ok ? (r.json() as Promise<TodoResultaat>) : null))
        .catch(() => null),
      apiGet<SchoolOptie>(`/api/sales-schools?depth=0&sort=schoolName&limit=1000`),
      fetch("/api/sales/sync/status", { credentials: "include" })
        .then((r) => (r.ok ? (r.json() as Promise<LaatsteSyncStatus>) : null))
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
    setLaden(false);
  }, []);

  useEffect(() => {
    laadData();
  }, [laadData]);

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

  // Productiecorrectie 2026-08-16 (punt 2) — vandaagWeergave stuurt de
  // tab-INHOUD (reageert op gekozenDatum); het tabbadge zelf blijft altijd
  // "wat moet er vandaag/achterstallig gebeuren" tonen, ongeacht welke datum
  // net binnen de tab bekeken wordt (anders zou het badge van betekenis
  // veranderen zodra iemand op "Morgen" klikt, terwijl een ANDERE tab actief is).
  const vandaagWeergave = bepaalVandaagWeergave(alleOpenActies, gekozenDatum);
  const badgeWeergave = bepaalVandaagWeergave(alleOpenActies, vandaagIso());
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
              {vandaagWeergave.achterstallig.map((actie) => (
                <ActieKaart actie={actie} key={actie.id} />
              ))}
            </>
          )}

          {vandaagWeergave.opGekozenDatum.length === 0 ? (
            <div className="ml-sales__leeg">
              {vandaagWeergave.isVandaag ? "Niets openstaand voor vandaag." : `Niets openstaand op ${formatKorteDatum(gekozenDatum)}.`}
            </div>
          ) : (
            vandaagWeergave.opGekozenDatum.map((actie) => <ActieKaart actie={actie} key={actie.id} />)
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
