"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@payloadcms/ui";
import { SCHOLEN_KOLOM, TYPE_SCHOOL_WAARDEN } from "@/lib/sales/monday-columns";

// Write-back-diagnose (2026-08-15) — TIJDELIJK SCHERM. Verwijderen of
// verbergen zodra Michel de live smoke-test tegen board 18420120365
// succesvol heeft doorlopen (zie het opleverrapport). Admin-only: de
// server-side routes (isAdmin) zijn de echte grens, deze client-check is
// alleen een nette "geen toegang"-melding i.p.v. een lege/kapotte pagina
// voor een editor die hier per ongeluk op navigeert.
//
// Hergebruikt bewust de bestaande 3 write-back-kolommen (lib/sales/
// monday-columns.ts) en de ECHTE productie-write-back-primitief (via
// lib/sales/monday-diagnostics.ts, forceerDiagnostisch — zie writeback.ts)
// — geen nagebouwd testpad.
interface SchoolOptie {
  id: number;
  schoolName: string;
}

interface KolomVerificatie {
  columnId: string;
  label: string;
  gevondenOpBoard: boolean;
  liveType: string | null;
  huidigeWaarde: string | null | undefined;
}

interface KoppelingVerificatie {
  boardBereikbaar: boolean;
  boardNaam: string | null;
  kolommen: KolomVerificatie[];
  testitem: { gevonden: boolean; naam: string | null } | null;
  fout: string | null;
}

interface DiagnostischResultaat {
  schrijfResultaat: { status: string; boodschap: string };
  gelezenNaSchrijven: string | null;
  bevestigd: boolean;
}

async function apiPost<T>(url: string, body?: unknown): Promise<{ ok: boolean; data: T | null }> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null;
  }
  return { ok: res.ok, data };
}

function KolomTester({ schoolId, kolom, onGewijzigd }: { schoolId: number; kolom: KolomVerificatie; onGewijzigd: () => void }) {
  const isDropdown = kolom.columnId === SCHOLEN_KOLOM.typeSchool;
  const [testWaarde, setTestWaarde] = useState(isDropdown ? "" : (kolom.huidigeWaarde ?? "").slice(0, 10));
  const [bevestigOpen, setBevestigOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [resultaat, setResultaat] = useState<DiagnostischResultaat | null>(null);
  const [origineleWaarde] = useState(kolom.huidigeWaarde ?? null);
  const [teruggezet, setTeruggezet] = useState(false);

  async function schrijfTest() {
    setBezig(true);
    const { ok, data } = await apiPost<DiagnostischResultaat>("/api/sales/monday-diagnostics/test-write", {
      schoolId,
      columnId: kolom.columnId,
      testWaarde,
      verwachteHuidigeWaarde: kolom.huidigeWaarde ?? null,
    });
    setBezig(false);
    setBevestigOpen(false);
    if (ok && data) {
      setResultaat(data);
      onGewijzigd();
    }
  }

  async function zetTerug() {
    if (!resultaat) return;
    setBezig(true);
    const { ok, data } = await apiPost<DiagnostischResultaat>("/api/sales/monday-diagnostics/revert", {
      schoolId,
      columnId: kolom.columnId,
      oorspronkelijkeWaarde: origineleWaarde,
      verwachteHuidigeWaarde: resultaat.gelezenNaSchrijven,
    });
    setBezig(false);
    if (ok && data?.bevestigd) {
      setTeruggezet(true);
      onGewijzigd();
    }
  }

  return (
    <div className="ml-sales__kaart" style={{ marginBottom: 12 }}>
      <div className="ml-sales__kaart-header">
        <strong>{kolom.label}</strong>
        <span className="ml-sales__badge">{kolom.columnId}</span>
      </div>
      <p className="ml-sales__kaart-tekst">Huidige waarde: {kolom.huidigeWaarde === null ? "(leeg)" : (kolom.huidigeWaarde ?? "onbekend")}</p>

      {!resultaat && (
        <div className="ml-sales__actie-knoppen" style={{ flexWrap: "wrap" }}>
          {isDropdown ? (
            <select value={testWaarde} onChange={(e) => setTestWaarde(e.target.value)} aria-label={`Testwaarde voor ${kolom.label}`}>
              <option value="">Kies testwaarde…</option>
              {TYPE_SCHOOL_WAARDEN.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          ) : (
            <input type="date" value={testWaarde} onChange={(e) => setTestWaarde(e.target.value)} aria-label={`Testwaarde voor ${kolom.label}`} />
          )}
          <button type="button" className="ml-sales__knop" disabled={!testWaarde || bevestigOpen} onClick={() => setBevestigOpen(true)}>
            Schrijf testwaarde…
          </button>
        </div>
      )}

      {bevestigOpen && !resultaat && (
        <div className="ml-sales__proposal-chat" style={{ marginTop: 8 }}>
          <p className="ml-sales__kaart-tekst">
            Dit schrijft ECHT naar het live Monday-board: <strong>{kolom.huidigeWaarde ?? "(leeg)"}</strong> → <strong>{testWaarde}</strong>.
          </p>
          <div className="ml-sales__actie-knoppen">
            <button type="button" className="ml-sales__knop ml-sales__knop--gevaar" disabled={bezig} onClick={schrijfTest}>
              {bezig ? "Bezig…" : "Ja, dit is een test — schrijf naar Monday"}
            </button>
            <button type="button" className="ml-sales__knop" disabled={bezig} onClick={() => setBevestigOpen(false)}>
              Annuleren
            </button>
          </div>
        </div>
      )}

      {resultaat && (
        <div style={{ marginTop: 8 }}>
          <p className="ml-sales__kaart-tekst">
            Schrijfstatus: <strong>{resultaat.schrijfResultaat.status}</strong> — {resultaat.schrijfResultaat.boodschap}
          </p>
          {resultaat.schrijfResultaat.status === "geschreven" && (
            <p className="ml-sales__kaart-tekst">
              {resultaat.bevestigd ? "✅" : "⚠️"} Teruggelezen van Monday: <strong>{resultaat.gelezenNaSchrijven ?? "(leeg)"}</strong>
              {resultaat.bevestigd ? " — komt overeen met de testwaarde." : " — komt NIET overeen met de testwaarde, controleer handmatig."}
            </p>
          )}
          {resultaat.schrijfResultaat.status === "geschreven" && !teruggezet && (
            <div className="ml-sales__actie-knoppen">
              <button type="button" className="ml-sales__knop" disabled={bezig} onClick={zetTerug}>
                {bezig ? "Bezig…" : "Zet terug naar oorspronkelijke waarde"}
              </button>
            </div>
          )}
          {teruggezet && <p className="ml-sales__kaart-tekst">✅ Teruggezet naar de oorspronkelijke waarde.</p>}
        </div>
      )}
    </div>
  );
}

function DiagnoseInner() {
  const [scholen, setScholen] = useState<SchoolOptie[]>([]);
  const [schoolId, setSchoolId] = useState<string>("");
  const [verificatie, setVerificatie] = useState<KoppelingVerificatie | null>(null);
  const [laden, setLaden] = useState(false);

  useEffect(() => {
    fetch("/api/sales-schools?depth=0&sort=schoolName&limit=1000", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { docs: [] }))
      .then((d: { docs?: SchoolOptie[] }) => setScholen(d.docs ?? []));
  }, []);

  const leesHuidigeWaarden = useCallback(async () => {
    if (!schoolId) return;
    setLaden(true);
    const { data } = await apiPost<KoppelingVerificatie>("/api/sales/monday-diagnostics/verify", { schoolId: Number(schoolId) });
    setVerificatie(data);
    setLaden(false);
  }, [schoolId]);

  return (
    <div className="ml-sales">
      <div className="ml-sales__header" style={{ background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: "var(--ml-admin-radius)", padding: 16 }}>
        <h1>⚠️ Monday write-back — diagnosescherm (tijdelijk)</h1>
        <p>
          Dit scherm bestaat uitsluitend om de 3 write-back-kolommen (Datum laatste contact, Datum volgende actie, Type school) één voor één te testen tegen
          het live Monday-board vóórdat write-back voor echte leads wordt geactiveerd. Elke schrijfactie hieronder is ECHT en gaat direct naar productie —
          kies daarom altijd een schoolitem waarvan je de huidige waarden kent en zelf kunt controleren. Verwijder of verberg dit scherm zodra de verificatie
          geslaagd is.
        </p>
      </div>

      <div className="ml-sales__filter-balk" style={{ marginTop: 16 }}>
        <select value={schoolId} onChange={(e) => { setSchoolId(e.target.value); setVerificatie(null); }} aria-label="Kies testschool">
          <option value="">Kies een testschool…</option>
          {scholen.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.schoolName}
            </option>
          ))}
        </select>
        <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={!schoolId || laden} onClick={leesHuidigeWaarden}>
          {laden ? "Bezig…" : "Lees huidige waarden"}
        </button>
      </div>

      {verificatie && (
        <div className="ml-sales__section">
          <p className="ml-sales__kaart-tekst">
            Board {verificatie.boardBereikbaar ? "✅ bereikbaar" : "❌ niet bereikbaar"}
            {verificatie.boardNaam ? ` (${verificatie.boardNaam})` : ""}
          </p>
          {verificatie.fout && (
            <p className="ml-sales__kaart-tekst" style={{ color: "#dc2626" }}>
              Diagnose: {verificatie.fout}
            </p>
          )}
          {verificatie.testitem && (
            <p className="ml-sales__kaart-tekst">
              Testitem {verificatie.testitem.gevonden ? `✅ gevonden (${verificatie.testitem.naam})` : "❌ niet gevonden op Monday"}
            </p>
          )}

          {verificatie.boardBereikbaar && verificatie.testitem?.gevonden && (
            <div style={{ marginTop: 12 }}>
              {verificatie.kolommen.map((k) =>
                k.gevondenOpBoard ? (
                  <KolomTester key={k.columnId} schoolId={Number(schoolId)} kolom={k} onGewijzigd={leesHuidigeWaarden} />
                ) : (
                  <div className="ml-sales__kaart" key={k.columnId} style={{ marginBottom: 12, borderColor: "#dc2626" }}>
                    <p className="ml-sales__kaart-tekst">
                      ❌ {k.label} ({k.columnId}) niet gevonden op het live board — niet te testen.
                    </p>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SalesMondayDiagnoseView() {
  const { user } = useAuth();
  if (!user || (user as { role?: string }).role !== "admin") {
    return <div className="ml-sales__leeg">Geen toegang — dit diagnosescherm is alleen voor beheerders.</div>;
  }
  return <DiagnoseInner />;
}
