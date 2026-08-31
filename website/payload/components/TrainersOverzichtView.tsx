"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { GraduationCap, CirclePlay, ListTodo, FileClock, Phone, AlertTriangle, type LucideIcon } from "lucide-react";
import type { AdminTrainersOverzicht, AdminTrainerKaart } from "@/lib/admin/trainers/overzicht";
import type { AdminAandachtOverzicht } from "@/lib/admin/trainers/aandacht";
import { formatKorteDatum, formatKorteDatumTijd } from "@/lib/sales/format-datum";
import { NAV_COLOR_STYLES, type NavColor } from "@/lib/admin-nav/nav-colors";
import { AANDACHT_SOORT_KLEUR, trainerActiefKleur } from "@/lib/admin/trainers/status-kleuren";
import { AdminStatusBadge } from "./AdminStatusBadge";

// Traineromgeving V2, Fase 4 (2026-08-24) — Admin Trainerdashboard (spec §2).
// Hergebruikt bewust de bestaande ml-sales__*-CSS-klassen (kaart/tabel/knop/
// badge/section/leeg — allemaal generieke admin-UI-primitieven, niets
// Sales-specifieks aan de regels zelf) i.p.v. een tweede, parallel
// visueel systeem — spec §16: "dezelfde bestaande admin-visuele taal, geen
// nieuw design system." Twee losse fetches ((1) overzicht, (2) aandacht) —
// elk al zijn eigen, admin-brede, single-round-trip route (spec §13); geen
// van beide roept de ander aan.
//
// Visuele polishronde (2026-08-24) — kleuraccenten per KPI-kaart + gekleurde
// status (lib/admin/trainers/status-kleuren.ts), puur presentatie: geen
// enkele fetch/filter/sortering hieronder is gewijzigd.

async function apiGetOne<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

const AANDACHT_LABEL: Record<AdminAandachtOverzicht["items"][number]["soort"], string> = {
  telefonie_mislukt: "Telefonie mislukt",
  verslag_vastgelopen: "Verslag vastgelopen",
  concept_oud: "Oud concept",
  startactie_verlopen: "Startactie verlopen",
};

export function TrainersOverzichtView() {
  const [overzicht, setOverzicht] = useState<AdminTrainersOverzicht | null>(null);
  const [aandacht, setAandacht] = useState<AdminAandachtOverzicht | null>(null);
  const [laden, setLaden] = useState(true);
  const [zoekterm, setZoekterm] = useState("");

  // Inline fetch-met-ignore-vlag rechtstreeks in het effect (React's eigen
  // aanbevolen datafetch-patroon, zie https://react.dev/learn/you-might-not-need-an-effect)
  // i.p.v. een aparte useCallback-functie aan te roepen — een aanroep naar
  // een losse functiereferentie triggert react-hooks/set-state-in-effect
  // (ESLint kan niet statisch bewijzen wanneer/of die functie setState
  // aanroept), deze inline vorm wél herkenbaar veilig.
  useEffect(() => {
    let genegeerd = false;
    Promise.all([apiGetOne<AdminTrainersOverzicht>("/api/admin/trainers/overzicht"), apiGetOne<AdminAandachtOverzicht>("/api/admin/trainers/aandacht")]).then(([o, a]) => {
      if (genegeerd) return;
      setOverzicht(o);
      setAandacht(a);
      setLaden(false);
    });
    return () => {
      genegeerd = true;
    };
  }, []);

  const zichtbareTrainers = useMemo(() => {
    if (!overzicht) return [];
    const term = zoekterm.trim().toLowerCase();
    if (!term) return overzicht.trainers;
    return overzicht.trainers.filter((t) => t.naam.toLowerCase().includes(term));
  }, [overzicht, zoekterm]);

  if (laden) return <div className="ml-sales__leeg">Laden…</div>;
  if (!overzicht) return <div className="ml-sales__leeg">Kon het trainerdashboard niet laden.</div>;

  return (
    <div className="ml-sales">
      <div className="ml-sales__header">
        <h1>Trainers</h1>
        <p>Centraal overzicht over alle trainers en hun werk.</p>
      </div>

      <div className="ml-sales__kaarten-rij" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <TotaalKaart label="Actieve trainers" waarde={overzicht.totalen.actieveTrainers} kleur="green" icoon={GraduationCap} />
        <TotaalKaart label="Trainingen deze maand" waarde={overzicht.totalen.trainingenDezeMaand} kleur="blue" icoon={CirclePlay} />
        <TotaalKaart label="Open to-do's" waarde={overzicht.totalen.openTodos} href="/admin/trainers/todo" kleur="orange" icoon={ListTodo} />
        <TotaalKaart label="Open verslagen" waarde={overzicht.totalen.openVerslagen} kleur="orange" icoon={FileClock} />
        <TotaalKaart label="Mislukte telefonie-oproepen" waarde={overzicht.totalen.misluktetelefonieOproepen} kleur="red" icoon={Phone} />
      </div>

      {aandacht && (aandacht.items.length > 0 || aandacht.trainersMetVeelOudeVerslagen.length > 0) && (
        <div className="ml-sales__section">
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={17} aria-hidden="true" style={{ color: NAV_COLOR_STYLES.orange.fg }} />
            Aandacht
          </h2>
          {aandacht.trainersMetVeelOudeVerslagen.length > 0 && (
            <p className="ml-sales__kaart-tekst" style={{ marginBottom: 8 }}>
              Trainers met veel oude/vastgelopen verslagen:{" "}
              {aandacht.trainersMetVeelOudeVerslagen.map((t, i) => (
                <span key={t.trainerId}>
                  {i > 0 && ", "}
                  <Link href={`/admin/trainers/detail?id=${t.trainerId}`}>
                    {t.trainerNaam} ({t.aantal})
                  </Link>
                </span>
              ))}
            </p>
          )}
          {aandacht.items.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table className="ml-sales__tabel">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Trainer</th>
                    <th>School</th>
                    <th>Training</th>
                    <th>Toelichting</th>
                    <th>Wanneer</th>
                  </tr>
                </thead>
                <tbody>
                  {aandacht.items.slice(0, 30).map((item, i) => (
                    <tr key={i}>
                      <td>
                        <AdminStatusBadge label={AANDACHT_LABEL[item.soort]} kleur={AANDACHT_SOORT_KLEUR[item.soort]} />
                      </td>
                      <td>{item.trainerId ? <Link href={`/admin/trainers/detail?id=${item.trainerId}`}>{item.trainerNaam}</Link> : item.trainerNaam}</td>
                      <td>{item.schoolNaam}</td>
                      <td>{item.titel}</td>
                      <td className="ml-sales__kaart-tekst">{item.detail}</td>
                      <td>{formatKorteDatum(item.wanneer)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="ml-sales__section">
        <div className="ml-sales__section-titel">
          <h2>Trainers</h2>
        </div>
        <div className="ml-sales__filter-balk">
          <input type="text" placeholder="Zoek op trainernaam…" value={zoekterm} onChange={(e) => setZoekterm(e.target.value)} className="ml-sales__zoekveld" />
        </div>
        {zichtbareTrainers.length === 0 ? (
          <div className="ml-sales__leeg">Geen trainers gevonden.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="ml-sales__tabel">
              <thead>
                <tr>
                  <th>Naam</th>
                  <th>Status</th>
                  <th>Scholen</th>
                  <th>Komende trainingen</th>
                  <th>Open to-do&apos;s</th>
                  <th>Open verslagen</th>
                  <th>Laatste activiteit</th>
                  <th>Eerstvolgende training</th>
                </tr>
              </thead>
              <tbody>
                {zichtbareTrainers.map((t: AdminTrainerKaart) => (
                  <tr key={t.trainerId}>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <span className="ml-sales__status-stip" style={{ background: NAV_COLOR_STYLES[trainerActiefKleur(t.actief)].fg }} />
                        <Link href={`/admin/trainers/detail?id=${t.trainerId}`}>{t.naam}</Link>
                      </span>
                    </td>
                    <td>
                      <AdminStatusBadge label={t.actief ? "Actief" : "Inactief"} kleur={trainerActiefKleur(t.actief)} />
                    </td>
                    <td>{t.aantalScholen}</td>
                    <td>{t.aantalKomendeTrainingen}</td>
                    <td>{t.aantalOpenTodos}</td>
                    <td>{t.aantalOpenVerslagen}</td>
                    <td className={t.laatsteActiviteit ? undefined : "ml-sales__ontbrekend"}>{t.laatsteActiviteit ? formatKorteDatumTijd(t.laatsteActiviteit) : "—"}</td>
                    <td className={t.eerstvolgendeTraining ? undefined : "ml-sales__ontbrekend"}>
                      {t.eerstvolgendeTraining ? `${t.eerstvolgendeTraining.naam} — ${t.eerstvolgendeTraining.schoolNaam} (${formatKorteDatum(t.eerstvolgendeTraining.datum)})` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TotaalKaart({ label, waarde, href, kleur, icoon: Icoon }: { label: string; waarde: number; href?: string; kleur: NavColor; icoon: LucideIcon }) {
  const stijl = NAV_COLOR_STYLES[kleur];
  const inhoud = (
    <div className="ml-sales__kaart" style={{ textAlign: "center", alignItems: "center" }}>
      <span className="ml-sales__kaart-icoon" style={{ "--item-fg": stijl.fg, "--item-bg": stijl.bg } as CSSProperties}>
        <Icoon size={15} aria-hidden="true" />
      </span>
      <p style={{ fontSize: 28, fontWeight: 700, margin: 0, color: stijl.fg }}>{waarde}</p>
      <p className="ml-sales__kaart-tekst" style={{ margin: 0 }}>
        {label}
      </p>
    </div>
  );
  return href ? (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      {inhoud}
    </Link>
  ) : (
    inhoud
  );
}
