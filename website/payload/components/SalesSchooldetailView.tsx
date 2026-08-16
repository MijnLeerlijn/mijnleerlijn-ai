"use client";

import type { CSSProperties } from "react";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Compass, Sparkles } from "lucide-react";
import { RelatiestatusBadge } from "./RelatiestatusBadge";
import { SalesProposalActies } from "./SalesProposalActies";
import { SalesOnderwijstypeInstellen } from "./SalesOnderwijstypeInstellen";
import { formatKorteDatum, formatKorteDatumTijd, typeLabel } from "@/lib/sales/format-datum";
import { LOGBOEK_SAMENVATTING_MAX_LENGTE } from "@/lib/sales/monday-columns";
import { NAV_COLOR_STYLES } from "@/lib/admin-nav/nav-colors";

// Sales-assistent V1 (2026-08-14) — schooldetail: het centrale Sales-object.
// Query-param-gebaseerd (?id=<schoolId>), zelfde patroon als CreatorView.tsx
// (?mail=<id>/?template=<id>) i.p.v. een dynamisch routesegment.
interface VariantRef {
  id: number;
  name: string;
}
interface SalesSchoolDoc {
  id: number;
  schoolName: string;
  plaats?: string | null;
  contactpersoonNaam?: string | null;
  relatiestatus?: string | null;
  salesfase?: string | null;
  onderwijstype?: VariantRef | number | null;
  mondayItemId: string;
  mondayBoardId: string;
  lastMondayActivityAt?: string | null;
  mondayVolgendeActieDatum?: string | null;
  cachedSummary?: string | null;
  cachedSummaryGeneratedAt?: string | null;
}
interface SalesActionDoc {
  id: number;
  description: string;
  dueDate: string;
  type: string;
  status: "open" | "afgerond" | "vervallen";
  channel?: string | null;
}
interface SalesProposalDoc {
  id: number;
  proposalText: string;
  reason?: string | null;
  proposalType: "volgende_actie" | "veld_correctie" | "bestaande_vervolgdatum";
  confidence?: "hoog" | "middel" | "laag" | null;
  proposedDate?: string | null;
  proposedType?: string | null;
  proposedChannel?: string | null;
  proposedValue?: string | null;
}
interface SalesLogEventDoc {
  id: number;
  occurredAt: string;
  type: string;
  source: string;
  summary: string;
  sourceExternalId?: string | null;
  payload?: { gemigreerd?: boolean; datumOnzeker?: boolean; tekstlengte?: number; auteur?: string | null } | null;
}

/** Sales UX-ronde 3 — resultaat van een on-demand volledige-tekst-fetch, uitsluitend in React-state, nooit lokaal opgeslagen. */
interface VolledigeTekst {
  tekst: string;
  auteur: string | null;
}

async function apiGet<T>(url: string): Promise<T[]> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return [];
  const data = (await res.json()) as { docs?: T[] };
  return data.docs ?? [];
}
async function apiGetOne<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return null;
  return (await res.json()) as T;
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

function SchooldetailInner() {
  const searchParams = useSearchParams();
  const schoolId = searchParams.get("id");

  const [school, setSchool] = useState<SalesSchoolDoc | null>(null);
  const [openActie, setOpenActie] = useState<SalesActionDoc | null>(null);
  const [voorstellen, setVoorstellen] = useState<SalesProposalDoc[]>([]);
  const [logboek, setLogboek] = useState<SalesLogEventDoc[]>([]);
  const [laden, setLaden] = useState(true);
  const [bezig, setBezig] = useState<string | null>(null);

  const [samenvatting, setSamenvatting] = useState<string | null>(null);
  const [samenvattingBijgewerkt, setSamenvattingBijgewerkt] = useState<string | null>(null);
  const [samenvattingVernieuwenBezig, setSamenvattingVernieuwenBezig] = useState(false);
  const [chatVraag, setChatVraag] = useState("");
  const [chatBerichten, setChatBerichten] = useState<{ vraag: string; antwoord: string }[]>([]);
  const [chatBezig, setChatBezig] = useState(false);

  // Sales UX-ronde 3 (2026-08-14) — "Lees volledig" op het logboek.
  // volledigeTeksten is puur in-memory React-state (nooit lokaal opgeslagen,
  // verdwijnt bij het verlaten van de pagina) — zie app/api/sales/school/
  // [id]/log-events/full-text/route.ts voor de on-demand-fetch zelf.
  const [uitgeklapt, setUitgeklapt] = useState<Set<number>>(new Set());
  const [volledigeTeksten, setVolledigeTeksten] = useState<Map<number, VolledigeTekst>>(new Map());
  const [uitklapBezig, setUitklapBezig] = useState<Set<number>>(new Set());

  const laad = useCallback(async () => {
    if (!schoolId) return;
    setLaden(true);
    const [schoolDoc, acties, proposals, logEvents] = await Promise.all([
      apiGetOne<SalesSchoolDoc>(`/api/sales-schools/${schoolId}?depth=1`),
      apiGet<SalesActionDoc>(`/api/sales-actions?where[school][equals]=${schoolId}&where[status][equals]=open&limit=1&sort=dueDate`),
      apiGet<SalesProposalDoc>(`/api/sales-proposals?where[school][equals]=${schoolId}&where[status][equals]=pending&sort=-createdAt&limit=20`),
      apiGet<SalesLogEventDoc>(`/api/sales-log-events?where[school][equals]=${schoolId}&sort=-occurredAt&limit=50`),
    ]);
    setSchool(schoolDoc);
    setSamenvatting(schoolDoc?.cachedSummary ?? null);
    setSamenvattingBijgewerkt(schoolDoc?.cachedSummaryGeneratedAt ?? null);
    setOpenActie(acties[0] ?? null);
    setVoorstellen(proposals);
    setLogboek(logEvents);
    setLaden(false);
  }, [schoolId]);

  useEffect(() => {
    laad();
  }, [laad]);

  async function genereerVerrijking() {
    if (!schoolId) return;
    setBezig("enrich");
    await apiPost(`/api/sales/school/${schoolId}/enrich`);
    setBezig(null);
    laad();
  }

  async function stelVraag(vraag: string) {
    if (!schoolId || !vraag.trim()) return;
    setChatBezig(true);
    const { ok, data } = await apiPost<{ antwoord: string }>(`/api/sales/school/${schoolId}/chat`, { vraag });
    if (ok && data) {
      setChatBerichten((prev) => [...prev, { vraag, antwoord: data.antwoord }]);
    }
    setChatBezig(false);
  }

  // Sales UX V2 (2026-08-14) — de samenvatting komt voortaan uit de cache
  // (sales-schools.cachedSummary, automatisch bijgewerkt door lib/sales/
  // sync.ts na nieuwe, betrouwbare Monday-activiteit — zie laad()
  // hierboven). Deze knop is uitsluitend de expliciete, handmatige
  // uitzondering daarop.
  async function vernieuwSamenvatting() {
    if (!schoolId) return;
    setSamenvattingVernieuwenBezig(true);
    const { ok, data } = await apiPost<{ samenvatting: string; gegenereerdOp: string }>(`/api/sales/school/${schoolId}/summary`);
    if (ok && data) {
      setSamenvatting(data.samenvatting);
      setSamenvattingBijgewerkt(data.gegenereerdOp);
    }
    setSamenvattingVernieuwenBezig(false);
  }

  function isUitklapbaar(event: SalesLogEventDoc): boolean {
    return event.source === "monday" && Boolean(event.sourceExternalId) && (event.payload?.tekstlengte ?? 0) > LOGBOEK_SAMENVATTING_MAX_LENGTE;
  }

  async function haalVolledigeTekstenOp(ids: number[]): Promise<void> {
    if (!schoolId || ids.length === 0) return;
    setUitklapBezig((s) => new Set([...s, ...ids]));
    const { ok, data } = await apiPost<{ resultaten: { logEventId: number; tekst: string; auteur: string | null }[] }>(
      `/api/sales/school/${schoolId}/log-events/full-text`,
      { logEventIds: ids }
    );
    if (ok && data?.resultaten) {
      setVolledigeTeksten((m) => {
        const nieuw = new Map(m);
        for (const r of data.resultaten) nieuw.set(r.logEventId, { tekst: r.tekst, auteur: r.auteur });
        return nieuw;
      });
    }
    setUitklapBezig((s) => {
      const nieuw = new Set(s);
      for (const id of ids) nieuw.delete(id);
      return nieuw;
    });
  }

  async function toggleLogboekItem(event: SalesLogEventDoc) {
    if (uitgeklapt.has(event.id)) {
      setUitgeklapt((s) => {
        const nieuw = new Set(s);
        nieuw.delete(event.id);
        return nieuw;
      });
      return;
    }
    if (!volledigeTeksten.has(event.id)) {
      await haalVolledigeTekstenOp([event.id]);
    }
    setUitgeklapt((s) => new Set(s).add(event.id));
  }

  async function allesUitklappen() {
    const uitklapbaar = logboek.filter(isUitklapbaar);
    const alAllemaalOpen = uitklapbaar.length > 0 && uitklapbaar.every((e) => uitgeklapt.has(e.id));
    if (alAllemaalOpen) {
      setUitgeklapt(new Set());
      return;
    }
    const nogOpTeHalen = uitklapbaar.filter((e) => !volledigeTeksten.has(e.id)).map((e) => e.id);
    if (nogOpTeHalen.length > 0) await haalVolledigeTekstenOp(nogOpTeHalen);
    setUitgeklapt(new Set(uitklapbaar.map((e) => e.id)));
  }

  if (!schoolId) return <div className="ml-sales__leeg">Geen school geselecteerd.</div>;
  if (laden) return <div className="ml-sales__leeg">Laden…</div>;
  if (!school) return <div className="ml-sales__leeg">School niet gevonden.</div>;

  const mondayUrl = `https://mijnleerlijn.monday.com/boards/${school.mondayBoardId}/pulses/${school.mondayItemId}`;
  const onderwijstypeNaam = school.onderwijstype ? (typeof school.onderwijstype === "number" ? `#${school.onderwijstype}` : school.onderwijstype.name) : null;

  return (
    <div className="ml-sales">
      <div className="ml-sales__schooldetail-header">
        <div>
          <h1>{school.schoolName}</h1>
          <div className="ml-sales__schooldetail-meta">
            {school.plaats && <span className="ml-sales__badge">{school.plaats}</span>}
            {school.contactpersoonNaam && <span className="ml-sales__badge">Contact: {school.contactpersoonNaam}</span>}
          </div>
        </div>
        <div className="ml-sales__actie-knoppen">
          <Link href={`/admin/creator?mail=nieuw&school=${school.id}`} className="ml-sales__knop">
            Schrijf mail
          </Link>
          <a href={mondayUrl} target="_blank" rel="noreferrer" className="ml-sales__knop">
            Open in Monday
          </a>
        </div>
      </div>

      {/* Productiecorrectie 2026-08-16 (punt 9) — CRM (Monday) en Planning
       * (AI/Sales-assistent) bewust in twee apart gelabelde blokken: de oude
       * ene "Laatste contact: X · Volgende actie: Y"-regel liet niet zien of
       * "Volgende actie" van Monday of van een lokale actie kwam — precies
       * de bron-van-verwarring die deze correctieronde oplost (zie ook punt
       * 6/7). Vervangt de vorige "Volgende stap"/"Schoolcontext"-kaarten
       * (dezelfde velden, nu zonder overlap/dubbele weergave). */}
      <div className="ml-sales__schooldetail-blokken">
        <div className="ml-sales__schooldetail-blok ml-sales__schooldetail-blok--crm">
          <p className="ml-sales__schooldetail-blok-label">CRM (Monday)</p>
          <div className="ml-sales__schooldetail-meta">
            <RelatiestatusBadge relatiestatus={school.relatiestatus} />
            <span className="ml-sales__badge">{school.salesfase ?? "Salesfase onbekend"}</span>
            <span className="ml-sales__badge">{onderwijstypeNaam ?? "Onderwijstype onbekend"}</span>
          </div>
          {!school.onderwijstype && (
            <div className="ml-sales__actie-knoppen" style={{ marginTop: 10 }}>
              <button type="button" className="ml-sales__knop" onClick={genereerVerrijking} disabled={bezig !== null}>
                {bezig === "enrich" ? "Bezig…" : "Onderwijstype herkennen"}
              </button>
              <SalesOnderwijstypeInstellen schoolId={school.id} label="Zelf instellen" onGewijzigd={laad} />
            </div>
          )}
        </div>

        <div className="ml-sales__schooldetail-blok ml-sales__schooldetail-blok--planning">
          <p className="ml-sales__schooldetail-blok-label">Planning</p>
          <p className="ml-sales__kaart-tekst">Laatste echte contact: {formatKorteDatum(school.lastMondayActivityAt)}</p>
          <p className="ml-sales__kaart-tekst">
            Volgende actie in Monday: {school.mondayVolgendeActieDatum ? formatKorteDatum(school.mondayVolgendeActieDatum) : "geen"}
          </p>
          <p className="ml-sales__kaart-tekst">
            Lokale Sales-actie:{" "}
            {openActie ? `${openActie.type} op ${formatKorteDatum(openActie.dueDate)}${openActie.channel ? ` · ${openActie.channel}` : ""}` : "nog niet aangemaakt"}
          </p>
          {openActie && <p className="ml-sales__kaart-tekst">{openActie.description}</p>}
        </div>
      </div>

      <div className="ml-sales__kaarten-rij">
        <div className="ml-sales__kaart">
          <div className="ml-sales__kaart-header">
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="ml-sales__kaart-icoon" style={{ "--item-fg": NAV_COLOR_STYLES.blue.fg, "--item-bg": NAV_COLOR_STYLES.blue.bg } as CSSProperties}>
                <Compass size={15} aria-hidden="true" />
              </span>
              <strong>Waar staan we?</strong>
            </span>
          </div>
          {samenvatting ? (
            <>
              <p className="ml-sales__kaart-tekst">{samenvatting}</p>
              <p className="ml-sales__logboek-meta">
                {samenvattingBijgewerkt ? `Bijgewerkt op ${formatKorteDatum(samenvattingBijgewerkt)}` : ""}
                {" · "}
                <button type="button" className="ml-sales__knop" onClick={vernieuwSamenvatting} disabled={samenvattingVernieuwenBezig} style={{ padding: "2px 8px" }}>
                  {samenvattingVernieuwenBezig ? "Bezig…" : "Vernieuwen"}
                </button>
              </p>
            </>
          ) : (
            <button type="button" className="ml-sales__knop" onClick={vernieuwSamenvatting} disabled={samenvattingVernieuwenBezig}>
              {samenvattingVernieuwenBezig ? "Bezig…" : "Genereer samenvatting"}
            </button>
          )}
        </div>
      </div>

      {voorstellen.length > 0 && (
        <div className="ml-sales__section">
          <h2>AI-voorstellen</h2>
          <div className="ml-sales__grid">
            {voorstellen.map((voorstel) => (
              <div className="ml-sales__kaart" id={`voorstel-${voorstel.id}`} key={voorstel.id}>
                <div className="ml-sales__kaart-header">
                  <strong>{voorstel.proposalText}</strong>
                  {voorstel.confidence && (
                    <span className={`ml-sales__badge ml-sales__badge--confidence-${voorstel.confidence}`}>{voorstel.confidence}</span>
                  )}
                </div>
                {voorstel.reason && <p className="ml-sales__kaart-tekst">Waarom: {voorstel.reason}</p>}
                <SalesProposalActies voorstel={voorstel} onGewijzigd={laad} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ml-sales__section">
        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={16} aria-hidden="true" style={{ color: "var(--ml-admin-purple)" }} />
          Vraag AI over deze school
        </h2>
        <div className="ml-sales__chat">
          {chatBerichten.length > 0 && (
            <div className="ml-sales__chat-berichten">
              {chatBerichten.map((bericht, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div className="ml-sales__chat-bericht ml-sales__chat-bericht--vraag">{bericht.vraag}</div>
                  <div className="ml-sales__chat-bericht ml-sales__chat-bericht--antwoord">{bericht.antwoord}</div>
                </div>
              ))}
            </div>
          )}
          <div className="ml-sales__chat-input-rij">
            <textarea
              value={chatVraag}
              onChange={(e) => setChatVraag(e.target.value)}
              placeholder="Bijv. wat is de belangrijkste behoefte van deze school?"
            />
            <button
              type="button"
              className="ml-sales__knop ml-sales__knop--primair"
              disabled={chatBezig || !chatVraag.trim()}
              onClick={() => {
                const vraag = chatVraag;
                setChatVraag("");
                stelVraag(vraag);
              }}
            >
              {chatBezig ? "Bezig…" : "Vraag"}
            </button>
          </div>
        </div>
      </div>

      <div className="ml-sales__section">
        <div className="ml-sales__section-titel">
          <h2>Logboek</h2>
          {logboek.some(isUitklapbaar) && (
            <button type="button" className="ml-sales__knop" onClick={allesUitklappen} style={{ padding: "2px 8px" }}>
              {logboek.filter(isUitklapbaar).every((e) => uitgeklapt.has(e.id)) ? "Alles inklappen" : "Alles uitklappen"}
            </button>
          )}
        </div>
        {logboek.length === 0 ? (
          <div className="ml-sales__leeg">Nog geen logboekregels.</div>
        ) : (
          <div className="ml-sales__logboek">
            {logboek.map((event) => {
              const kanUitklappen = isUitklapbaar(event);
              const isOpen = uitgeklapt.has(event.id);
              const volledig = volledigeTeksten.get(event.id);
              const auteur = event.payload?.auteur ?? volledig?.auteur ?? null;
              return (
                <div className="ml-sales__logboek-item" key={event.id}>
                  <span className={`ml-sales__logboek-stip ml-sales__logboek-stip--${event.type}`} />
                  <div>
                    <div style={{ whiteSpace: isOpen ? "pre-wrap" : undefined }}>{isOpen && volledig ? volledig.tekst : event.summary}</div>
                    <div className="ml-sales__logboek-meta">
                      {formatKorteDatumTijd(event.occurredAt)}
                      {event.payload?.datumOnzeker ? " (datum onzeker — gemigreerd)" : ""} · {typeLabel(event.type)} · {event.source}
                      {auteur ? ` · ${auteur}` : ""}
                    </div>
                    {kanUitklappen && (
                      <button
                        type="button"
                        className="ml-sales__knop"
                        onClick={() => toggleLogboekItem(event)}
                        disabled={uitklapBezig.has(event.id)}
                        style={{ marginTop: 4, padding: "2px 8px" }}
                      >
                        {uitklapBezig.has(event.id) ? "Bezig…" : isOpen ? "Inklappen" : "Lees volledig"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function SalesSchooldetailView() {
  return (
    <Suspense fallback={<div className="ml-sales__leeg">Laden…</div>}>
      <SchooldetailInner />
    </Suspense>
  );
}
