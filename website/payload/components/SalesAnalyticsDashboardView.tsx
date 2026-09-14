"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@payloadcms/ui";
import type { SalesDashboardData } from "@/lib/sales/dashboard-data";
import type { SalesGoalProgress } from "@/lib/sales/goal-progress";
import type { SalesPartnerSummary } from "@/lib/sales/partner-summary";
import type { SalesCycleTimeSummary } from "@/lib/sales/cycle-time";
import s from "./SalesAnalyticsDashboardView.module.css";

const getal = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 });
const decimaal = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 });
const datum = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });

type BalkKleur = "blue" | "green" | "orange" | "purple" | "pink" | "teal";
const kleuren: BalkKleur[] = ["blue", "green", "orange", "purple", "pink", "teal"];

function Kpi({ label, waarde, toelichting }: { label: string; waarde: string; toelichting?: string }) {
  return <div className={s.kpi}><span>{label}</span><strong>{waarde}</strong>{toelichting && <small>{toelichting}</small>}</div>;
}

function kleurVoorLabel(label: string, index: number): BalkKleur {
  const status = label.trim().toLowerCase();
  if (status === "lead") return "blue";
  if (status === "prospect") return "purple";
  if (status.includes("handtekening")) return "orange";
  if (status === "klant") return "green";
  return kleuren[index % kleuren.length] ?? "blue";
}

function Balken({ titel, data, kleur = "wisselend" }: { titel: string; data: { label: string; waarde: number }[]; kleur?: BalkKleur | "wisselend" }) {
  const max = Math.max(1, ...data.map((d) => d.waarde));
  return <section className={s.panel}><h2>{titel}</h2>{data.length === 0 ? <p className={s.muted}>Nog geen data.</p> : <div className={s.bars}>{data.map((d, index) => {
    const balkKleur = kleur === "wisselend" ? kleurVoorLabel(d.label, index) : kleur;
    return <div key={d.label}><div className={s.barHead}><span>{d.label}</span><strong>{getal.format(d.waarde)}</strong></div><div className={s.track}><span className={s[`bar_${balkKleur}`]} style={{ width: `${Math.max(2, (d.waarde / max) * 100)}%` }} /></div></div>;
  })}</div>}</section>;
}

function doelStatus(doel: SalesGoalProgress): string {
  if (doel.status === "voor") return `${getal.format(Math.abs(doel.verschilTovTempoLicenties))} licenties voor op schema`;
  if (doel.status === "achter") return `${getal.format(Math.abs(doel.verschilTovTempoLicenties))} licenties achter op schema`;
  if (doel.status === "toekomstig") return "Periode moet nog beginnen";
  if (doel.status === "afgerond") return "Periode afgerond";
  return "Op schema";
}

function Doelkaart({ doel }: { doel: SalesGoalProgress }) {
  const voortgang = Math.max(0, Math.min(100, doel.percentageBehaald));
  return <section className={s.panel}><h2>{doel.naam}</h2><p className={s.muted}>{datum.format(new Date(doel.startDatum))} – {datum.format(new Date(doel.eindDatum))}</p><div className={s.barHead}><span>{getal.format(doel.gerealiseerdLicenties)} / {getal.format(doel.doelLicenties)} licenties</span><strong>{decimaal.format(doel.percentageBehaald)}%</strong></div><div className={s.track}><span className={s.bar_green} style={{ width: `${Math.max(2, voortgang)}%` }} /></div><p><strong>{doelStatus(doel)}</strong></p><p>{getal.format(doel.resterendLicenties)} licenties nodig · {getal.format(doel.nieuweScholen)} echte nieuwe scholen</p><p>{decimaal.format(doel.gerealiseerdSchoolEquivalenten)} van {decimaal.format(doel.doelSchoolEquivalenten)} school-equivalenten · {decimaal.format(doel.periodeVerstrekenPercentage)}% van de periode verstreken</p>{doel.forecastLicenties !== null && <p className={s.muted}>Prognose einddatum bij huidig tempo: {getal.format(doel.forecastLicenties)} licenties.</p>}</section>;
}

function Partnerkaart({ partner }: { partner: SalesPartnerSummary }) {
  const doelVoortgang = partner.doelPercentage === null ? null : Math.max(0, Math.min(100, partner.doelPercentage));
  return <section className={s.panel}><h2>{partner.naam}</h2><p><strong>{getal.format(partner.klanten)}</strong> klanten · <strong>{getal.format(partner.licenties)}</strong> licenties</p><p>{getal.format(partner.leads)} leads · {getal.format(partner.prospects)} prospects · {getal.format(partner.wachtOpHandtekening)} wacht op handtekening</p><p>Conversie naar klant: <strong>{partner.conversieNaarKlant === null ? "—" : `${decimaal.format(partner.conversieNaarKlant)}%`}</strong></p>{partner.doelLicenties !== null && partner.doelPercentage !== null && <><div className={s.barHead}><span>{getal.format(partner.licenties)} / {getal.format(partner.doelLicenties)} licenties</span><strong>{decimaal.format(partner.doelPercentage)}%</strong></div><div className={s.track}><span className={s.bar_purple} style={{ width: `${Math.max(2, doelVoortgang ?? 0)}%` }} /></div></>}</section>;
}

export function SalesAnalyticsDashboardView() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const trainingView = searchParams.get("view") === "trainingen";
  const account = user as unknown as { role?: string; permissionMode?: string; permissions?: unknown } | null;
  const beperkteDashboardGebruiker = account?.permissionMode === "restricted";
  const magBeheren = account?.role === "admin" && !beperkteDashboardGebruiker;
  const [data, setData] = useState<SalesDashboardData | null>(null);
  const [cycleTime, setCycleTime] = useState<SalesCycleTimeSummary | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [syncBezig, setSyncBezig] = useState(false);

  const laad = useCallback(async () => {
    setLaden(true); setFout(null);
    try {
      const [dashboardRes, cycleRes] = await Promise.all([
        fetch("/api/sales/dashboard", { credentials: "include" }),
        fetch("/api/sales/cycle-time", { credentials: "include" }),
      ]);
      if (!dashboardRes.ok) throw new Error(dashboardRes.status === 403 ? "Je hebt geen toegang tot dit dashboard." : "Dashboarddata kon niet worden geladen.");
      setData(await dashboardRes.json() as SalesDashboardData);
      if (cycleRes.ok) setCycleTime(await cycleRes.json() as SalesCycleTimeSummary);
    } catch (e) { setFout(e instanceof Error ? e.message : String(e)); }
    finally { setLaden(false); }
  }, []);

  useEffect(() => { void laad(); }, [laad]);

  async function sync() {
    setSyncBezig(true); setFout(null);
    try { const res = await fetch("/api/sales/sync", { method: "POST", credentials: "include" }); if (!res.ok) throw new Error("Synchroniseren is mislukt of niet toegestaan voor dit account."); await laad(); }
    catch (e) { setFout(e instanceof Error ? e.message : String(e)); }
    finally { setSyncBezig(false); }
  }

  if (laden) return <div className={s.root}><p>Laden…</p></div>;
  if (!data) return <div className={s.root}><h1>Sales Dashboard</h1><p>{fout ?? "Geen data beschikbaar."}</p></div>;
  const upsellPercentage = data.trainingen && data.kpis.klanten > 0 ? (data.trainingen.scholenMetUpsell / data.kpis.klanten) * 100 : 0;

  return <div className={s.root}>
    <header className={s.header}><div><h1>{trainingView ? "Trainingen & upsell" : "Sales Dashboard"}</h1><p>{trainingView ? "Trainingen, planning en aanvullende verkoop bij bestaande klanten." : "Scholen, licenties, groei, pipeline en commerciële doelstellingen."}</p></div>{magBeheren && <button className={s.button} type="button" onClick={sync} disabled={syncBezig}>{syncBezig ? "Synchroniseren…" : "Sync met Monday"}</button>}</header>
    <nav className={s.footer} style={{ marginTop: 0, marginBottom: 22 }}><Link href="/admin/sales">Scholen & licenties</Link><Link href="/admin/sales?view=trainingen">Trainingen & upsell</Link></nav>
    {fout && <p className={s.error}>{fout}</p>}

    {trainingView ? <>{data.trainingen ? <><div className={s.kpis}><Kpi label="Uitgevoerd" waarde={getal.format(data.trainingen.mijnLeerlijnUitgevoerd)} toelichting="MijnLeerlijn-trainingen" /><Kpi label="Gepland" waarde={getal.format(data.trainingen.mijnLeerlijnGepland)} toelichting="MijnLeerlijn-trainingen" /><Kpi label="Nog in te plannen" waarde={getal.format(data.trainingen.nogInTePlannen)} toelichting="Open trainingen" /><Kpi label="Upsell-trainingen" waarde={getal.format(data.trainingen.upsellTrainingen)} toelichting="Aanvullende trainingen" /><Kpi label="Scholen met upsell" waarde={getal.format(data.trainingen.scholenMetUpsell)} toelichting={`${decimaal.format(upsellPercentage)}% van actuele klanten`} /></div><div className={s.grid}><Balken titel="Uitgevoerde trainingen per maand" data={data.trainingen.mijnLeerlijnUitgevoerdPerMaand} kleur="green" /><Balken titel="Geplande trainingen per maand" data={data.trainingen.mijnLeerlijnGeplandPerMaand} kleur="blue" /><Balken titel="Upsell-trainingen per maand" data={data.trainingen.upsellPerMaand} kleur="purple" /></div></> : <section className={s.panel}><h2>Trainingen & upsell</h2><p className={s.muted}>De trainingsdata is op dit moment niet beschikbaar.</p></section>}</> : <>
      <div className={s.kpis}>
        <Kpi label="Klantlicenties nu" waarde={getal.format(data.kpis.klantLicenties)} toelichting={`${getal.format(data.kpis.klanten)} actuele klanten`} />
        <Kpi label="Open pipeline" waarde={getal.format(data.kpis.openPipelineLicenties)} toelichting={`${getal.format(data.kpis.openPipelineScholen)} scholen`} />
        <Kpi label="Gem. Lead → Klant" waarde={cycleTime?.averageDays === null || cycleTime?.averageDays === undefined ? "—" : `${decimaal.format(cycleTime.averageDays)} dagen`} toelichting={cycleTime?.completedSchools ? `Mediaan ${decimaal.format(cycleTime.medianDays ?? 0)} dagen · ${getal.format(cycleTime.completedSchools)} afgeronde trajecten` : "Wordt vanaf nu opgebouwd"} />
        <Kpi label="Gewonnen licenties" waarde={getal.format(data.kpis.exactGewonnenLicenties)} toelichting={`${getal.format(data.kpis.exactGewonnenScholen)} eerste overgangen naar Klant`} />
        <Kpi label="Gewonnen school-equivalent" waarde={decimaal.format(data.kpis.exactGewonnenSchoolEquivalenten)} toelichting={`1 school-equivalent = ${getal.format(data.kpis.schoolEquivalentFactor)} licenties`} />
        <Kpi label="Pipeline school-equivalent" waarde={decimaal.format(data.kpis.pipelineSchoolEquivalenten)} toelichting="Potentiële licenties" />
      </div>
      {data.doelstellingen.length > 0 && <><h2>Doelstellingen</h2><div className={s.grid}>{data.doelstellingen.map((doel) => <Doelkaart key={doel.id} doel={doel} />)}</div></>}
      <div className={s.grid}>
        <Balken titel="Nieuwe licenties per maand" data={data.nieuweLicentiesPerMaand} kleur="green" />
        <Balken titel="Nieuwe klanten per maand" data={data.nieuweKlantenPerMaand} kleur="teal" />
        <Balken titel="Funnel nu — scholen" data={data.funnel} />
        <Balken titel="Pipeline — potentiële licenties per fase" data={data.pipelineLicentiesPerFase} />
        <Balken titel="Klant geworden — Monday indeling" data={data.klantenGeworden} kleur="green" />
        <Balken titel="Klantlicenties per onderwijstype" data={data.licentiesPerOnderwijstype} />
        <Balken titel="Klanten per onderwijstype" data={data.klantenPerOnderwijstype} />
        <Balken titel="Klantlicenties per bron / partner" data={data.licentiesPerBron} />
        <Balken titel="Klanten per bron / partner" data={data.klantenPerBron} />
      </div>
      {data.partners.length > 0 && <><h2>Partners</h2><div className={s.grid}>{data.partners.map((partner) => <Partnerkaart key={partner.id} partner={partner} />)}</div></>}
      {magBeheren && <section className={s.panel} style={{ marginTop: 18 }}><h2>Historie & datakwaliteit</h2><p><strong>{getal.format(data.historie.statusMutaties)}</strong> statusmutaties en <strong>{getal.format(data.historie.licentieMutaties)}</strong> licentiemutaties zijn lokaal vastgelegd.</p><p><strong>{getal.format(data.historie.volledigeStatusMutaties)}</strong> statusmutaties bevatten zowel oude als nieuwe waarde; <strong>{getal.format(data.historie.statusMutatiesZonderVorigeWaarde)}</strong> hebben alleen de nieuwe waarde.</p><p><strong>{getal.format(data.historie.exacteKlantovergangen)}</strong> eerste overgangen naar Klant zijn teruggevonden.</p></section>}
    </>}
    {magBeheren && <footer className={s.footer}><Link href="/admin/sales">Dashboard</Link><Link href="/admin/sales/scholen">Pipeline</Link><Link href="/admin/collections/sales-goals">Doelstellingen</Link><Link href="/admin/collections/sales-partners">Partners</Link></footer>}
  </div>;
}
