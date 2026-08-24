"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  AdminTrainerBasis,
  AdminTrainerOverzichtTab,
  AdminTrainerVerslagRegel,
  AdminTrainerOproepRegel,
  AdminTrainerBestandenTab,
} from "@/lib/admin/trainers/trainerdetail";
import type { TrainerScholenResultaat, TrainingMetSchool } from "@/lib/trainers/monday-links";
import type { LogboekItemRecord, LogboekType } from "@/lib/trainers/logboek";
import type { TodoItem } from "@/lib/trainers/dashboard";
import { TODO_ICOON, TODO_CTA_LABEL, todoTijdLabel } from "@/lib/trainers/todo-styles";
import { ACTIVITEIT_LABEL, ACTIVITEIT_ICOON } from "@/lib/trainers/activiteit-styles";
import { groepeerOpWeergaveStatus, type TrainingWeergaveStatus } from "@/lib/trainers/training-weergave";
import { formatKorteDatum, formatKorteDatumTijd, vandaagIso } from "@/lib/sales/format-datum";
import { NAV_COLOR_STYLES, type NavColor } from "@/lib/admin-nav/nav-colors";
import { VERSLAG_STATUS_KLEUR, WRITEBACK_STATUS_KLEUR, TELEFONIE_STATUS_KLEUR, WEERGAVE_STATUS_KLEUR, TODO_SOORT_KLEUR, trainerActiefKleur } from "@/lib/admin/trainers/status-kleuren";
import { AdminStatusBadge } from "./AdminStatusBadge";

// Traineromgeving V2, Fase 4 (2026-08-24) — Admin Trainerdetail (spec §3).
// "Bijna hetzelfde beeld als de trainer zelf ziet, in admin-context" —
// hergebruikt daarom de trainerportal se eigen label-/icoonmappings
// (TODO_ICOON/-CTA_LABEL/todoTijdLabel, ACTIVITEIT_LABEL/-ICOON,
// LOGBOEK_TYPE_LABEL, groepeerOpWeergaveStatus) zodat dezelfde onderliggende
// data ook dezelfde bewoording krijgt — geen tweede interpretatie. De
// visuele SHELL (kaarten/tabellen/badges) is wél de admin-eigen
// ml-sales__*-taal (spec §16), niet de Tailwind-gestylede portal-JSX zelf
// (andere bundel, ander CSS-systeem — rechtstreeks hergebruik van
// portal-componenten zou hier niet renderen).
//
// EXPLICIET GEEN impersonation-login, GEEN inline-edits (spec §8): elke tab
// hieronder is uitsluitend lezen — geen enkele knop hier wijzigt een
// verslag/training/telefonie-status.
//
// Elke tab wordt LAZY opgehaald (pas bij eerste keer openen, dan gecachet in
// React-state) — zie lib/admin/trainers/trainerdetail.ts se moduletoelichting
// voor de reden (voorkomt 3x dezelfde Monday-boarddata per paginalading).

const TABS = ["overzicht", "scholen", "trainingen", "verslagen", "logboek", "telefonie", "bestanden"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  overzicht: "Overzicht",
  scholen: "Scholen",
  trainingen: "Trainingen",
  verslagen: "Verslagen",
  logboek: "Logboek",
  telefonie: "Telefonie",
  bestanden: "Bestanden",
};

async function apiGetOne<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

function isTab(waarde: string | null): waarde is Tab {
  return (TABS as readonly string[]).includes(waarde ?? "");
}

const VERSLAG_STATUS_LABEL: Record<AdminTrainerVerslagRegel["status"], string> = {
  concept: "Concept",
  gedeeltelijk: "Gedeeltelijk",
  bevestigd: "Bevestigd",
  voltooid: "Voltooid",
};
const WRITEBACK_STATUS_LABEL: Record<AdminTrainerVerslagRegel["trainingUpdateStatus"], string> = {
  niet_verzonden: "Niet verzonden",
  bezig: "Bezig",
  geschreven: "Geschreven",
  mislukt: "Mislukt",
  niet_geactiveerd: "Niet actief",
};
// Letterlijke kopie van lib/trainers/logboek.ts se LOGBOEK_TYPE_LABEL — niet
// rechtstreeks geïmporteerd: dat bestand importeert monday-links.ts (live
// Monday-API-code) op runtime-niveau, niet veilig om in een "use
// client"-component te bundelen (zelfde reden als lib/sales/format-datum.ts
// se TYPE_LABEL-toelichting). Bij een wijziging aan LOGBOEK_TYPES/-LABEL
// ook hier bijwerken.
const LOGBOEK_TYPE_LABEL: Record<LogboekType, string> = {
  telefonisch: "Telefonisch",
  helpdesk: "Helpdesk",
  overleg: "Overleg",
  notitie: "Notitie",
  overig: "Overig",
};

const WEERGAVE_STATUS_LABEL: Record<TrainingWeergaveStatus, string> = {
  open: "Open",
  vandaag: "Vandaag",
  komend: "Komend",
  verslag_nog_invullen: "Verslag nog invullen",
  gedaan: "Gedaan",
  geannuleerd: "Geannuleerd",
};

/**
 * Leest uitsluitend de URL-parameters en delegeert meteen naar een op
 * trainerId GEKEYDE instantie van DetailVoorTrainer — bij een wissel van
 * trainer (nieuwe ?id=) mount React die instantie dus volledig opnieuw, met
 * verse useState-initiële waarden voor élke tab-cache. Dat voorkomt zowel een
 * subtiele bug (zonder key zou de bestaande "if (!overzicht) ..."-cachecheck
 * hieronder de vorige trainer se al-opgehaalde tabbladdata blijven tonen na
 * een wissel) als de noodzaak om ergens synchroon setState() binnen een
 * effect te callen om die cache handmatig te resetten
 * (react-hooks/set-state-in-effect) — zie DetailVoorTrainer se eigen
 * toelichting bij tabLaden hieronder voor dezelfde reden bij het tabblad-laden
 * zelf.
 */
function DetailInner() {
  const searchParams = useSearchParams();
  const trainerId = searchParams.get("id");
  const initialTab: Tab = isTab(searchParams.get("tab")) ? (searchParams.get("tab") as Tab) : "overzicht";

  if (!trainerId) return <div className="ml-sales__leeg">Geen trainer geselecteerd.</div>;
  return <DetailVoorTrainer key={trainerId} trainerId={trainerId} initialTab={initialTab} />;
}

function DetailVoorTrainer({ trainerId, initialTab }: { trainerId: string; initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);

  const [basis, setBasis] = useState<AdminTrainerBasis | null>(null);
  const [basisLaden, setBasisLaden] = useState(true);
  const [nietGevonden, setNietGevonden] = useState(false);

  const [overzicht, setOverzicht] = useState<AdminTrainerOverzichtTab | null>(null);
  const [scholen, setScholen] = useState<TrainerScholenResultaat | null>(null);
  const [trainingen, setTrainingen] = useState<TrainingMetSchool[] | null>(null);
  const [verslagen, setVerslagen] = useState<AdminTrainerVerslagRegel[] | null>(null);
  const [logboek, setLogboek] = useState<LogboekItemRecord[] | null>(null);
  const [telefonie, setTelefonie] = useState<AdminTrainerOproepRegel[] | null>(null);
  const [bestanden, setBestanden] = useState<AdminTrainerBestandenTab | null>(null);
  // Welke tabbladen voor DEZE trainer al zijn opgehaald — een ref (niet
  // useState): puur boekhouding voor laadTab hieronder, zelf nooit
  // rechtstreeks gerenderd. Dit is ook wat tabLaden hieronder afleidt, i.p.v.
  // een aparte setTabLaden(true)-aanroep vlak vóór de eerste await in
  // laadTab — dat zou opnieuw een synchrone setState() binnen het
  // tab-wissel-effect hieronder betekenen (react-hooks/set-state-in-effect).
  // ÉCHTE state (geen ref): een ref se .current mag nooit tijdens render
  // gelezen worden (react-hooks/refs) — tabLaden hieronder leest dit rechtstreeks.
  const [opgehaaldeTabs, setOpgehaaldeTabs] = useState<Set<Tab>>(new Set());

  useEffect(() => {
    apiGetOne<AdminTrainerBasis>(`/api/admin/trainers/detail?id=${trainerId}&tab=basis`).then((data) => {
      setBasis(data);
      setNietGevonden(!data);
      setBasisLaden(false);
    });
  }, [trainerId]);

  // Inline fetch-met-ignore-vlag (zie TrainersOverzichtView.tsx se
  // toelichting) — GEEN losse useCallback-functie aanroepen vanuit het
  // effect: dat triggert react-hooks/set-state-in-effect (ESLint kan niet
  // statisch bewijzen dat zo'n externe functiereferentie pas ná een await
  // setState aanroept). Elk tabblad wordt maar één keer per trainer
  // opgehaald — de cachecheck zit nu in de guard hieronder i.p.v. in een
  // aparte functie.
  useEffect(() => {
    if (opgehaaldeTabs.has(tab)) return;
    let genegeerd = false;
    apiGetOne(`/api/admin/trainers/detail?id=${trainerId}&tab=${tab}`).then((data) => {
      if (genegeerd) return;
      // Ook bij data === null (bv. Monday-afhankelijke tab die 500 teruggeeft)
      // dit tabblad als "afgehandeld" markeren — anders blijft tabLaden voor
      // altijd true (geen enkele dependency hieronder wijzigt dan nog) en
      // toont de pagina oneindig "Laden…" in plaats van een eerlijke
      // foutmelding. De tab-render hieronder toont "Kon dit tabblad niet
      // laden." wanneer de bijbehorende data-state null blijft.
      if (data !== null) {
        switch (tab) {
          case "overzicht":
            setOverzicht(data as AdminTrainerOverzichtTab);
            break;
          case "scholen":
            setScholen(data as TrainerScholenResultaat);
            break;
          case "trainingen":
            setTrainingen(data as TrainingMetSchool[]);
            break;
          case "verslagen":
            setVerslagen(data as AdminTrainerVerslagRegel[]);
            break;
          case "logboek":
            setLogboek(data as LogboekItemRecord[]);
            break;
          case "telefonie":
            setTelefonie(data as AdminTrainerOproepRegel[]);
            break;
          case "bestanden":
            setBestanden(data as AdminTrainerBestandenTab);
            break;
        }
      }
      setOpgehaaldeTabs((prev) => new Set(prev).add(tab));
    });
    return () => {
      genegeerd = true;
    };
  }, [tab, trainerId, opgehaaldeTabs]);

  const tabLaden = !opgehaaldeTabs.has(tab);

  if (basisLaden) return <div className="ml-sales__leeg">Laden…</div>;
  if (nietGevonden || !basis) return <div className="ml-sales__leeg">Trainer niet gevonden.</div>;

  return (
    <div className="ml-sales">
      <div className="ml-sales__header">
        <h1>{basis.naam}</h1>
        <div className="ml-sales__schooldetail-meta">
          <AdminStatusBadge label={basis.actief ? "Actief" : "Inactief"} kleur={trainerActiefKleur(basis.actief)} />
          <span className="ml-sales__badge">{basis.email}</span>
          {basis.telefonieActief && <AdminStatusBadge label="Telefonische verslaglegging aan" kleur="teal" />}
          {basis.mobielNummer && <span className="ml-sales__badge">{basis.mobielNummer}</span>}
        </div>
      </div>

      <div className="ml-sales-widget__tabs">
        {TABS.map((t) => (
          <button key={t} type="button" className={`ml-sales-widget__tab${tab === t ? " ml-sales-widget__tab--actief" : ""}`} onClick={() => setTab(t)}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tabLaden && <div className="ml-sales__leeg">Laden…</div>}

      {!tabLaden && tab === "overzicht" && (overzicht ? <OverzichtTab data={overzicht} /> : <TabFoutmelding />)}
      {!tabLaden && tab === "scholen" && (scholen ? <ScholenTab data={scholen} /> : <TabFoutmelding />)}
      {!tabLaden && tab === "trainingen" && (trainingen ? <TrainingenTab data={trainingen} /> : <TabFoutmelding />)}
      {!tabLaden && tab === "verslagen" && (verslagen ? <VerslagenTab data={verslagen} /> : <TabFoutmelding />)}
      {!tabLaden && tab === "logboek" && (logboek ? <LogboekTab data={logboek} /> : <TabFoutmelding />)}
      {!tabLaden && tab === "telefonie" && (telefonie ? <TelefonieTab data={telefonie} /> : <TabFoutmelding />)}
      {!tabLaden && tab === "bestanden" && (bestanden ? <BestandenTab data={bestanden} /> : <TabFoutmelding />)}
    </div>
  );
}

function TabFoutmelding() {
  return <div className="ml-sales__leeg">Kon dit tabblad niet laden.</div>;
}

function MiniKpiKaart({ waarde, label, kleur }: { waarde: number; label: string; kleur: NavColor }) {
  return (
    <div className="ml-sales__kaart" style={{ textAlign: "center" }}>
      <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: NAV_COLOR_STYLES[kleur].fg }}>{waarde}</p>
      <p className="ml-sales__kaart-tekst" style={{ margin: 0 }}>
        {label}
      </p>
    </div>
  );
}

function OverzichtTab({ data }: { data: AdminTrainerOverzichtTab }) {
  const { dashboard, kennisQa } = data;
  return (
    <>
      <div className="ml-sales__kaarten-rij" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <MiniKpiKaart waarde={dashboard.statistieken.totaalTrainingen} label="Trainingen totaal" kleur="blue" />
        <MiniKpiKaart waarde={dashboard.statistieken.aantalScholen} label="Scholen" kleur="teal" />
        <MiniKpiKaart waarde={dashboard.statistieken.verslagenAfgerond} label="Verslagen afgerond" kleur="green" />
        <MiniKpiKaart waarde={kennisQa.aantalVragen} label={`Kennisvragen (${kennisQa.laatsteNDagen}d)`} kleur="purple" />
      </div>

      {kennisQa.aantalVragen > 0 && (
        <p className="ml-sales__kaart-tekst">
          {kennisQa.percentageMetAntwoord}% met antwoord, {kennisQa.aantalZonderAntwoord} zonder antwoord.
        </p>
      )}

      {dashboard.todo.length > 0 && (
        <div className="ml-sales__section">
          <h2>To do ({dashboard.todo.length})</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {dashboard.todo.map((item: TodoItem, i: number) => {
              const Icoon = TODO_ICOON[item.soort];
              return (
                <li key={i} className="ml-sales__kaart-tekst">
                  <Icoon size={13} aria-hidden="true" style={{ verticalAlign: "middle", marginRight: 4, color: NAV_COLOR_STYLES[TODO_SOORT_KLEUR[item.soort]].fg }} />
                  {item.trainingNaam} — {item.schoolNaam} · {TODO_CTA_LABEL[item.soort]} · {todoTijdLabel(item)}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="ml-sales__section">
        <h2>Vandaag / komend</h2>
        {dashboard.vandaag.length === 0 && dashboard.komendVolgende.length === 0 ? (
          <p className="ml-sales__kaart-tekst">Geen trainingen vandaag of eerstkomend gepland.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {[...dashboard.vandaag, ...dashboard.komendVolgende].map((t) => (
              <li key={t.id} className="ml-sales__kaart-tekst">
                {formatKorteDatum(t.datum)} — {t.naam} ({t.schoolNaam})
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="ml-sales__section">
        <h2>Recente activiteit</h2>
        {dashboard.recenteActiviteit.length === 0 ? (
          <p className="ml-sales__kaart-tekst">Nog geen activiteit.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {dashboard.recenteActiviteit.map((item, i) => {
              const Icoon = ACTIVITEIT_ICOON[item.soort];
              return (
                <li key={i} className="ml-sales__kaart-tekst">
                  <Icoon size={13} aria-hidden="true" style={{ verticalAlign: "middle", marginRight: 4 }} />
                  {formatKorteDatumTijd(item.wanneer)} — {ACTIVITEIT_LABEL[item.soort]}: {item.titel} ({item.schoolNaam})
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function ScholenTab({ data }: { data: TrainerScholenResultaat }) {
  if (data.bevestigd.length === 0) return <div className="ml-sales__leeg">Geen gekoppelde scholen.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="ml-sales__tabel">
        <thead>
          <tr>
            <th>School</th>
            <th>Onderwijstype</th>
            <th>Locatie</th>
            <th>Open</th>
            <th>Gepland</th>
            <th>Gedaan</th>
            <th>Eerstvolgende training</th>
          </tr>
        </thead>
        <tbody>
          {data.bevestigd.map((school) => (
            <tr key={school.id}>
              <td>
                <Link href={`/admin/trainers/school?id=${school.id}`}>{school.naam}</Link>
              </td>
              <td className={school.onderwijstype ? undefined : "ml-sales__ontbrekend"}>{school.onderwijstype || "—"}</td>
              <td className={school.locatie ? undefined : "ml-sales__ontbrekend"}>{school.locatie || "—"}</td>
              <td>{school.aantalOpen}</td>
              <td>{school.aantalGepland}</td>
              <td>{school.aantalGedaan}</td>
              <td className={school.eerstvolgendeTraining ? undefined : "ml-sales__ontbrekend"}>
                {school.eerstvolgendeTraining ? `${school.eerstvolgendeTraining.naam} (${formatKorteDatum(school.eerstvolgendeTraining.datum)})` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrainingenTab({ data }: { data: TrainingMetSchool[] }) {
  const groepen = groepeerOpWeergaveStatus(data, vandaagIso());
  const volgorde: TrainingWeergaveStatus[] = ["verslag_nog_invullen", "vandaag", "komend", "open", "gedaan", "geannuleerd"];
  return (
    <>
      {volgorde
        .filter((status) => groepen[status].length > 0)
        .map((status) => (
          <div className="ml-sales__section" key={status}>
            <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="ml-sales__status-stip" style={{ background: NAV_COLOR_STYLES[WEERGAVE_STATUS_KLEUR[status]].fg }} />
              {WEERGAVE_STATUS_LABEL[status]} ({groepen[status].length})
            </h2>
            <div style={{ overflowX: "auto" }}>
              <table className="ml-sales__tabel">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Training</th>
                    <th>School</th>
                    <th>Logboek ingevuld</th>
                  </tr>
                </thead>
                <tbody>
                  {groepen[status].map((t) => (
                    <tr key={t.id}>
                      <td className={t.datum ? undefined : "ml-sales__ontbrekend"}>{formatKorteDatum(t.datum)}</td>
                      <td>{t.naam}</td>
                      <td>{t.schoolNaam}</td>
                      <td>{t.logboekIngevuld ? "Ja" : "Nee"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </>
  );
}

function VerslagenTab({ data }: { data: AdminTrainerVerslagRegel[] }) {
  if (data.length === 0) return <div className="ml-sales__leeg">Nog geen verslagen.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="ml-sales__tabel">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Training</th>
            <th>School</th>
            <th>Status</th>
            <th>Bron</th>
            <th>Training-update</th>
            <th>School-update</th>
          </tr>
        </thead>
        <tbody>
          {data.map((v) => (
            <tr key={v.verslagId}>
              <td>{formatKorteDatumTijd(v.wanneer)}</td>
              <td>{v.trainingNaam}</td>
              <td>{v.schoolNaam}</td>
              <td>
                <AdminStatusBadge label={VERSLAG_STATUS_LABEL[v.status]} kleur={VERSLAG_STATUS_KLEUR[v.status]} />
              </td>
              <td>{v.bron === "telefoon" ? "Telefonisch" : "Portal"}</td>
              <td>
                <AdminStatusBadge label={WRITEBACK_STATUS_LABEL[v.trainingUpdateStatus]} kleur={WRITEBACK_STATUS_KLEUR[v.trainingUpdateStatus]} />
              </td>
              <td>
                <AdminStatusBadge label={WRITEBACK_STATUS_LABEL[v.schoolUpdateStatus]} kleur={WRITEBACK_STATUS_KLEUR[v.schoolUpdateStatus]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogboekTab({ data }: { data: LogboekItemRecord[] }) {
  if (data.length === 0) return <div className="ml-sales__leeg">Nog geen logboekitems.</div>;
  return (
    <div className="ml-sales__logboek">
      {data.map((item) => (
        <div className="ml-sales__logboek-item" key={item.id}>
          <span className="ml-sales__logboek-stip" />
          <div>
            <div>{item.trainingNaam ?? item.tekst}</div>
            <div className="ml-sales__logboek-meta">
              {formatKorteDatumTijd(item.occurredAt)} · {LOGBOEK_TYPE_LABEL[item.type]} · {item.schoolNaam ?? "Onbekende school"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const OPROEP_STATUS_LABEL: Record<AdminTrainerOproepRegel["status"], string> = {
  ontvangen: "Ontvangen",
  trainer_herkend: "Trainer herkend",
  training_gekozen: "Training gekozen",
  opname_verwacht: "Opname verwacht",
  opname_ontvangen: "Opname ontvangen",
  transcriptie_bezig: "Transcriptie bezig",
  transcriptie_mislukt_herstelbaar: "Transcriptie mislukt (herstelbaar)",
  concept_klaar: "Concept klaar",
  verslag_bestaat_al: "Verslag bestaat al",
  mislukt: "Mislukt",
};

function TelefonieTab({ data }: { data: AdminTrainerOproepRegel[] }) {
  if (data.length === 0) return <div className="ml-sales__leeg">Geen telefonische oproepen.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="ml-sales__tabel">
        <thead>
          <tr>
            <th>Ontvangen</th>
            <th>Status</th>
            <th>Training</th>
            <th>Transcriptiepogingen</th>
            <th>Foutmelding</th>
            <th>Concept gekoppeld</th>
          </tr>
        </thead>
        <tbody>
          {data.map((o) => (
            <tr key={o.oproepId}>
              <td>{formatKorteDatumTijd(o.ontvangenOp)}</td>
              <td>
                <AdminStatusBadge label={OPROEP_STATUS_LABEL[o.status]} kleur={TELEFONIE_STATUS_KLEUR[o.status]} />
              </td>
              <td className={o.gekozenTrainingNaam ? undefined : "ml-sales__ontbrekend"}>{o.gekozenTrainingNaam ?? "—"}</td>
              <td>{o.transcriptiePogingen}</td>
              <td className={o.foutmelding ? undefined : "ml-sales__ontbrekend"}>{o.foutmelding ?? "—"}</td>
              <td>{o.verslagGekoppeld ? "Ja" : "Nee"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BestandenTab({ data }: { data: AdminTrainerBestandenTab }) {
  return (
    <>
      {data.deelgroepen.length > 0 && (
        <p className="ml-sales__kaart-tekst">
          Deelgroepen: {data.deelgroepen.map((g) => g.naam).join(", ")} —{" "}
          <Link href="/admin/collections/trainer-deelgroepen">beheer deelgroepen</Link>
        </p>
      )}
      <div className="ml-sales__section">
        <h2>Eigen bestanden ({data.eigen.length})</h2>
        {data.eigen.length === 0 ? (
          <p className="ml-sales__kaart-tekst">Geen eigen bestanden.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {data.eigen.map((b) => (
              <li key={b.id} className="ml-sales__kaart-tekst">
                <a href={`/api/trainer-bestanden/${b.id}/download`}>{b.titel}</a> · {formatKorteDatum(b.createdAt)}
                {b.schoolNaam ? ` · ${b.schoolNaam}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="ml-sales__section">
        <h2>Gedeeld met deze trainer ({data.gedeeld.length})</h2>
        {data.gedeeld.length === 0 ? (
          <p className="ml-sales__kaart-tekst">Geen gedeelde bestanden.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {data.gedeeld.map((b) => (
              <li key={b.id} className="ml-sales__kaart-tekst">
                <a href={`/api/trainer-bestanden/${b.id}/download`}>{b.titel}</a> · via {b.gedeeldViaGroepen.map((g) => g.naam).join(", ")}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function TrainerDetailView() {
  return (
    <Suspense fallback={<div className="ml-sales__leeg">Laden…</div>}>
      <DetailInner />
    </Suspense>
  );
}
