"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@payloadcms/ui";

// Traineromgeving — read-only Monday-diagnose (2026-08-19). TIJDELIJK
// SCHERM, uitsluitend om A–D van het architectuuronderzoek live te
// beantwoorden (trainerboards/board-/column-ID's/group-item-subitem-
// structuur/relatie met Master Data/Contactpersonen/logboeklocatie).
// Verwijderen zodra dat onderzoek is afgerond — samen met de 4 routes onder
// app/api/trainers-diagnose/monday/, lib/trainers-diagnose/, en de
// TrainersMondayDiagnoseViewShell-registratie hieronder/in payload.config.ts.
//
// Doet NOOIT een schrijfpoging — er is hier bewust geen enkele knop die
// iets naar Monday terugstuurt (in tegenstelling tot SalesMondayDiagnoseView,
// dat een ECHTE write-back test). Admin-only: de server-side routes
// (isAdmin) zijn de echte grens, deze client-check is alleen een nette
// "geen toegang"-melding. Geen permanente navigatie (bewust niet in
// nav-groups.ts) — uitsluitend bereikbaar via de directe URL
// /admin/trainers-diagnose/monday.
async function apiPost<T>(url: string, body?: unknown): Promise<{ ok: boolean; data: T | null; fout: string | null }> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: (T & { error?: string }) | null = null;
  try {
    data = (await res.json()) as T & { error?: string };
  } catch {
    data = null;
  }
  return { ok: res.ok, data: res.ok ? data : null, fout: !res.ok ? (data?.error ?? `Onbekende fout (${res.status})`) : null };
}

function KopieerKnop({ data, label = "Kopieer als JSON" }: { data: unknown; label?: string }) {
  const [gekopieerd, setGekopieerd] = useState(false);
  async function kopieer() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setGekopieerd(true);
      setTimeout(() => setGekopieerd(false), 2000);
    } catch {
      // Clipboard-API niet beschikbaar/geweigerd — de zichtbare <pre> hieronder blijft altijd handmatig te selecteren/kopiëren.
    }
  }
  return (
    <button type="button" className="ml-sales__knop" onClick={kopieer}>
      {gekopieerd ? "✅ Gekopieerd" : label}
    </button>
  );
}

function JsonBlok({ data }: { data: unknown }) {
  return (
    <pre style={{ maxHeight: 360, overflow: "auto", background: "var(--theme-elevation-50)", padding: 12, borderRadius: 8, fontSize: 12, marginTop: 8 }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

interface MondayBoardSamenvatting {
  id: string;
  name: string;
  items_count: number | null;
  state: string | null;
}

function BoardsSectie() {
  const [boards, setBoards] = useState<MondayBoardSamenvatting[] | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function haalOp() {
    setBezig(true);
    setFout(null);
    const { ok, data, fout: f } = await apiPost<{ boards: MondayBoardSamenvatting[] }>("/api/trainers-diagnose/monday/boards");
    if (ok && data) setBoards(data.boards);
    else setFout(f);
    setBezig(false);
  }

  return (
    <div className="ml-sales__section">
      <h2>1. Welke boards zijn bereikbaar?</h2>
      <p className="ml-sales__kaart-tekst">Alle boards die met het geconfigureerde token leesbaar zijn (begrensd tot 100). Herken de trainerboards op naam, en kopieer het board-ID voor sectie 2 hieronder.</p>
      <div className="ml-sales__actie-knoppen">
        <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={bezig} onClick={haalOp}>
          {bezig ? "Bezig…" : "Haal boards op"}
        </button>
        {boards && <KopieerKnop data={boards} />}
      </div>
      {fout && <p className="ml-sales__kaart-tekst" style={{ color: "#dc2626" }}>Fout: {fout}</p>}
      {boards && (
        <>
          <table className="ml-sales__tabel" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Board-ID</th>
                <th>Naam</th>
                <th>Items</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {boards.map((b) => (
                <tr key={b.id}>
                  <td><code>{b.id}</code></td>
                  <td>{b.name}</td>
                  <td>{b.items_count ?? "—"}</td>
                  <td>{b.state ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <JsonBlok data={boards} />
        </>
      )}
    </div>
  );
}

interface MondayColumnValue {
  id: string;
  text: string | null;
  value: string | null;
}
interface MondayBoardStructuur {
  id: string;
  name: string;
  groups: { id: string; title: string }[];
  columns: { id: string; title: string; type: string }[];
  items: {
    id: string;
    name: string;
    groupId: string | null;
    groupTitle: string | null;
    columnValues: MondayColumnValue[];
    subitems: { id: string; name: string; columnValues: MondayColumnValue[] }[];
  }[];
  meerItemsBeschikbaar: boolean;
}

function BoardStructuurSectie() {
  const [boardId, setBoardId] = useState("");
  const [itemsLimit, setItemsLimit] = useState("30");
  const [structuur, setStructuur] = useState<MondayBoardStructuur | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function haalOp() {
    if (!boardId.trim()) return;
    setBezig(true);
    setFout(null);
    const { ok, data, fout: f } = await apiPost<{ structuur: MondayBoardStructuur }>("/api/trainers-diagnose/monday/board", {
      boardId: boardId.trim(),
      itemsLimit: Number(itemsLimit) || undefined,
    });
    if (ok && data) setStructuur(data.structuur);
    else setFout(f);
    setBezig(false);
  }

  return (
    <div className="ml-sales__section">
      <h2>2. Boardstructuur — groepen, kolommen, items, subitems</h2>
      <p className="ml-sales__kaart-tekst">Beantwoordt B/C/D: kolomnamen + echte column-ID&apos;s + type, group/item/subitem-opbouw, en de ruwe column_values waarin een board_relation-koppeling (bijv. naar Master Data of Contactpersonen) zichtbaar is.</p>
      <div className="ml-sales__filter-balk">
        <input type="text" value={boardId} onChange={(e) => setBoardId(e.target.value)} placeholder="Board-ID" aria-label="Board-ID" />
        <input type="number" value={itemsLimit} onChange={(e) => setItemsLimit(e.target.value)} placeholder="Max. items (≤30)" aria-label="Max. items" style={{ width: 140 }} />
        <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={!boardId.trim() || bezig} onClick={haalOp}>
          {bezig ? "Bezig…" : "Haal structuur op"}
        </button>
      </div>
      {fout && <p className="ml-sales__kaart-tekst" style={{ color: "#dc2626" }}>Fout: {fout}</p>}
      {structuur && (
        <div style={{ marginTop: 12 }}>
          <p className="ml-sales__kaart-tekst">
            <strong>{structuur.name}</strong> ({structuur.id}) — {structuur.groups.length} groep(en), {structuur.columns.length} kolom(men), {structuur.items.length} item(s) opgehaald
            {structuur.meerItemsBeschikbaar ? " (er zijn er meer — verhoog Max. items)" : ""}.
          </p>

          <h3>Kolommen (id + titel + type)</h3>
          <table className="ml-sales__tabel">
            <thead>
              <tr><th>Column-ID</th><th>Titel</th><th>Type</th></tr>
            </thead>
            <tbody>
              {structuur.columns.map((c) => (
                <tr key={c.id}><td><code>{c.id}</code></td><td>{c.title}</td><td>{c.type}</td></tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 16 }}>Groepen</h3>
          <table className="ml-sales__tabel">
            <thead><tr><th>Group-ID</th><th>Titel</th></tr></thead>
            <tbody>
              {structuur.groups.map((g) => (
                <tr key={g.id}><td><code>{g.id}</code></td><td>{g.title}</td></tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 16 }}>Items (met ruwe column_values + subitems)</h3>
          <div className="ml-sales__actie-knoppen">
            <KopieerKnop data={structuur} label="Kopieer volledige structuur als JSON" />
          </div>
          <JsonBlok data={structuur.items} />
        </div>
      )}
    </div>
  );
}

interface MondayItemDetailColumnValue {
  id: string;
  title: string;
  type: string;
  text: string | null;
  value: string | null;
}
interface MondayItemDetail {
  id: string;
  name: string;
  group: { id: string; title: string } | null;
  board: { id: string; name: string } | null;
  columnValues: MondayItemDetailColumnValue[];
}

function ItemNaarBoardSectie() {
  const [itemId, setItemId] = useState("");
  const [resultaat, setResultaat] = useState<MondayItemDetail | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function zoek() {
    if (!itemId.trim()) return;
    setBezig(true);
    setFout(null);
    const { ok, data, fout: f } = await apiPost<{ item: MondayItemDetail }>("/api/trainers-diagnose/monday/item-board", { itemId: itemId.trim() });
    if (ok && data) setResultaat(data.item);
    else setFout(f);
    setBezig(false);
  }

  return (
    <div className="ml-sales__section">
      <h2>3. Item → board opzoeken</h2>
      <p className="ml-sales__kaart-tekst">Plak een item-ID dat je in een board_relation-kolomwaarde hierboven tegenkomt (bijv. in de <code>value</code>-JSON, als <code>linkedPulseIds</code>) — dit haalt het volledige detail op: groep, board én ALLE column_values (nooit ingekort). Zo bevestig je of een Master ID-kandidaatkolom naar &quot;1: Scholen (Master Data)&quot; wijst, of ontdek je het board-ID van &quot;8: Contactpersonen&quot;.</p>
      <div className="ml-sales__filter-balk">
        <input type="text" value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="Item-ID" aria-label="Item-ID" />
        <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={!itemId.trim() || bezig} onClick={zoek}>
          {bezig ? "Bezig…" : "Zoek item"}
        </button>
      </div>
      {fout && <p className="ml-sales__kaart-tekst" style={{ color: "#dc2626" }}>Fout: {fout}</p>}
      {resultaat && (
        <div style={{ marginTop: 12 }}>
          <table className="ml-sales__tabel">
            <tbody>
              <tr><td>Item-ID</td><td><code>{resultaat.id}</code></td></tr>
              <tr><td>Itemnaam</td><td>{resultaat.name}</td></tr>
              <tr>
                <td>Groep</td>
                <td>{resultaat.group ? <>{resultaat.group.title} (<code>{resultaat.group.id}</code>)</> : "onbekend"}</td>
              </tr>
              <tr>
                <td>Board</td>
                <td>{resultaat.board ? <>{resultaat.board.name} (<code>{resultaat.board.id}</code>)</> : "onbekend"}</td>
              </tr>
            </tbody>
          </table>

          <h3 style={{ marginTop: 16 }}>Column_values ({resultaat.columnValues.length})</h3>
          <table className="ml-sales__tabel">
            <thead>
              <tr><th>Column-ID</th><th>Titel</th><th>Type</th><th>Text</th><th>Ruwe value</th></tr>
            </thead>
            <tbody>
              {resultaat.columnValues.map((cv) => (
                <tr key={cv.id}>
                  <td><code>{cv.id}</code></td>
                  <td>{cv.title || "—"}</td>
                  <td>{cv.type || "—"}</td>
                  <td>{cv.text ?? "—"}</td>
                  <td style={{ wordBreak: "break-all", fontFamily: "monospace", fontSize: 12 }}>{cv.value ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="ml-sales__actie-knoppen" style={{ marginTop: 12 }}><KopieerKnop data={resultaat} /></div>
        </div>
      )}
    </div>
  );
}

interface MondayUpdate {
  id: string;
  item_id: string;
  text_body: string;
  created_at: string;
  creator: { id: string; name: string } | null;
}
interface SchoolOptie {
  id: number;
  schoolName: string;
  mondayItemId: string;
}

function UpdatesSectie() {
  const [itemId, setItemId] = useState("");
  const [scholen, setScholen] = useState<SchoolOptie[]>([]);
  const [updates, setUpdates] = useState<MondayUpdate[] | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sales-schools?depth=0&sort=schoolName&limit=1000", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { docs: [] }))
      .then((d: { docs?: SchoolOptie[] }) => setScholen(d.docs ?? []));
  }, []);

  async function haalOp() {
    if (!itemId.trim()) return;
    setBezig(true);
    setFout(null);
    const { ok, data, fout: f } = await apiPost<{ updates: MondayUpdate[] }>("/api/trainers-diagnose/monday/updates", { itemId: itemId.trim() });
    if (ok && data) setUpdates(data.updates);
    else setFout(f);
    setBezig(false);
  }

  return (
    <div className="ml-sales__section">
      <h2>4. Updates/logboek voor een item</h2>
      <p className="ml-sales__kaart-tekst">Werkt voor élk item-ID. Plak een trainingsitem/subitem-ID om te zien waar het trainingsverslag terecht zou komen — of kies hieronder een bekende Master Data-school om het CENTRALE schoollogboek te bekijken (haar <code>mondayItemId</code> wordt automatisch ingevuld).</p>
      <div className="ml-sales__filter-balk">
        <select
          onChange={(e) => e.target.value && setItemId(e.target.value)}
          defaultValue=""
          aria-label="Test met een bekende Master Data-school"
        >
          <option value="">Test met een bekende Master Data-school…</option>
          {scholen.map((s) => (
            <option key={s.id} value={s.mondayItemId}>{s.schoolName}</option>
          ))}
        </select>
        <input type="text" value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="Item-ID" aria-label="Item-ID" />
        <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={!itemId.trim() || bezig} onClick={haalOp}>
          {bezig ? "Bezig…" : "Haal Updates op"}
        </button>
      </div>
      {fout && <p className="ml-sales__kaart-tekst" style={{ color: "#dc2626" }}>Fout: {fout}</p>}
      {updates && (
        <div style={{ marginTop: 12 }}>
          <p className="ml-sales__kaart-tekst">{updates.length} update(s) gevonden (max. 30).</p>
          {updates.map((u) => (
            <div className="ml-sales__kaart" key={u.id} style={{ marginBottom: 8 }}>
              <p className="ml-sales__kaart-tekst"><strong>{u.creator?.name ?? "onbekend"}</strong> — {u.created_at}</p>
              <p className="ml-sales__kaart-tekst" style={{ whiteSpace: "pre-line" }}>{u.text_body}</p>
            </div>
          ))}
          <div className="ml-sales__actie-knoppen"><KopieerKnop data={updates} /></div>
        </div>
      )}
    </div>
  );
}

interface MondayRelatieDoelboard {
  id: string;
  name: string | null;
}
interface MondayRelatieAfhankelijkeMirror {
  id: string;
  title: string;
}
interface MondayBoardRelationKolom {
  id: string;
  title: string;
  doelboards: MondayRelatieDoelboard[];
  vermoedelijkBidirectioneel: boolean;
  afhankelijkeMirrorKolommen: MondayRelatieAfhankelijkeMirror[];
  ruweSettings: string | null;
}
interface MondayMirrorKolom {
  id: string;
  title: string;
  bronRelatieKolom: { id: string; title: string } | null;
  weergegevenKolomId: string | null;
  ruweSettings: string | null;
}
interface MondayBoardRelatieAnalyse {
  boardId: string;
  boardName: string;
  boardRelationKolommen: MondayBoardRelationKolom[];
  mirrorKolommen: MondayMirrorKolom[];
}

// De 4 specifiek genoemde boards uit de opdracht — statisch, want dit zijn
// de exacte ID's die de opdracht zelf aanlevert (geen live opzoeking nodig).
// Persoonlijke trainerboards hebben bewust geen vaste ID hier: die zijn per
// trainer verschillend, te vinden via sectie 1 hierboven.
const BEKENDE_RELATIE_BOARDS = [
  { id: "18420120466", label: "4: Uitvoering (Trainingen)" },
  { id: "18420120365", label: "1: Scholen (Master Data)" },
  { id: "18420120416", label: "8: Contactpersonen" },
  { id: "18420120602", label: "5: Uitvoerder training" },
];

function BoardRelatiesSectie() {
  const [boardId, setBoardId] = useState("");
  const [analyse, setAnalyse] = useState<MondayBoardRelatieAnalyse | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function analyseer() {
    if (!boardId.trim()) return;
    setBezig(true);
    setFout(null);
    const { ok, data, fout: f } = await apiPost<{ analyse: MondayBoardRelatieAnalyse }>("/api/trainers-diagnose/monday/relations", { boardId: boardId.trim() });
    if (ok && data) setAnalyse(data.analyse);
    else setFout(f);
    setBezig(false);
  }

  return (
    <div className="ml-sales__section">
      <h2>5. Connect Boards- en mirror-relaties</h2>
      <p className="ml-sales__kaart-tekst">
        Analyseert per board_relation-kolom (Connect Boards) naar welk(e) doelboard(en) deze wijst en welke mirror-kolommen daarvan afhankelijk zijn —
        t.b.v. de relatiearchitectuur tussen persoonlijke trainerboards, &quot;4: Uitvoering (Trainingen)&quot;, &quot;1: Scholen (Master Data)&quot;,
        &quot;8: Contactpersonen&quot; en &quot;5: Uitvoerder training&quot;.
      </p>
      <p className="ml-sales__kaart-tekst">
        <strong>Let op:</strong>{" "}&quot;vermoedelijk bidirectioneel&quot; is een heuristiek (het doelboard heeft zelf een Connect Boards-kolom die
        terugwijst) — Monday&apos;s API biedt hiervoor geen officiële vlag. Controleer bij twijfel de ruwe settings hieronder.
      </p>
      <div className="ml-sales__filter-balk">
        <select onChange={(e) => e.target.value && setBoardId(e.target.value)} defaultValue="" aria-label="Bekend board kiezen">
          <option value="">Kies een bekend board…</option>
          {BEKENDE_RELATIE_BOARDS.map((b) => (
            <option key={b.id} value={b.id}>{b.label}</option>
          ))}
        </select>
        <input type="text" value={boardId} onChange={(e) => setBoardId(e.target.value)} placeholder="Board-ID" aria-label="Board-ID voor relatieanalyse" />
        <button type="button" className="ml-sales__knop ml-sales__knop--primair" disabled={!boardId.trim() || bezig} onClick={analyseer}>
          {bezig ? "Bezig…" : "Analyseer relaties"}
        </button>
      </div>
      {fout && <p className="ml-sales__kaart-tekst" style={{ color: "#dc2626" }}>Fout: {fout}</p>}
      {analyse && (
        <div style={{ marginTop: 12 }}>
          <p className="ml-sales__kaart-tekst">
            <strong>{analyse.boardName}</strong> (<code>{analyse.boardId}</code>) — {analyse.boardRelationKolommen.length} Connect Boards-kolom(men),{" "}
            {analyse.mirrorKolommen.length} mirror-kolom(men).
          </p>

          <h3 style={{ marginTop: 16 }}>Connect Boards-kolommen (board_relation)</h3>
          {analyse.boardRelationKolommen.length === 0 && <p className="ml-sales__kaart-tekst">Geen board_relation-kolommen op dit board.</p>}
          {analyse.boardRelationKolommen.map((k) => (
            <div className="ml-sales__kaart" key={k.id} style={{ marginBottom: 8 }}>
              <p className="ml-sales__kaart-tekst">
                <strong>{k.title}</strong> (<code>{k.id}</code>) —{" "}
                {k.vermoedelijkBidirectioneel ? (
                  <span>↔ vermoedelijk bidirectioneel <em>(heuristiek — geen officiële Monday-vlag)</em></span>
                ) : (
                  <span>→ geen terugwijzing gevonden (of niet vast te stellen)</span>
                )}
              </p>
              <p className="ml-sales__kaart-tekst">
                Doelboard(en):{" "}
                {k.doelboards.length === 0
                  ? "geen (geen boardIds in settings_str herkend)"
                  : k.doelboards.map((d) => `${d.name ?? "onbekend"} (${d.id})`).join(", ")}
              </p>
              <p className="ml-sales__kaart-tekst">
                Afhankelijke mirror-kolommen:{" "}
                {k.afhankelijkeMirrorKolommen.length === 0 ? "geen" : k.afhankelijkeMirrorKolommen.map((m) => `${m.title} (${m.id})`).join(", ")}
              </p>
              <p className="ml-sales__kaart-tekst" style={{ wordBreak: "break-all", fontFamily: "monospace", fontSize: 12 }}>
                Ruwe settings: {k.ruweSettings ?? "—"}
              </p>
            </div>
          ))}

          <h3 style={{ marginTop: 16 }}>Mirror-kolommen</h3>
          {analyse.mirrorKolommen.length === 0 && <p className="ml-sales__kaart-tekst">Geen mirror-kolommen op dit board.</p>}
          {analyse.mirrorKolommen.map((m) => (
            <div className="ml-sales__kaart" key={m.id} style={{ marginBottom: 8 }}>
              <p className="ml-sales__kaart-tekst">
                <strong>{m.title}</strong> (<code>{m.id}</code>)
              </p>
              <p className="ml-sales__kaart-tekst">
                Bron-relatiekolom: {m.bronRelatieKolom ? `${m.bronRelatieKolom.title} (${m.bronRelatieKolom.id})` : "niet herkend"}
              </p>
              <p className="ml-sales__kaart-tekst">Weergegeven kolom-ID op doelboard: {m.weergegevenKolomId ?? "niet herkend"}</p>
              <p className="ml-sales__kaart-tekst" style={{ wordBreak: "break-all", fontFamily: "monospace", fontSize: 12 }}>
                Ruwe settings: {m.ruweSettings ?? "—"}
              </p>
            </div>
          ))}

          <div className="ml-sales__actie-knoppen" style={{ marginTop: 12 }}><KopieerKnop data={analyse} /></div>
        </div>
      )}
    </div>
  );
}

function DiagnoseInner() {
  return (
    <div className="ml-sales">
      <div className="ml-sales__header" style={{ background: "var(--theme-elevation-50)", border: "1px solid var(--ml-admin-accent)", borderRadius: "var(--ml-admin-radius)", padding: 16 }}>
        <h1>🔍 Traineromgeving — Monday-diagnose (tijdelijk, alleen-lezen)</h1>
        <p>
          Dit scherm doet uitsluitend Monday-leesaanroepen — geen enkele knop hier schrijft iets terug. Doel: de echte structuur van de
          trainerboards vaststellen (welke boards, kolom-ID&apos;s, group/item/subitem-opbouw, relatie met &quot;1: Scholen (Master Data)&quot;,
          Contactpersonenstructuur, en waar Updates/logboek staan) vóór er ook maar iets aan de Traineromgeving zelf gebouwd wordt.
          Verwijder dit scherm zodra dat onderzoek is afgerond.
        </p>
      </div>
      <BoardsSectie />
      <BoardStructuurSectie />
      <ItemNaarBoardSectie />
      <UpdatesSectie />
      <BoardRelatiesSectie />
    </div>
  );
}

export function TrainersMondayDiagnoseView() {
  const { user } = useAuth();
  if (!user || (user as { role?: string }).role !== "admin") {
    return <div className="ml-sales__leeg">Geen toegang — dit diagnosescherm is alleen voor beheerders.</div>;
  }
  return <DiagnoseInner />;
}
