"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

// Sales-assistent V1 (2026-08-14) — dagelijks werkscherm. Client-component
// die rechtstreeks op Payload's eigen REST-API leest (sales-actions/
// sales-proposals/sales-schools, alle drie anyEditor-leesbaar) en de eigen
// /api/sales/*-routes gebruikt voor acties met nevenerffecten (sync,
// backfill, beslissen over een voorstel) — zelfde patroon als CreatorView.tsx.
interface SchoolRef {
  id: number;
  schoolName: string;
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

function schoolNaam(school: SchoolRef | number): string {
  return typeof school === "number" ? `School #${school}` : school.schoolName;
}

function schoolId(school: SchoolRef | number): number {
  return typeof school === "number" ? school : school.id;
}

function vandaagIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SalesVandaagView() {
  const [naam, setNaam] = useState<string>("");
  const [vandaagActies, setVandaagActies] = useState<SalesActionDoc[]>([]);
  const [wachtendActies, setWachtendActies] = useState<SalesActionDoc[]>([]);
  const [voorstellen, setVoorstellen] = useState<SalesProposalDoc[]>([]);
  const [veiligheidsnetScholen, setVeiligheidsnetScholen] = useState<SchoolRef[]>([]);
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

    const schoolIdsMetActie = new Set(openActies.map((a) => schoolId(a.school)));
    const schoolIdsMetVoorstel = new Set(proposals.map((p) => schoolId(p.school)));
    setVeiligheidsnetScholen(
      actieveScholen.filter((s) => !schoolIdsMetActie.has(s.id) && !schoolIdsMetVoorstel.has(s.id))
    );

    setLaden(false);
  }, []);

  useEffect(() => {
    laadAlles();
  }, [laadAlles]);

  async function voerSyncUit() {
    setBezig("sync");
    setMelding(null);
    const { ok, data } = await apiPost<{ scholenVerwerkt: number; updatesNieuw: number; fouten: string[] }>("/api/sales/sync");
    setMelding(
      ok
        ? `Sync klaar: ${data?.scholenVerwerkt ?? 0} scholen verwerkt, ${data?.updatesNieuw ?? 0} nieuwe Updates.${data?.fouten?.length ? ` (${data.fouten.length} fouten)` : ""}`
        : "Sync mislukt."
    );
    setBezig(null);
    laadAlles();
  }

  async function voerBackfillUit() {
    setBezig("backfill");
    setMelding(null);
    const { ok, data } = await apiPost<{ scholenBeoordeeld: number; perUitkomst: Record<string, number> }>("/api/sales/backfill");
    setMelding(ok ? `Backfill klaar: ${data?.scholenBeoordeeld ?? 0} scholen beoordeeld.` : "Backfill mislukt.");
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
          {veiligheidsnetScholen.length > 0 ? `, ${veiligheidsnetScholen.length} school(en) zonder volgende actie` : ""}.
        </p>
        <div className="ml-sales__acties-rij">
          <button type="button" className="ml-sales__knop" onClick={voerSyncUit} disabled={bezig !== null}>
            {bezig === "sync" ? "Bezig…" : "Sync nu"}
          </button>
          <button type="button" className="ml-sales__knop" onClick={voerBackfillUit} disabled={bezig !== null}>
            {bezig === "backfill" ? "Bezig…" : "Voer backfill uit"}
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
            {vandaagActies.map((actie) => (
              <div className="ml-sales__kaart" key={actie.id}>
                <div className="ml-sales__kaart-header">
                  <Link href={`/admin/sales/school?id=${schoolId(actie.school)}`}>{schoolNaam(actie.school)}</Link>
                  <span className="ml-sales__badge">{actie.type}</span>
                </div>
                <p className="ml-sales__kaart-tekst">{actie.description}</p>
                <p className="ml-sales__kaart-tekst">Datum: {actie.dueDate.slice(0, 10)}</p>
              </div>
            ))}
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
            {voorstellen.map((voorstel) => (
              <div className="ml-sales__kaart" key={voorstel.id}>
                <div className="ml-sales__kaart-header">
                  <Link href={`/admin/sales/school?id=${schoolId(voorstel.school)}`}>{schoolNaam(voorstel.school)}</Link>
                  {voorstel.confidence && (
                    <span className={`ml-sales__badge ml-sales__badge--confidence-${voorstel.confidence}`}>{voorstel.confidence}</span>
                  )}
                </div>
                <p className="ml-sales__kaart-tekst">{voorstel.proposalText}</p>
                {voorstel.reason && <p className="ml-sales__kaart-tekst">Waarom: {voorstel.reason}</p>}
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
                        : "Bevestigen"}
                  </button>
                  <Link href={`/admin/sales/school?id=${schoolId(voorstel.school)}#voorstel-${voorstel.id}`} className="ml-sales__knop">
                    {voorstel.proposalType === "bestaande_vervolgdatum"
                      ? "Andere datum"
                      : voorstel.proposalType === "veld_correctie"
                        ? "Andere waarde"
                        : "Aanpassen"}
                  </Link>
                  <button type="button" className="ml-sales__knop" disabled={bezig !== null} onClick={() => beslis(voorstel.id, "rejected")}>
                    {voorstel.proposalType === "veld_correctie" ? "Negeren" : "Niet nodig"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {wachtendActies.length > 0 && (
        <div className="ml-sales__section">
          <div className="ml-sales__section-titel">
            <h2>Wachten</h2>
            <span className="ml-sales__section-count">{wachtendActies.length}</span>
          </div>
          <div className="ml-sales__grid">
            {wachtendActies.map((actie) => (
              <div className="ml-sales__kaart" key={actie.id}>
                <div className="ml-sales__kaart-header">
                  <Link href={`/admin/sales/school?id=${schoolId(actie.school)}`}>{schoolNaam(actie.school)}</Link>
                  <span className="ml-sales__badge">{actie.dueDate.slice(0, 10)}</span>
                </div>
                <p className="ml-sales__kaart-tekst">{actie.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ml-sales__section">
        <div className="ml-sales__section-titel">
          <h2>Actieve scholen zonder volgende actie</h2>
          <span className="ml-sales__section-count">{veiligheidsnetScholen.length}</span>
        </div>
        {veiligheidsnetScholen.length === 0 ? (
          <div className="ml-sales__leeg">Geen — elke actieve school heeft een actie, voorstel of wachtmoment.</div>
        ) : (
          <div className="ml-sales__grid">
            {veiligheidsnetScholen.map((school) => (
              <div className="ml-sales__kaart ml-sales__veiligheidsnet" key={school.id}>
                <div className="ml-sales__kaart-header">
                  <Link href={`/admin/sales/school?id=${school.id}`}>{school.schoolName}</Link>
                </div>
                <p className="ml-sales__kaart-tekst">Geen open actie of AI-voorstel — controleer handmatig.</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
