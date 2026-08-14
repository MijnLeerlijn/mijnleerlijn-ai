"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePreferences } from "@payloadcms/ui";
import { RelatiestatusBadge } from "./RelatiestatusBadge";
import { PlanActieKnop } from "./PlanActieKnop";
import { formatKorteDatum } from "@/lib/sales/format-datum";
import type { TodoResultaat } from "@/lib/sales/dashboard-todo";

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
// - "Vandaag": UITSLUITEND open sales-acties met dueDate <= vandaag. Geen
//   AI-voorstellen, geen "scholen zonder actie" — letterlijk "wat moet ik
//   vandaag doen".
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
}

function schoolRef(school: SchoolRef | number): SchoolRef {
  return typeof school === "number" ? { id: school, schoolName: `School #${school}` } : school;
}

function vandaagIso(): string {
  return new Date().toISOString().slice(0, 10);
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

  const [vandaagActies, setVandaagActies] = useState<SalesActionDoc[]>([]);
  const [todo, setTodo] = useState<TodoResultaat | null>(null);
  const [scholenVoorSelector, setScholenVoorSelector] = useState<SchoolOptie[]>([]);
  const [laden, setLaden] = useState(true);
  const [bezig, setBezig] = useState<string | null>(null);

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
    const vandaag = vandaagIso();
    const [openActies, todoData, scholenLijst] = await Promise.all([
      apiGet<SalesActionDoc>(`/api/sales-actions?where[status][equals]=open&depth=1&sort=dueDate&limit=200`),
      fetch("/api/sales/dashboard/todo", { credentials: "include" })
        .then((r) => (r.ok ? (r.json() as Promise<TodoResultaat>) : null))
        .catch(() => null),
      apiGet<SchoolOptie>(`/api/sales-schools?depth=0&sort=schoolName&limit=1000`),
    ]);
    setVandaagActies(openActies.filter((a) => a.dueDate.slice(0, 10) <= vandaag));
    setTodo(todoData);
    setScholenVoorSelector(scholenLijst);
    setLaden(false);
  }, []);

  useEffect(() => {
    laadData();
  }, [laadData]);

  async function beslis(proposalId: number, beslissing: "accepted" | "rejected") {
    setBezig(`voorstel-${proposalId}`);
    await apiPost(`/api/sales/proposals/${proposalId}/decide`, { beslissing });
    setBezig(null);
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

  const todoAantal = todo ? todo.proposals.length + todo.mogelijkAfgeslotenScholen.length : 0;

  if (laden || !tabGeladen) {
    return (
      <section className="ml-sales-widget">
        <div className="ml-sales__leeg">Laden…</div>
      </section>
    );
  }

  return (
    <section className="ml-sales-widget">
      <div className="ml-sales-widget__tabs">
        <button type="button" className={`ml-sales-widget__tab${tab === "vandaag" ? " ml-sales-widget__tab--actief" : ""}`} onClick={() => kiesTab("vandaag")}>
          Vandaag{vandaagActies.length > 0 ? ` (${vandaagActies.length})` : ""}
        </button>
        <button type="button" className={`ml-sales-widget__tab${tab === "todo" ? " ml-sales-widget__tab--actief" : ""}`} onClick={() => kiesTab("todo")}>
          To do{todoAantal > 0 ? ` (${todoAantal})` : ""}
        </button>
        <button type="button" className={`ml-sales-widget__tab${tab === "vraag" ? " ml-sales-widget__tab--actief" : ""}`} onClick={() => kiesTab("vraag")}>
          Vraag
        </button>
      </div>

      {tab === "vandaag" && (
        <div className="ml-sales-widget__lijst">
          {vandaagActies.length === 0 ? (
            <div className="ml-sales__leeg">Niets openstaand voor vandaag.</div>
          ) : (
            vandaagActies.map((actie) => {
              const school = schoolRef(actie.school);
              return (
                <div className="ml-sales-widget__item" key={actie.id}>
                  <div className="ml-sales-widget__item-header">
                    <Link href={`/admin/sales/school?id=${school.id}`} className="ml-sales-widget__schoolnaam" prefetch={false}>
                      {school.schoolName}
                    </Link>
                    <RelatiestatusBadge relatiestatus={school.relatiestatus} />
                  </div>
                  <p className="ml-sales-widget__meta">
                    {actie.type} · {formatKorteDatum(actie.dueDate)}
                    {actie.dueDate.slice(0, 10) < vandaagIso() ? " (achterstallig)" : ""}
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
            })
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
                  <div className="ml-sales-widget__item" key={voorstel.id}>
                    <div className="ml-sales-widget__item-header">
                      <Link href={`/admin/sales/school?id=${school.id}`} className="ml-sales-widget__schoolnaam" prefetch={false}>
                        {school.schoolName}
                      </Link>
                      <RelatiestatusBadge relatiestatus={school.relatiestatus} />
                    </div>
                    <p className="ml-sales-widget__meta">
                      {[school.plaats, voorstel.confidence ? `vertrouwen: ${voorstel.confidence}` : null].filter(Boolean).join(" · ")}
                      {voorstel.status === "conflict" && <span className="ml-sales__badge" style={{ marginLeft: 6 }}>⚠ Conflict — Monday is gewijzigd</span>}
                    </p>
                    <p className="ml-sales-widget__context">{voorstel.proposalText}</p>
                    {voorstel.reason && <p className="ml-sales-widget__meta">AI: {voorstel.reason}</p>}
                    <div className="ml-sales__actie-knoppen">
                      <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={bezig !== null} onClick={() => beslis(voorstel.id, "accepted")}>
                        {voorstel.proposalType === "bestaande_vervolgdatum" ? "Maak Sales-actie" : voorstel.proposalType === "veld_correctie" ? "Bevestigen" : "Accepteren"}
                      </button>
                      <Link href={`/admin/sales/school?id=${school.id}#voorstel-${voorstel.id}`} className="ml-sales__knop" prefetch={false}>
                        Aanpassen
                      </Link>
                      <button type="button" className="ml-sales__knop" disabled={bezig !== null} onClick={() => beslis(voorstel.id, "rejected")}>
                        {voorstel.proposalType === "veld_correctie" ? "Negeren" : "Niet nodig"}
                      </button>
                    </div>
                  </div>
                );
              })}
              {todo?.mogelijkAfgeslotenScholen.map((school) => (
                <div className="ml-sales-widget__item" key={`veiligheidsnet-${school.id}`}>
                  <div className="ml-sales-widget__item-header">
                    <Link href={`/admin/sales/school?id=${school.id}`} className="ml-sales-widget__schoolnaam" prefetch={false}>
                      {school.schoolName}
                    </Link>
                    <RelatiestatusBadge relatiestatus={school.relatiestatus} />
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
        </div>
      )}

      {tab === "vraag" && (
        <div className="ml-sales-widget__vraag">
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

      <Link href="/admin/sales" className="ml-sales-widget__alles-link" prefetch={false} style={{ display: "block", marginTop: 14 }}>
        Bekijk alle Sales →
      </Link>
    </section>
  );
}
