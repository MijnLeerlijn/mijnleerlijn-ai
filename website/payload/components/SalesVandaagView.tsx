"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RelatiestatusBadge } from "./RelatiestatusBadge";
import { PlanActieKnop } from "./PlanActieKnop";
import { formatKorteDatum } from "@/lib/sales/format-datum";
import { PENDING_VOORSTEL_TYPES_VOOR_AANDACHT } from "@/lib/sales/aandacht-nodig";

// Sales UX V2 (2026-08-14) — dagelijks werkscherm, herbouwd van 4
// vrijwel-identieke kaartsecties naar 3 duidelijke onderdelen (Vandaag doen /
// AI stelt voor / Aandacht nodig) + "Binnenkort gepland" als klein,
// ingeklapt blokje. AI-voorstellen ontstaan voortaan proactief via sync
// (lib/sales/sync.ts, na nieuwe echte Monday-activiteit) — deze pagina
// vraagt daar nooit zelf om, alleen om ze te tonen/beoordelen. Client-
// component die rechtstreeks op Payload's eigen REST-API leest, zelfde
// patroon als voorheen.
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

interface SalesProposalDoc {
  id: number;
  proposalText: string;
  reason?: string;
  proposalType: "volgende_actie" | "veld_correctie" | "bestaande_vervolgdatum";
  confidence?: "hoog" | "middel" | "laag" | null;
  proposedDate?: string | null;
  proposedValue?: string | null;
  targetColumnId?: string | null;
  school: SchoolRef | number;
}

interface SalesSchoolDoc {
  id: number;
  schoolName: string;
  relatiestatus?: string | null;
  plaats?: string | null;
  lastMondayActivityAt?: string | null;
}

interface SalesLogEventDoc {
  school: SchoolRef | number;
  summary: string;
  payload?: { gemigreerd?: boolean } | null;
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

function schoolRef(school: SchoolRef | number): SchoolRef {
  return typeof school === "number" ? { id: school, schoolName: `School #${school}` } : school;
}

function vandaagIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Visuele polish (2026-08-14) — zelfde urgentie-afleiding als
// SalesDashboardPaneel.tsx, voor consistente kleuraccenten tussen widget en
// volledige pagina. Puur weergave, geen nieuw veld.
function urgentieVanActie(actie: SalesActionDoc): "achterstallig" | "vandaag" | null {
  const datum = actie.dueDate.slice(0, 10);
  const vandaag = vandaagIso();
  if (datum < vandaag) return "achterstallig";
  if (datum === vandaag) return "vandaag";
  return null;
}

function SchoolMeta({ school, extra }: { school: SchoolRef; extra?: string | null }) {
  return <p className="ml-sales__kaart-tekst">{[school.plaats, extra].filter(Boolean).join(" · ")}</p>;
}

export function SalesVandaagView() {
  const [naam, setNaam] = useState<string>("");
  const [vandaagActies, setVandaagActies] = useState<SalesActionDoc[]>([]);
  const [wachtendActies, setWachtendActies] = useState<SalesActionDoc[]>([]);
  const [voorstellen, setVoorstellen] = useState<SalesProposalDoc[]>([]);
  const [veiligheidsnetScholen, setVeiligheidsnetScholen] = useState<SalesSchoolDoc[]>([]);
  const [contextPerSchool, setContextPerSchool] = useState<Map<number, string>>(new Map());
  const [binnenkortOpen, setBinnenkortOpen] = useState(false);
  const [laden, setLaden] = useState(true);
  const [bezig, setBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);

  const laadAlles = useCallback(async () => {
    setLaden(true);
    const vandaag = vandaagIso();

    const [me, openActies, proposals, actieveScholen] = await Promise.all([
      fetch("/api/users/me", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      apiGet<SalesActionDoc>(`/api/sales-actions?where[status][equals]=open&depth=1&sort=dueDate&limit=200`),
      apiGet<SalesProposalDoc>(
        `/api/sales-proposals?where[status][equals]=pending&where[confidence][not_equals]=laag&depth=1&sort=-createdAt&limit=100`
      ),
      apiGet<SalesSchoolDoc>(`/api/sales-schools?where[actief][equals]=true&depth=0&limit=1000`),
    ]);

    setNaam(me?.user?.name || me?.user?.email || "");
    setVandaagActies(openActies.filter((a) => a.dueDate.slice(0, 10) <= vandaag));
    setWachtendActies(openActies.filter((a) => a.dueDate.slice(0, 10) > vandaag));
    setVoorstellen(proposals);

    const schoolIdsMetActie = new Set(openActies.map((a) => schoolRef(a.school).id));
    // "Aandacht nodig": zelfde criterium als de widget/backfill-telling — een
    // pending veld_correctie-voorstel (bv. Type school) telt niet mee, dat
    // zegt niets over een geplande vervolgstap.
    const schoolIdsMetRelevantVoorstel = new Set(
      proposals.filter((p) => (PENDING_VOORSTEL_TYPES_VOOR_AANDACHT as readonly string[]).includes(p.proposalType)).map((p) => schoolRef(p.school).id)
    );
    const zonderVervolg = actieveScholen.filter((s) => !schoolIdsMetActie.has(s.id) && !schoolIdsMetRelevantVoorstel.has(s.id));
    setVeiligheidsnetScholen(zonderVervolg);

    if (zonderVervolg.length > 0) {
      const logEvents = await apiGet<SalesLogEventDoc>(
        `/api/sales-log-events?where[school][in]=${zonderVervolg.map((s) => s.id).join(",")}&where[type][equals]=contact&depth=0&sort=-occurredAt&limit=${zonderVervolg.length * 3}`
      );
      const context = new Map<number, string>();
      for (const event of logEvents) {
        if (event.payload?.gemigreerd) continue;
        const id = schoolRef(event.school).id;
        if (!context.has(id)) context.set(id, event.summary);
      }
      setContextPerSchool(context);
    } else {
      setContextPerSchool(new Map());
    }

    setLaden(false);
  }, []);

  useEffect(() => {
    laadAlles();
  }, [laadAlles]);

  async function voerSyncUit() {
    setBezig("sync");
    setMelding(null);
    const { ok, data } = await apiPost<{ scholenVerwerkt: number; updatesNieuw: number; nieuweVoorstellenViaSync: number; fouten: string[] }>("/api/sales/sync");
    setMelding(
      ok
        ? `Sync klaar: ${data?.scholenVerwerkt ?? 0} scholen verwerkt, ${data?.updatesNieuw ?? 0} nieuwe Updates, ${data?.nieuweVoorstellenViaSync ?? 0} school(en) met een nieuw AI-voorstel.${data?.fouten?.length ? ` (${data.fouten.length} fouten)` : ""}`
        : "Sync mislukt."
    );
    setBezig(null);
    laadAlles();
  }

  async function voerBackfillUit() {
    setBezig("backfill");
    setMelding(null);
    const { ok, data } = await apiPost<{ scholenBeoordeeld: number; perUitkomst: Record<string, number> }>("/api/sales/backfill");
    setMelding(ok ? `Klaar: ${data?.scholenBeoordeeld ?? 0} scholen beoordeeld, ${data?.perUitkomst?.ai_voorstel_klaar ?? 0} nieuwe voorstellen.` : "Mislukt.");
    setBezig(null);
    laadAlles();
  }

  async function beslis(proposalId: number, beslissing: "accepted" | "rejected") {
    setBezig(`voorstel-${proposalId}`);
    await apiPost(`/api/sales/proposals/${proposalId}/decide`, { beslissing });
    setBezig(null);
    laadAlles();
  }

  if (laden) {
    return <div className="ml-sales__leeg">Laden…</div>;
  }

  return (
    <div className="ml-sales">
      <div className="ml-sales__header">
        <h1>Goedemorgen{naam ? ` ${naam}` : ""}</h1>
        <p>
          {vandaagActies.length} actie{vandaagActies.length === 1 ? "" : "s"} vandaag, {voorstellen.length} AI-voorstel
          {voorstellen.length === 1 ? "" : "len"} ter beoordeling
          {veiligheidsnetScholen.length > 0 ? `, ${veiligheidsnetScholen.length} school(en) zonder vervolg` : ""}.
        </p>
        <div className="ml-sales__acties-rij">
          <button type="button" className="ml-sales__knop" onClick={voerSyncUit} disabled={bezig !== null}>
            {bezig === "sync" ? "Bezig…" : "Sync nu"}
          </button>
          <button type="button" className="ml-sales__knop" onClick={voerBackfillUit} disabled={bezig !== null || veiligheidsnetScholen.length === 0}>
            {bezig === "backfill" ? "Bezig…" : `Laat AI vervolgacties voorstellen${veiligheidsnetScholen.length > 0 ? ` voor ${veiligheidsnetScholen.length} scholen` : ""}`}
          </button>
        </div>
        {melding && <p className="ml-sales__kaart-tekst">{melding}</p>}
      </div>

      <div className="ml-sales__section">
        <div className="ml-sales__section-titel">
          <h2>Vandaag doen</h2>
          <span className="ml-sales__section-count">{vandaagActies.length}</span>
        </div>
        {vandaagActies.length === 0 ? (
          <div className="ml-sales__leeg">Niets openstaand voor vandaag.</div>
        ) : (
          <div className="ml-sales__grid">
            {vandaagActies.map((actie) => {
              const school = schoolRef(actie.school);
              const urgentie = urgentieVanActie(actie);
              return (
                <div className={`ml-sales__kaart${urgentie ? ` ml-sales-widget__item--${urgentie}` : ""}`} key={actie.id}>
                  <div className="ml-sales__kaart-header">
                    <Link href={`/admin/sales/school?id=${school.id}`}>{school.schoolName}</Link>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {urgentie && (
                        <span className={`ml-sales-widget__urgentie ml-sales-widget__urgentie--${urgentie}`}>
                          {urgentie === "achterstallig" ? "Achterstallig" : "Vandaag"}
                        </span>
                      )}
                      <RelatiestatusBadge relatiestatus={school.relatiestatus} />
                    </div>
                  </div>
                  <SchoolMeta school={school} extra={`Vandaag: ${actie.type}`} />
                  <p className="ml-sales__kaart-tekst">{actie.description}</p>
                  <p className="ml-sales__kaart-tekst">Datum: {formatKorteDatum(actie.dueDate)}</p>
                  <div className="ml-sales__actie-knoppen">
                    <Link href={`/admin/sales/school?id=${school.id}`} className="ml-sales__knop">
                      Bekijk school
                    </Link>
                    <Link href={`/admin/creator?mail=nieuw&school=${school.id}`} className="ml-sales__knop">
                      Schrijf mail
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="ml-sales__section">
        <div className="ml-sales__section-titel">
          <h2>AI stelt voor</h2>
          <span className="ml-sales__section-count">{voorstellen.length}</span>
        </div>
        {voorstellen.length === 0 ? (
          <div className="ml-sales__leeg">Geen openstaande AI-voorstellen.</div>
        ) : (
          <div className="ml-sales__grid">
            {voorstellen.map((voorstel) => {
              const school = schoolRef(voorstel.school);
              return (
                <div className="ml-sales__kaart" key={voorstel.id}>
                  <div className="ml-sales__kaart-header">
                    <Link href={`/admin/sales/school?id=${school.id}`}>{school.schoolName}</Link>
                    <RelatiestatusBadge relatiestatus={school.relatiestatus} />
                  </div>
                  <SchoolMeta school={school} />
                  <p className="ml-sales__kaart-tekst">
                    {voorstel.proposalText}
                    {voorstel.confidence && (
                      <span className={`ml-sales__badge ml-sales__badge--confidence-${voorstel.confidence}`} style={{ marginLeft: 6 }}>
                        {voorstel.confidence}
                      </span>
                    )}
                  </p>
                  {voorstel.reason && <p className="ml-sales__kaart-tekst">AI: {voorstel.reason}</p>}
                  <div className="ml-sales__actie-knoppen">
                    <button
                      type="button"
                      className="ml-sales__knop ml-sales__knop--primair"
                      disabled={bezig !== null}
                      onClick={() => beslis(voorstel.id, "accepted")}
                    >
                      {voorstel.proposalType === "bestaande_vervolgdatum"
                        ? "Maak Sales-actie"
                        : voorstel.proposalType === "veld_correctie"
                          ? "Bevestigen en invullen in Monday"
                          : "Accepteren"}
                    </button>
                    <Link href={`/admin/sales/school?id=${school.id}#voorstel-${voorstel.id}`} className="ml-sales__knop">
                      {voorstel.proposalType === "bestaande_vervolgdatum"
                        ? "Andere datum"
                        : voorstel.proposalType === "veld_correctie"
                          ? "Andere waarde"
                          : "Aanpassen"}
                    </Link>
                    <Link href={`/admin/creator?mail=nieuw&school=${school.id}`} className="ml-sales__knop">
                      Schrijf mail
                    </Link>
                    <Link href={`/admin/sales/school?id=${school.id}`} className="ml-sales__knop">
                      Bekijk school
                    </Link>
                    <button type="button" className="ml-sales__knop" disabled={bezig !== null} onClick={() => beslis(voorstel.id, "rejected")}>
                      {voorstel.proposalType === "veld_correctie" ? "Negeren" : "Niet nodig"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="ml-sales__section">
        <div className="ml-sales__section-titel">
          <h2>Aandacht nodig</h2>
          <span className="ml-sales__section-count">{veiligheidsnetScholen.length}</span>
        </div>
        {veiligheidsnetScholen.length === 0 ? (
          <div className="ml-sales__leeg">Geen — elke actieve school heeft een actie of AI-voorstel.</div>
        ) : (
          <div className="ml-sales__grid">
            {veiligheidsnetScholen.map((school) => (
              <div className="ml-sales__kaart ml-sales__veiligheidsnet" key={school.id}>
                <div className="ml-sales__kaart-header">
                  <Link href={`/admin/sales/school?id=${school.id}`}>{school.schoolName}</Link>
                  <RelatiestatusBadge relatiestatus={school.relatiestatus} />
                </div>
                <SchoolMeta
                  school={school}
                  extra={formatKorteDatum(school.lastMondayActivityAt) !== "—" ? `Laatste contact: ${formatKorteDatum(school.lastMondayActivityAt)}` : "Geen bekend laatste contact"}
                />
                {contextPerSchool.has(school.id) && <p className="ml-sales__kaart-tekst">&ldquo;{contextPerSchool.get(school.id)}&rdquo;</p>}
                <div className="ml-sales__actie-knoppen">
                  <Link href={`/admin/sales/school?id=${school.id}`} className="ml-sales__knop">
                    Bekijk school
                  </Link>
                  <PlanActieKnop schoolId={school.id} />
                  <Link href={`/admin/creator?mail=nieuw&school=${school.id}`} className="ml-sales__knop">
                    Schrijf mail
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {wachtendActies.length > 0 && (
        <div className="ml-sales__section ml-sales__section--ingeklapt">
          <button type="button" className="ml-sales__section-titel ml-sales__section-titel--klikbaar" onClick={() => setBinnenkortOpen((o) => !o)}>
            <h2>
              {binnenkortOpen ? "▾" : "▸"} Binnenkort gepland
            </h2>
            <span className="ml-sales__section-count">{wachtendActies.length}</span>
          </button>
          {binnenkortOpen && (
            <div className="ml-sales__grid">
              {wachtendActies.map((actie) => {
                const school = schoolRef(actie.school);
                return (
                  <div className="ml-sales__kaart" key={actie.id}>
                    <div className="ml-sales__kaart-header">
                      <Link href={`/admin/sales/school?id=${school.id}`}>{school.schoolName}</Link>
                      <span className="ml-sales__badge">{formatKorteDatum(actie.dueDate)}</span>
                    </div>
                    <p className="ml-sales__kaart-tekst">{actie.description}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
