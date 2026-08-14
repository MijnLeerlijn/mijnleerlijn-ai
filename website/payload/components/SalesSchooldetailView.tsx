"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

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
}

const ACTIE_TYPES = ["mail", "bellen", "afspraak", "voorbereiding", "informatie_sturen", "anders"];
const KANALEN = ["mail", "telefoon", "in_persoon", "anders"];

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

function AanpasFormulier({ voorstel, onBevestig }: { voorstel: SalesProposalDoc; onBevestig: (waarde: Record<string, string>) => void }) {
  const [datum, setDatum] = useState(voorstel.proposedDate?.slice(0, 10) ?? "");
  const [type, setType] = useState(voorstel.proposedType ?? "anders");
  const [kanaal, setKanaal] = useState(voorstel.proposedChannel ?? "mail");
  const [waarde, setWaarde] = useState(voorstel.proposedValue ?? "");

  if (voorstel.proposalType === "veld_correctie") {
    return (
      <div className="ml-sales__actie-knoppen" style={{ marginTop: 8 }}>
        <input value={waarde} onChange={(e) => setWaarde(e.target.value)} style={{ padding: "6px 10px", borderRadius: "var(--ml-admin-radius-sm)", border: "1px solid var(--theme-elevation-200)" }} />
        <button type="button" className="ml-sales__knop ml-sales__knop--primair" onClick={() => onBevestig({ proposedValue: waarde })}>
          Bevestig andere waarde
        </button>
      </div>
    );
  }

  return (
    <div className="ml-sales__actie-knoppen" style={{ marginTop: 8, flexWrap: "wrap" }}>
      <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} style={{ padding: "6px 10px", borderRadius: "var(--ml-admin-radius-sm)", border: "1px solid var(--theme-elevation-200)" }} />
      <select value={type} onChange={(e) => setType(e.target.value)} style={{ padding: "6px 10px", borderRadius: "var(--ml-admin-radius-sm)", border: "1px solid var(--theme-elevation-200)" }}>
        {ACTIE_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select value={kanaal} onChange={(e) => setKanaal(e.target.value)} style={{ padding: "6px 10px", borderRadius: "var(--ml-admin-radius-sm)", border: "1px solid var(--theme-elevation-200)" }}>
        {KANALEN.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="ml-sales__knop ml-sales__knop--primair"
        onClick={() => onBevestig({ proposedDate: datum, proposedType: type, proposedChannel: kanaal })}
      >
        Bevestig aanpassing
      </button>
    </div>
  );
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
  const [aanpasVoorstelId, setAanpasVoorstelId] = useState<number | null>(null);

  const [samenvatting, setSamenvatting] = useState<string | null>(null);
  const [chatVraag, setChatVraag] = useState("");
  const [chatBerichten, setChatBerichten] = useState<{ vraag: string; antwoord: string }[]>([]);
  const [chatBezig, setChatBezig] = useState(false);

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
    setOpenActie(acties[0] ?? null);
    setVoorstellen(proposals);
    setLogboek(logEvents);
    setLaden(false);
  }, [schoolId]);

  useEffect(() => {
    laad();
  }, [laad]);

  async function beslis(proposalId: number, beslissing: "accepted" | "rejected" | "modified", aangepasteWaarde?: Record<string, string>) {
    setBezig(`voorstel-${proposalId}`);
    await apiPost(`/api/sales/proposals/${proposalId}/decide`, { beslissing, aangepasteWaarde });
    setAanpasVoorstelId(null);
    setBezig(null);
    laad();
  }

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

  async function genereerSamenvatting() {
    setSamenvatting(null);
    setChatBezig(true);
    const { ok, data } = await apiPost<{ antwoord: string }>(`/api/sales/school/${schoolId}/chat`, {
      vraag: "Geef in maximaal 4 zinnen een samenvatting van waar we nu staan met deze school, gebaseerd op de beschikbare context.",
    });
    if (ok && data) setSamenvatting(data.antwoord);
    setChatBezig(false);
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
            {school.relatiestatus && <span className="ml-sales__badge">{school.relatiestatus}</span>}
            {school.salesfase && <span className="ml-sales__badge">{school.salesfase}</span>}
            {onderwijstypeNaam && <span className="ml-sales__badge">{onderwijstypeNaam}</span>}
            {school.contactpersoonNaam && <span className="ml-sales__badge">Contact: {school.contactpersoonNaam}</span>}
          </div>
        </div>
        <a href={mondayUrl} target="_blank" rel="noreferrer" className="ml-sales__knop">
          Open in Monday
        </a>
      </div>

      <div className="ml-sales__kaarten-rij">
        <div className="ml-sales__kaart">
          <div className="ml-sales__kaart-header">
            <strong>Waar staan we?</strong>
          </div>
          {samenvatting ? (
            <p className="ml-sales__kaart-tekst">{samenvatting}</p>
          ) : (
            <button type="button" className="ml-sales__knop" onClick={genereerSamenvatting} disabled={chatBezig}>
              {chatBezig ? "Bezig…" : "Genereer samenvatting"}
            </button>
          )}
        </div>

        <div className="ml-sales__kaart">
          <div className="ml-sales__kaart-header">
            <strong>Volgende actie</strong>
          </div>
          {openActie ? (
            <>
              <p className="ml-sales__kaart-tekst">
                {openActie.type} — {openActie.dueDate.slice(0, 10)}
                {openActie.channel ? ` · ${openActie.channel}` : ""}
              </p>
              <p className="ml-sales__kaart-tekst">{openActie.description}</p>
            </>
          ) : (
            <p className="ml-sales__kaart-tekst">Geen open actie. Zie eventueel AI-voorstellen hieronder, of vraag de AI om een suggestie.</p>
          )}
          {!school.onderwijstype && (
            <button type="button" className="ml-sales__knop" onClick={genereerVerrijking} disabled={bezig !== null}>
              {bezig === "enrich" ? "Bezig…" : "Onderwijstype herkennen"}
            </button>
          )}
        </div>

        <div className="ml-sales__kaart">
          <div className="ml-sales__kaart-header">
            <strong>Schoolcontext</strong>
          </div>
          <p className="ml-sales__kaart-tekst">Onderwijstype: {onderwijstypeNaam ?? "onbekend"}</p>
          <p className="ml-sales__kaart-tekst">Laatste Monday-activiteit: {school.lastMondayActivityAt ? school.lastMondayActivityAt.slice(0, 10) : "onbekend"}</p>
          <p className="ml-sales__kaart-tekst">Volgende actie in Monday: {school.mondayVolgendeActieDatum ? school.mondayVolgendeActieDatum.slice(0, 10) : "geen"}</p>
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
                <div className="ml-sales__actie-knoppen">
                  <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={bezig !== null} onClick={() => beslis(voorstel.id, "accepted")}>
                    {voorstel.proposalType === "bestaande_vervolgdatum"
                      ? "Maak Sales-actie"
                      : voorstel.proposalType === "veld_correctie"
                        ? "Bevestigen en invullen in Monday"
                        : "Bevestigen"}
                  </button>
                  <button type="button" className="ml-sales__knop" onClick={() => setAanpasVoorstelId(aanpasVoorstelId === voorstel.id ? null : voorstel.id)}>
                    {voorstel.proposalType === "bestaande_vervolgdatum" ? "Andere datum" : voorstel.proposalType === "veld_correctie" ? "Andere waarde" : "Aanpassen"}
                  </button>
                  <button type="button" className="ml-sales__knop" disabled={bezig !== null} onClick={() => beslis(voorstel.id, "rejected")}>
                    {voorstel.proposalType === "veld_correctie" ? "Negeren" : "Niet nodig"}
                  </button>
                </div>
                {aanpasVoorstelId === voorstel.id && (
                  <AanpasFormulier voorstel={voorstel} onBevestig={(waarde) => beslis(voorstel.id, "modified", waarde)} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ml-sales__section">
        <h2>Vraag AI over deze school</h2>
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
        <h2>Logboek</h2>
        {logboek.length === 0 ? (
          <div className="ml-sales__leeg">Nog geen logboekregels.</div>
        ) : (
          <div className="ml-sales__logboek">
            {logboek.map((event) => (
              <div className="ml-sales__logboek-item" key={event.id}>
                <span className={`ml-sales__logboek-stip ml-sales__logboek-stip--${event.type}`} />
                <div>
                  <div>{event.summary}</div>
                  <div className="ml-sales__logboek-meta">
                    {event.occurredAt.slice(0, 10)} · {event.type} · {event.source}
                  </div>
                </div>
              </div>
            ))}
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
