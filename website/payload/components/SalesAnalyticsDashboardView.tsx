"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { SalesDashboardData } from "@/lib/sales/dashboard-data";

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const getal = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 });

function Kpi({ label, waarde, toelichting }: { label: string; waarde: string; toelichting?: string }) {
  return <div className="ml-sales-analytics__kpi"><span>{label}</span><strong>{waarde}</strong>{toelichting && <small>{toelichting}</small>}</div>;
}

function Balken({ titel, data, formatter = getal.format }: { titel: string; data: { label: string; waarde: number }[]; formatter?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.waarde));
  return <section className="ml-sales-analytics__panel"><h2>{titel}</h2>{data.length === 0 ? <p className="ml-sales-analytics__muted">Nog geen data.</p> : <div className="ml-sales-analytics__bars">{data.map((d) => <div className="ml-sales-analytics__bar" key={d.label}><div className="ml-sales-analytics__bar-head"><span>{d.label}</span><strong>{formatter(d.waarde)}</strong></div><div className="ml-sales-analytics__track"><span style={{ width: `${Math.max(2, (d.waarde / max) * 100)}%` }} /></div></div>)}</div>}</section>;
}

export function SalesAnalyticsDashboardView() {
  const [data, setData] = useState<SalesDashboardData | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [syncBezig, setSyncBezig] = useState(false);

  const laad = useCallback(async () => {
    setLaden(true); setFout(null);
    try {
      const res = await fetch("/api/sales/dashboard", { credentials: "include" });
      if (!res.ok) throw new Error(res.status === 403 ? "Je hebt geen toegang tot dit dashboard." : "Dashboarddata kon niet worden geladen.");
      setData(await res.json() as SalesDashboardData);
    } catch (e) { setFout(e instanceof Error ? e.message : String(e)); }
    finally { setLaden(false); }
  }, []);

  useEffect(() => { void laad(); }, [laad]);

  async function sync() {
    setSyncBezig(true); setFout(null);
    try {
      const res = await fetch("/api/sales/sync", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Synchroniseren is mislukt of niet toegestaan voor dit account.");
      await laad();
    } catch (e) { setFout(e instanceof Error ? e.message : String(e)); }
    finally { setSyncBezig(false); }
  }

  const laatsteMaanden = useMemo(() => data?.omzetPerMaand.slice(-12) ?? [], [data]);
  if (laden) return <div className="ml-sales-analytics"><p>Laden…</p></div>;
  if (!data) return <div className="ml-sales-analytics"><h1>Sales Dashboard</h1><p>{fout ?? "Geen data beschikbaar."}</p></div>;

  return <div className="ml-sales-analytics">
    <header className="ml-sales-analytics__header"><div><h1>Sales Dashboard</h1><p>Commerciële groei, klanten, licenties en omzet uit Monday.</p></div><button type="button" onClick={sync} disabled={syncBezig}>{syncBezig ? "Synchroniseren…" : "Sync met Monday"}</button></header>
    {fout && <p className="ml-sales-analytics__error">{fout}</p>}
    <div className="ml-sales-analytics__kpis">
      <Kpi label="Klantlicenties" waarde={getal.format(data.kpis.leerlingenBijKlanten)} toelichting={`${getal.format(data.kpis.klanten)} klanten`} />
      <Kpi label="Open pipeline" waarde={getal.format(data.kpis.openPipeline)} toelichting="Lead + Prospect + Wacht op handtekening" />
      <Kpi label="Omzet totaal" waarde={euro.format(data.kpis.omzetTotaal)} toelichting="Gereed / in uitvoering / afgerond" />
      <Kpi label={`Omzet ${new Date().getFullYear()}`} waarde={euro.format(data.kpis.omzetDitJaar)} />
      <Kpi label="Gem. omzet per klant" waarde={euro.format(data.kpis.gemiddeldeOmzetPerKlant)} />
      <Kpi label="Historische transities" waarde={getal.format(data.historie.transities)} toelichting={`${getal.format(data.historie.volledigeTransities)} met oude én nieuwe waarde`} />
    </div>
    <div className="ml-sales-analytics__grid">
      <Balken titel="Funnel nu" data={data.funnel} />
      <Balken titel="Klanten per onderwijstype" data={data.klantenPerOnderwijstype} />
      <Balken titel="Klant geworden" data={data.klantenGeworden} />
      <Balken titel="Omzet per product" data={data.omzetPerProduct} formatter={euro.format} />
      <Balken titel="Omzet per maand" data={laatsteMaanden} formatter={euro.format} />
      <section className="ml-sales-analytics__panel"><h2>Datakwaliteit historie</h2><p><strong>{getal.format(data.historie.volledigeTransities)}</strong> transities bevatten oude én nieuwe waarde.</p><p><strong>{getal.format(data.historie.eersteWaardeZonderVorige)}</strong> registraties bevatten alleen de nieuwe waarde en worden niet gebruikt alsof de vorige fase bekend was.</p><p className="ml-sales-analytics__muted">Monday blijft de operationele bron; historische events worden lokaal vastgelegd zodat latere wijzigingen het verleden niet herschrijven.</p></section>
    </div>
    <footer className="ml-sales-analytics__footer"><Link href="/admin/sales/scholen">Bekijk scholen</Link><Link href="/admin/sales/acties">Bekijk acties</Link></footer>
  </div>;
}
