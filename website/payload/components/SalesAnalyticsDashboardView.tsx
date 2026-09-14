"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@payloadcms/ui";
import type { SalesDashboardData } from "@/lib/sales/dashboard-data";
import type { SalesGoalProgress } from "@/lib/sales/goal-progress";
import type { SalesPartnerSummary } from "@/lib/sales/partner-summary";
import s from "./SalesAnalyticsDashboardView.module.css";
const getal = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 });
const decimaal = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 });
const datum = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });
function Kpi({ label, waarde, toelichting }: { label: string; waarde: string; toelichting?: string }) { return <div className={s.kpi}><span>{label}</span><strong>{waarde}</strong>{toelichting && <small>{toelichting}</small>}</div>; }
function Balken({ titel, data }: { titel: string; data: { label: string; waarde: number }[] }) { const max = Math.max(1, ...data.map((d) => d.waarde)); return <section className={s.panel}><h2>{titel}</h2>{data.length === 0 ? <p className={s.muted}>Nog geen data.</p> : <div className={s.bars}>{data.map((d) => <div key={d.label}><div className={s.barHead}><span>{d.label}</span><strong>{getal.format(d.waarde)}</strong></div><div className={s.track}><span style={{ width: `${Math.max(2, (d.waarde / max) * 100)}%` }} /></div></div>)}</div>}</section>; }
function doelStatus(doel: SalesGoalProgress): string {
  if (doel.status === "voor") return `${getal.format(Math.abs(doel.verschilTovTempoLicenties))} licenties voor op schema`;
  if (doel.status === "achter") return `${getal.format(Math.abs(doel.verschilTovTempoLicenties))} licenties achter op schema`;
  if (doel.status === "toekomstig") return "Periode moet nog beginnen";
  if (doel.status === "afgerond") return "Periode afgerond";
  return "Op schema";
}
function Doelkaart({ doel }: { doel: SalesGoalProgress }) {
  const voortgang = Math.max(0, Math.min(100, doel.percentageBehaald));
  return <section className={s.panel}>
    <h2>{doel.naam}</h2>
    <p className={s.muted}>{datum.format(new Date(doel.startDatum))} – {datum.format(new Date(doel.eindDatum))}</p>
    <div className={s.barHead}><span>{getal.format(doel.gerealiseerdLicenties)} / {getal.format(doel.doelLicenties)} licenties</span><strong>{decimaal.format(doel.percentageBehaald)}%</strong></div>
    <div className={s.track}><span style={{ width: `${Math.max(2, voortgang)}%` }} /></div>
    <p><strong>{doelStatus(doel)}</strong></p>
    <p>{getal.format(doel.resterendLicenties)} licenties nodig · {getal.format(doel.nieuweScholen)} echte nieuwe scholen</p>
    <p>{decimaal.format(doel.gerealiseerdSchoolEquivalenten)} van {decimaal.format(doel.doelSchoolEquivalenten)} school-equivalenten · {decimaal.format(doel.periodeVerstrekenPercentage)}% van de periode verstreken</p>
    {doel.forecastLicenties !== null && <p className={s.muted}>Prognose einddatum bij huidig tempo: {getal.format(doel.forecastLicenties)} licenties.</p>}
  </section>;
}
function Partnerkaart({ partner }: { partner: SalesPartnerSummary }) {
  const doelVoortgang = partner.doelPercentage === null ? null : Math.max(0, Math.min(100, partner.doelPercentage));
  return <section className={s.panel}>
    <h2>{partner.naam}</h2>
    <p><strong>{getal.format(partner.klanten)}</strong> klanten · <strong>{getal.format(partner.licenties)}</strong> licenties</p>
    <p>{getal.format(partner.leads)} leads · {getal.format(partner.prospects)} prospects · {getal.format(partner.wachtOpHandtekening)} wacht op handtekening</p>
    <p>Conversie naar klant: <strong>{partner.conversieNaarKlant === null ? "—" : `${decimaal.format(partner.conversieNaarKlant)}%`}</strong></p>
    {partner.doelLicenties !== null && partner.doelPercentage !== null && <>
      <div className={s.barHead}><span>{getal.format(partner.licenties)} / {getal.format(partner.doelLicenties)} licenties</span><strong>{decimaal.format(partner.doelPercentage)}%</strong></div>
      <div className={s.track}><span style={{ width: `${Math.max(2, doelVoortgang ?? 0)}%` }} /></div>
    </>}
  </section>;
}
export function SalesAnalyticsDashboardView() {
  const { user } = useAuth();
  const account = user as unknown as { role?: string; permissionMode?: string; permissions?: unknown } | null;
  const beperkteDashboardGebruiker = account?.permissionMode === "restricted";
  const magBeheren = account?.role === "admin" && !beperkteDashboardGebruiker;
  const [data, setData] = useState<SalesDashboardData | null>(null); const [laden, setLaden] = useState(true); const [fout, setFout] = useState<string | null>(null); const [syncBezig, setSyncBezig] = useState(false);
  const laad = useCallback(async () => { setLaden(true); setFout(null); try { const res = await fetch("/api/sales/dashboard", { credentials: "include" }); if (!res.ok) throw new Error(res.status === 403 ? "Je hebt geen toegang tot dit dashboard." : "Dashboarddata kon niet worden geladen."); setData(await res.json() as SalesDashboardData); } catch (e) { setFout(e instanceof Error ? e.message : String(e)); } finally { setLaden(false); } }, []);
  useEffect(() => { void laad(); }, [laad]);
  async function sync() { setSyncBezig(true); setFout(null); try { const res = await fetch("/api/sales/sync", { method: "POST", credentials: "include" }); if (!res.ok) throw new Error("Synchroniseren is mislukt of niet toegestaan voor dit account."); await laad(); } catch (e) { setFout(e instanceof Error ? e.message : String(e)); } finally { setSyncBezig(false); } }
  if (laden) return <div className={s.root}><p>Laden…</p></div>;
  if (!data) return <div className={s.root}><h1>Sales Dashboard</h1><p>{fout ?? "Geen data beschikbaar."}</p></div>;
  const upsellPercentage = data.trainingen && data.kpis.klanten > 0 ? (data.trainingen.scholenMetUpsell / data.kpis.klanten) * 100 : 0;
  return <div className={s.root}>
    <header className={s.header}><div><h1>Sales Dashboard</h1><p>Commerciële groei, klanten, licenties en pipeline uit Monday.</p></div>{magBeheren && <button className={s.button} type="button" onClick={sync} disabled={syncBezig}>{syncBezig ? "Synchroniseren…" : "Sync met Monday"}</button>}</header>
    {fout && <p className={s.error}>{fout}</p>}
    <div className={s.kpis}>
      <Kpi label="Klantlicenties nu" waarde={getal.format(data.kpis.klantLicenties)} toelichting={`${getal.format(data.kpis.klanten)} actuele klanten`} />
      <Kpi label="Open pipeline" waarde={getal.format(data.kpis.openPipelineLicenties)} toelichting={`${getal.format(data.kpis.openPipelineScholen)} scholen`} />
      <Kpi label="Gewonnen licenties" waarde={getal.format(data.kpis.exactGewonnenLicenties)} toelichting={`${getal.format(data.kpis.exactGewonnenScholen)} eerste overgangen naar Klant`} />
      <Kpi label="Gewonnen school-equivalent" waarde={decimaal.format(data.kpis.exactGewonnenSchoolEquivalenten)} toelichting={`1 school-equivalent = ${getal.format(data.kpis.schoolEquivalentFactor)} licenties`} />
      <Kpi label="Klant school-equivalent" waarde={decimaal.format(data.kpis.klantSchoolEquivalenten)} toelichting="Huidige klantlicenties" />
      <Kpi label="Pipeline school-equivalent" waarde={decimaal.format(data.kpis.pipelineSchoolEquivalenten)} toelichting="Potentiële licenties" />
    </div>
    {data.doelstellingen.length > 0 && <><h2>Doelstellingen</h2><div className={s.grid}>{data.doelstellingen.map((doel) => <Doelkaart key={doel.id} doel={doel} />)}</div></>}
    {data.partners.length > 0 && <><h2>Partners</h2><div className={s.grid}>{data.partners.map((partner) => <Partnerkaart key={partner.id} partner={partner} />)}</div></>}
    {data.trainingen && <>
      <h2>Trainingen & upsell</h2>
      <div className={s.kpis}>
        <Kpi label="Uitgevoerd" waarde={getal.format(data.trainingen.mijnLeerlijnUitgevoerd)} toelichting="MijnLeerlijn-trainingen" />
        <Kpi label="Gepland" waarde={getal.format(data.trainingen.mijnLeerlijnGepland)} toelichting="MijnLeerlijn-trainingen" />
        <Kpi label="Nog in te plannen" waarde={getal.format(data.trainingen.nogInTePlannen)} toelichting="Open trainingen" />
        <Kpi label="Upsell-trainingen" waarde={getal.format(data.trainingen.upsellTrainingen)} toelichting="Aanvullende trainingen" />
        <Kpi label="Scholen met upsell" waarde={getal.format(data.trainingen.scholenMetUpsell)} toelichting={`${decimaal.format(upsellPercentage)}% van actuele klanten`} />
      </div>
      <div className={s.grid}>
        <Balken titel="Uitgevoerde trainingen per maand" data={data.trainingen.mijnLeerlijnUitgevoerdPerMaand} />
        <Balken titel="Geplande trainingen per maand" data={data.trainingen.mijnLeerlijnGeplandPerMaand} />
        <Balken titel="Upsell-trainingen per maand" data={data.trainingen.upsellPerMaand} />
      </div>
    </>}
    <div className={s.grid}>
      <Balken titel="Nieuwe licenties per maand" data={data.nieuweLicentiesPerMaand} />
      <Balken titel="Nieuwe klanten per maand" data={data.nieuweKlantenPerMaand} />
      <Balken titel="Funnel nu — scholen" data={data.funnel} />
      <Balken titel="Pipeline — potentiële licenties per fase" data={data.pipelineLicentiesPerFase} />
      <Balken titel="Klant geworden — Monday indeling" data={data.klantenGeworden} />
      <Balken titel="Klantlicenties per onderwijstype" data={data.licentiesPerOnderwijstype} />
      <Balken titel="Klanten per onderwijstype" data={data.klantenPerOnderwijstype} />
      <Balken titel="Klantlicenties per bron / partner" data={data.licentiesPerBron} />
      <Balken titel="Klanten per bron / partner" data={data.klantenPerBron} />
      {magBeheren && <section className={s.panel}><h2>Historie & datakwaliteit</h2><p><strong>{getal.format(data.historie.statusMutaties)}</strong> statusmutaties en <strong>{getal.format(data.historie.licentieMutaties)}</strong> licentiemutaties zijn lokaal vastgelegd.</p><p><strong>{getal.format(data.historie.volledigeStatusMutaties)}</strong> statusmutaties bevatten zowel oude als nieuwe waarde; <strong>{getal.format(data.historie.statusMutatiesZonderVorigeWaarde)}</strong> hebben alleen de nieuwe waarde.</p><p><strong>{getal.format(data.historie.exacteKlantovergangen)}</strong> eerste overgangen naar Klant zijn teruggevonden.</p><p><strong>{getal.format(data.historie.klantovergangenMetExacteLicenties)}</strong> daarvan hebben een historische of reconstrueerbare licentiewaarde. <strong>{getal.format(data.historie.klantovergangenMetAfgeleideLicenties)}</strong> gebruiken voorlopig de huidige licentiewaarde omdat Monday geen oudere waarde bevat.</p><p className={s.muted}>Een latere jaarlijkse wijziging van het leerlingaantal herschrijft historische perioden niet zodra een historische licentiewaarde beschikbaar is.</p></section>}
    </div>
    {magBeheren && <footer className={s.footer}>
      <Link href="/admin/sales">Dashboard</Link>
      <Link href="/admin/sales/scholen">Pipeline</Link>
      <Link href="/admin/collections/sales-goals">Doelstellingen</Link>
      <Link href="/admin/collections/sales-partners">Partners</Link>
    </footer>}
  </div>;
}
