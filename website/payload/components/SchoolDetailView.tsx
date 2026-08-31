"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { CSSProperties } from "react";
import { AlertTriangle, AlertCircle, type LucideIcon } from "lucide-react";
import type {
  AdminSchoolBasis,
  AdminSchoolOverzichtTab,
  AdminSchoolTrainerRegel,
  AdminSchoolVerslagRegel,
  AdminSchoolLogboekRegel,
  AdminSchoolBestandRegel,
  AdminSchoolUpsell,
} from "@/lib/admin/trainers/schooldetail";
import type { AdminTrainingRegel } from "@/lib/admin/trainers/trainingen";
import type { AdminAandachtItem, AdminAandachtSoort } from "@/lib/admin/trainers/aandacht";
import type { AdminActiviteitSoort } from "@/lib/admin/trainers/activiteit";
import type { TodoItem } from "@/lib/trainers/dashboard";
import { TODO_ICOON, TODO_CTA_LABEL, todoTijdLabel } from "@/lib/trainers/todo-styles";
import { ACTIVITEIT_LABEL, ACTIVITEIT_ICOON } from "@/lib/trainers/activiteit-styles";
import { formatKorteDatum, formatKorteDatumTijd } from "@/lib/sales/format-datum";
import { NAV_COLOR_STYLES, type NavColor } from "@/lib/admin-nav/nav-colors";
import { VERSLAG_STATUS_KLEUR, WEERGAVE_STATUS_KLEUR, TODO_SOORT_KLEUR, AANDACHT_SOORT_KLEUR, trainerActiefKleur, activiteitSoortKleur } from "@/lib/admin/trainers/status-kleuren";
import { AdminStatusBadge } from "./AdminStatusBadge";
import { VerslagenLijst, LogboekLijst, VERSLAG_STATUS_LABEL } from "./AdminVerslagLogboek";

// Traineromgeving V2, Fase 5 (2026-08-24) — Admin Schooldetail (spec §1-§4).
// Zelfde opzet als TrainerDetailView.tsx: statisch pad + ?id=/?tab=, ÉÉN
// lazy per-tab fetch (opgehaaldeTabs-Set, key-based remount bij schoolwissel),
// dezelfde admin-eigen ml-sales__*-visuele taal en dezelfde
// status-kleuren.ts-kleurmapping (spec §11: "dezelfde visuele stijl en
// semantische kleuren als het huidige Admin Trainerdashboard"). Basis +
// Aandacht worden SAMEN, niet-lazy opgehaald (net als
// TrainersOverzichtView.tsx se overzicht+aandacht) — die twee horen bij de
// altijd-zichtbare kopregel, niet bij een specifiek tabblad.
//
// EXPLICIET GEEN impersonation-login (spec §6: V1 is read-only) — elke tab
// hieronder is uitsluitend lezen, met ÉÉN bewuste uitzondering: Correctieronde
// Admin Traineromgeving (2026-08-25, spec §2) voegt Bewerken/Verwijderen toe
// voor HANDMATIGE logboekitems op de Logboek-tab (LogboekTab hieronder) — de
// enige mutatie in deze view. Elke andere tab blijft ongewijzigd read-only.

const TABS = ["overzicht", "trainers", "trainingen", "upsell", "verslagen", "logboek", "bestanden"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  overzicht: "Overzicht",
  trainers: "Trainers",
  trainingen: "Trainingen",
  upsell: "Upsell",
  verslagen: "Verslagen",
  logboek: "Logboek",
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

const WEERGAVE_STATUS_LABEL: Record<AdminTrainingRegel["weergaveStatus"], string> = {
  open: "Open",
  vandaag: "Vandaag",
  komend: "Komend",
  verslag_nog_invullen: "Verslag nog invullen",
  gedaan: "Gedaan",
  geannuleerd: "Geannuleerd",
};
const AANDACHT_LABEL: Record<AdminAandachtSoort, string> = {
  telefonie_mislukt: "Telefonie mislukt",
  verslag_vastgelopen: "Verslag vastgelopen",
  concept_oud: "Oud concept",
};

function labelVoorActiviteit(soort: AdminActiviteitSoort): string {
  return soort === "telefonie_mislukt" ? "Telefonie mislukt" : ACTIVITEIT_LABEL[soort];
}
function icoonVoorActiviteit(soort: AdminActiviteitSoort): LucideIcon {
  return soort === "telefonie_mislukt" ? AlertCircle : ACTIVITEIT_ICOON[soort];
}

/**
 * Zelfde reden als TrainerDetailView.tsx se DetailInner: uitsluitend
 * URL-parameters lezen en direct delegeren naar een op schoolId GEKEYDE
 * instantie, zodat een schoolwissel (nieuwe ?id=) alle tab-/basis-caches
 * automatisch reset via een volledige remount.
 */
function SchoolInner() {
  const searchParams = useSearchParams();
  const schoolId = searchParams.get("id");
  const initialTab: Tab = isTab(searchParams.get("tab")) ? (searchParams.get("tab") as Tab) : "overzicht";

  if (!schoolId) return <div className="ml-sales__leeg">Geen school geselecteerd.</div>;
  return <DetailVoorSchool key={schoolId} schoolId={schoolId} initialTab={initialTab} />;
}

function DetailVoorSchool({ schoolId, initialTab }: { schoolId: string; initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);

  const [basis, setBasis] = useState<AdminSchoolBasis | null>(null);
  const [aandacht, setAandacht] = useState<AdminAandachtItem[]>([]);
  const [basisLaden, setBasisLaden] = useState(true);
  const [nietGevonden, setNietGevonden] = useState(false);

  const [overzicht, setOverzicht] = useState<AdminSchoolOverzichtTab | null>(null);
  const [trainers, setTrainers] = useState<AdminSchoolTrainerRegel[] | null>(null);
  const [trainingen, setTrainingen] = useState<AdminTrainingRegel[] | null>(null);
  const [upsell, setUpsell] = useState<AdminSchoolUpsell | null>(null);
  const [verslagen, setVerslagen] = useState<AdminSchoolVerslagRegel[] | null>(null);
  const [logboek, setLogboek] = useState<AdminSchoolLogboekRegel[] | null>(null);
  const [bestanden, setBestanden] = useState<AdminSchoolBestandRegel[] | null>(null);
  const [opgehaaldeTabs, setOpgehaaldeTabs] = useState<Set<Tab>>(new Set());

  useEffect(() => {
    let genegeerd = false;
    Promise.all([apiGetOne<AdminSchoolBasis>(`/api/admin/trainers/school?id=${schoolId}&tab=basis`), apiGetOne<AdminAandachtItem[]>(`/api/admin/trainers/school?id=${schoolId}&tab=aandacht`)]).then(
      ([basisData, aandachtData]) => {
        if (genegeerd) return;
        setBasis(basisData);
        setNietGevonden(!basisData);
        setAandacht(aandachtData ?? []);
        setBasisLaden(false);
      }
    );
    return () => {
      genegeerd = true;
    };
  }, [schoolId]);

  /**
   * Vervolgronde (Verslagen verwijderen) — een verwijderd verslag kan de
   * kopregel-tellingen (open to-do's/open verslagen) en de Aandacht-sectie
   * doen wijzigen (spec: "de bestaande actuele To-do-logica moet dat gewoon
   * correct kunnen laten zien"). Beide worden al read-time herberekend uit
   * de actuele Payload-/Monday-data (geen aparte cache) — hier dus puur een
   * herfetch van diezelfde twee altijd-zichtbare kopregel-onderdelen, geen
   * nieuwe logica. Diepere, nog niet bezochte tabbladen verversen vanzelf
   * bij de eerstvolgende keer openen (bestaande lazy-tab-cache).
   */
  async function herlaadBasisEnAandacht() {
    const [basisData, aandachtData] = await Promise.all([
      apiGetOne<AdminSchoolBasis>(`/api/admin/trainers/school?id=${schoolId}&tab=basis`),
      apiGetOne<AdminAandachtItem[]>(`/api/admin/trainers/school?id=${schoolId}&tab=aandacht`),
    ]);
    if (basisData) setBasis(basisData);
    setAandacht(aandachtData ?? []);
  }

  // Inline fetch-met-ignore-vlag — zie TrainerDetailView.tsx se toelichting bij dezelfde regel.
  useEffect(() => {
    if (opgehaaldeTabs.has(tab)) return;
    let genegeerd = false;
    apiGetOne(`/api/admin/trainers/school?id=${schoolId}&tab=${tab}`).then((data) => {
      if (genegeerd) return;
      if (data !== null) {
        switch (tab) {
          case "overzicht":
            setOverzicht(data as AdminSchoolOverzichtTab);
            break;
          case "trainers":
            setTrainers(data as AdminSchoolTrainerRegel[]);
            break;
          case "trainingen":
            setTrainingen(data as AdminTrainingRegel[]);
            break;
          case "upsell":
            setUpsell(data as AdminSchoolUpsell);
            break;
          case "verslagen":
            setVerslagen(data as AdminSchoolVerslagRegel[]);
            break;
          case "logboek":
            setLogboek(data as AdminSchoolLogboekRegel[]);
            break;
          case "bestanden":
            setBestanden(data as AdminSchoolBestandRegel[]);
            break;
        }
      }
      setOpgehaaldeTabs((prev) => new Set(prev).add(tab));
    });
    return () => {
      genegeerd = true;
    };
  }, [tab, schoolId, opgehaaldeTabs]);

  const tabLaden = !opgehaaldeTabs.has(tab);

  if (basisLaden) return <div className="ml-sales__leeg">Laden…</div>;
  if (nietGevonden || !basis) return <div className="ml-sales__leeg">School niet gevonden.</div>;

  return (
    <div className="ml-sales">
      <div className="ml-sales__header">
        <h1>{basis.naam}</h1>
        <div className="ml-sales__schooldetail-meta">
          {basis.locatie && <span className="ml-sales__badge">{basis.locatie}</span>}
          {basis.onderwijstype && <span className="ml-sales__badge">{basis.onderwijstype}</span>}
          <span className="ml-sales__badge">
            {basis.aantalActieveTrainers} actieve {basis.aantalActieveTrainers === 1 ? "trainer" : "trainers"}
          </span>
        </div>
      </div>

      <div className="ml-sales__kaarten-rij" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <MiniKpiKaart waarde={basis.aantalOpenTrainingen} label="Open trainingen" kleur="blue" />
        <MiniKpiKaart waarde={basis.aantalOpenTodos} label="Open to-do's" kleur="orange" />
        <MiniKpiKaart waarde={basis.aantalOpenVerslagen} label="Open/conceptverslagen" kleur="orange" />
        <div className="ml-sales__kaart" style={{ textAlign: "center" }}>
          <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{basis.laatsteActiviteit ? formatKorteDatumTijd(basis.laatsteActiviteit) : "—"}</p>
          <p className="ml-sales__kaart-tekst" style={{ margin: 0 }}>
            Laatste activiteit
          </p>
        </div>
      </div>

      {aandacht.length > 0 && (
        <div className="ml-sales__section">
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={17} aria-hidden="true" style={{ color: NAV_COLOR_STYLES.orange.fg }} />
            Aandacht
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table className="ml-sales__tabel">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Trainer</th>
                  <th>Training</th>
                  <th>Toelichting</th>
                  <th>Wanneer</th>
                </tr>
              </thead>
              <tbody>
                {aandacht.map((item, i) => (
                  <tr key={i}>
                    <td>
                      <AdminStatusBadge label={AANDACHT_LABEL[item.soort]} kleur={AANDACHT_SOORT_KLEUR[item.soort]} />
                    </td>
                    <td>{item.trainerId ? <Link href={`/admin/trainers/detail?id=${item.trainerId}`}>{item.trainerNaam}</Link> : item.trainerNaam}</td>
                    <td>{item.titel}</td>
                    <td className="ml-sales__kaart-tekst">{item.detail}</td>
                    <td>{formatKorteDatum(item.wanneer)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="ml-sales-widget__tabs">
        {TABS.map((t) => (
          <button key={t} type="button" className={`ml-sales-widget__tab${tab === t ? " ml-sales-widget__tab--actief" : ""}`} onClick={() => setTab(t)}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tabLaden && <div className="ml-sales__leeg">Laden…</div>}

      {!tabLaden && tab === "overzicht" && (overzicht ? <OverzichtTab data={overzicht} /> : <TabFoutmelding />)}
      {!tabLaden && tab === "trainers" && (trainers ? <TrainersTab data={trainers} /> : <TabFoutmelding />)}
      {!tabLaden && tab === "trainingen" && (trainingen ? <TrainingenTab data={trainingen} /> : <TabFoutmelding />)}
      {!tabLaden && tab === "upsell" && (upsell ? <UpsellTab data={upsell} /> : <TabFoutmelding />)}
      {!tabLaden && tab === "verslagen" && (verslagen ? (
        <VerslagenLijst
          data={verslagen}
          toonSchoolKolom={false}
          onGewijzigd={(verslagId, wijziging) => setVerslagen((huidig) => (huidig ? huidig.map((v) => (v.verslagId === verslagId ? { ...v, ...wijziging } : v)) : huidig))}
          onVerwijderd={(verslagId) => {
            setVerslagen((huidig) => (huidig ? huidig.filter((v) => v.verslagId !== verslagId) : huidig));
            void herlaadBasisEnAandacht();
          }}
        />
      ) : (
        <TabFoutmelding />
      ))}
      {!tabLaden && tab === "logboek" && (logboek ? (
        <LogboekLijst
          data={logboek}
          onGewijzigd={(id, wijziging) => setLogboek((huidig) => (huidig ? huidig.map((i) => (i.id === id ? { ...i, ...wijziging } : i)) : huidig))}
          onVerwijderd={(id) => setLogboek((huidig) => (huidig ? huidig.filter((i) => i.id !== id) : huidig))}
        />
      ) : (
        <TabFoutmelding />
      ))}
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

function OverzichtTab({ data }: { data: AdminSchoolOverzichtTab }) {
  return (
    <>
      <div className="ml-sales__section">
        <h2>Gekoppelde trainers ({data.gekoppeldeTrainers.length})</h2>
        {data.gekoppeldeTrainers.length === 0 ? (
          <p className="ml-sales__kaart-tekst">Geen gekoppelde trainers.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {data.gekoppeldeTrainers.map((t) => (
              <li key={t.id} className="ml-sales__kaart-tekst">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <span className="ml-sales__status-stip" style={{ background: NAV_COLOR_STYLES[trainerActiefKleur(t.actief)].fg }} />
                  <Link href={`/admin/trainers/detail?id=${t.id}`}>{t.naam}</Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data.openTodos.length > 0 && (
        <div className="ml-sales__section">
          <h2>Open to-do&apos;s ({data.openTodos.length})</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {data.openTodos.map((item: TodoItem, i: number) => {
              const Icoon = TODO_ICOON[item.soort];
              return (
                <li key={i} className="ml-sales__kaart-tekst">
                  <Icoon size={13} aria-hidden="true" style={{ verticalAlign: "middle", marginRight: 4, color: NAV_COLOR_STYLES[TODO_SOORT_KLEUR[item.soort]].fg }} />
                  {item.trainingNaam} · {TODO_CTA_LABEL[item.soort]} · {todoTijdLabel(item)}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="ml-sales__section">
        <h2>Komende trainingen</h2>
        {data.komendeTrainingen.length === 0 ? (
          <p className="ml-sales__kaart-tekst">Geen trainingen eerstkomend gepland.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {data.komendeTrainingen.map((t) => (
              <li key={`${t.trainerId}-${t.trainingId}`} className="ml-sales__kaart-tekst">
                {formatKorteDatum(t.datum)} — {t.trainingNaam} ({t.trainerNaam})
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="ml-sales__section">
        <h2>Recente activiteit</h2>
        {data.recenteActiviteit.length === 0 ? (
          <p className="ml-sales__kaart-tekst">Nog geen activiteit.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {data.recenteActiviteit.map((item, i) => {
              const Icoon = icoonVoorActiviteit(item.soort);
              return (
                <li key={i} className="ml-sales__kaart-tekst">
                  <Icoon size={13} aria-hidden="true" style={{ verticalAlign: "middle", marginRight: 4, color: NAV_COLOR_STYLES[activiteitSoortKleur(item.soort)].fg }} />
                  {formatKorteDatumTijd(item.wanneer)} — <Link href={`/admin/trainers/detail?id=${item.trainerId}`}>{item.trainerNaam}</Link>: {labelVoorActiviteit(item.soort)} {item.titel}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function TrainersTab({ data }: { data: AdminSchoolTrainerRegel[] }) {
  if (data.length === 0) return <div className="ml-sales__leeg">Geen gekoppelde trainers.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="ml-sales__tabel">
        <thead>
          <tr>
            <th>Naam</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data.map((t) => (
            <tr key={t.id}>
              <td>
                <Link href={`/admin/trainers/detail?id=${t.id}`}>{t.naam}</Link>
              </td>
              <td>
                <AdminStatusBadge label={t.actief ? "Actief" : "Inactief"} kleur={trainerActiefKleur(t.actief)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrainingenTab({ data }: { data: AdminTrainingRegel[] }) {
  if (data.length === 0) return <div className="ml-sales__leeg">Geen trainingen gevonden.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="ml-sales__tabel">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Trainer</th>
            <th>Training</th>
            <th>Status</th>
            <th>Verslagstatus</th>
          </tr>
        </thead>
        <tbody>
          {data.map((t, i) => (
            <tr key={`${t.trainerId}-${t.trainingId}-${i}`}>
              <td className={t.datum ? undefined : "ml-sales__ontbrekend"}>{formatKorteDatum(t.datum)}</td>
              <td>
                <Link href={`/admin/trainers/detail?id=${t.trainerId}`}>{t.trainerNaam}</Link>
              </td>
              <td>
                {t.trainingNaam}
                {t.bron === "aanvullend" && (
                  <span style={{ marginLeft: 7 }}>
                    <AdminStatusBadge label="Aanvullend" kleur="purple" />
                  </span>
                )}
              </td>
              <td>
                <AdminStatusBadge label={WEERGAVE_STATUS_LABEL[t.weergaveStatus]} kleur={WEERGAVE_STATUS_KLEUR[t.weergaveStatus]} />
              </td>
              <td>{t.verslagStatus ? <AdminStatusBadge label={VERSLAG_STATUS_LABEL[t.verslagStatus]} kleur={VERSLAG_STATUS_KLEUR[t.verslagStatus]} /> : <span className="ml-sales__ontbrekend">Nog geen verslag</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UpsellTab({ data }: { data: AdminSchoolUpsell }) {
  return (
    <>
      <div className="ml-sales__kaarten-rij" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <MiniKpiKaart waarde={data.aantalMijnleerlijn} label="MijnLeerlijn-trainingen" kleur="blue" />
        <MiniKpiKaart waarde={data.aantalAanvullend} label="Aanvullende trainingen" kleur="purple" />
        <MiniKpiKaart waarde={data.totaal} label="Totaal" kleur="teal" />
      </div>
      <div className="ml-sales__section">
        <h2>Aanvullende trainingen ({data.aanvullendeTrainingen.length})</h2>
        {data.aanvullendeTrainingen.length === 0 ? (
          <p className="ml-sales__kaart-tekst">Nog geen aanvullende trainingen bij deze school.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="ml-sales__tabel">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Training</th>
                  <th>Trainer</th>
                  <th>Verslagstatus</th>
                </tr>
              </thead>
              <tbody>
                {data.aanvullendeTrainingen.map((t) => (
                  <tr key={t.trainingId}>
                    <td className={t.datum ? undefined : "ml-sales__ontbrekend"}>{formatKorteDatum(t.datum)}</td>
                    <td>{t.trainingNaam}</td>
                    <td>
                      <Link href={`/admin/trainers/detail?id=${t.trainerId}`}>{t.trainerNaam}</Link>
                    </td>
                    <td>
                      {t.verslagStatus ? (
                        <AdminStatusBadge label={VERSLAG_STATUS_LABEL[t.verslagStatus]} kleur={VERSLAG_STATUS_KLEUR[t.verslagStatus]} />
                      ) : (
                        <span className="ml-sales__ontbrekend">Nog geen verslag</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function BestandenTab({ data }: { data: AdminSchoolBestandRegel[] }) {
  if (data.length === 0) return <div className="ml-sales__leeg">Geen schoolbestanden.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="ml-sales__tabel">
        <thead>
          <tr>
            <th>Titel</th>
            <th>Categorie</th>
            <th>Uploader</th>
            <th>Training</th>
            <th>Datum</th>
          </tr>
        </thead>
        <tbody>
          {data.map((b) => (
            <tr key={b.id}>
              <td>
                <a href={`/api/trainer-bestanden/${b.id}/download`}>{b.titel}</a>
              </td>
              <td>{b.categorie}</td>
              <td>{b.uploaderNaam}</td>
              <td className={b.trainingNaam ? undefined : "ml-sales__ontbrekend"}>{b.trainingNaam ?? "—"}</td>
              <td>{formatKorteDatum(b.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SchoolDetailView() {
  return (
    <Suspense fallback={<div className="ml-sales__leeg">Laden…</div>}>
      <SchoolInner />
    </Suspense>
  );
}
