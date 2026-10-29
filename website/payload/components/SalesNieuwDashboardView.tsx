"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  aandelen,
  doorstroom,
  waarde,
  type DashboardEenheid,
  type DashboardPeriode,
  type DoelKaart,
  type FunnelStand,
  type MaandRij,
  type Maat,
  type NieuwDashboardModel,
  type PipelineMaandRij,
  type TypeRij,
} from "@/lib/sales/nieuw-dashboard";
import { useQueryKeuze } from "./useQueryKeuze";
import s from "./SalesNieuwDashboardView.module.css";

const EENHEDEN = ["licenties", "scholen"] as const;
const PERIODES = ["half", "jaar"] as const;
const STAPPEN = [
  ["lead", "Lead", "lead"],
  ["prospect", "Prospect", "prospect"],
  ["wacht", "Wacht op handtekening", "wacht"],
  ["klant", "Klant", "klant"],
] as const;

const getal = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 });
const precies = new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const datum = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" });
const tijdstip = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

function n(waardeGetal: number) { return getal.format(Math.round(waardeGetal)); }
function scholenTekst(aantal: number) { return `${n(aantal)} ${Math.round(aantal) === 1 ? "school" : "scholen"}`; }
function nFlex(waardeGetal: number) {
  return Math.abs(waardeGetal - Math.round(waardeGetal)) < 0.05 ? n(waardeGetal) : precies.format(waardeGetal);
}
function toon(van: Maat, eenheid: DashboardEenheid) {
  return eenheid === "licenties" ? n(waarde(van, eenheid)) : nFlex(waarde(van, eenheid));
}

function tempoKlasse(verschil: number) {
  if (verschil < -0.5) return s.achter;
  if (verschil > 0.5) return s.voor;
  return undefined;
}

function tempoTekst(verschil: number, eenheidWoord: string) {
  const afgerond = Math.round(verschil);
  if (afgerond < 0) return `${n(Math.abs(afgerond))} ${eenheidWoord} achter op schema`;
  if (afgerond > 0) return `${n(afgerond)} ${eenheidWoord} voor op schema`;
  return "Op schema";
}

function rang(naam: string) {
  if (naam === "Onbekend") return 2;
  if (naam === "Meerdere") return 1;
  return 0;
}

export function SalesNieuwDashboardView({ schakelaar }: { schakelaar: ReactNode }) {
  const eenheidKeuze = useQueryKeuze({ param: "eenheid", opslagSleutel: "ml-sales-dashboard-eenheid", toegestaan: EENHEDEN, standaard: "licenties" });
  const periodeKeuze = useQueryKeuze({ param: "periode", opslagSleutel: "ml-sales-dashboard-periode", toegestaan: PERIODES, standaard: "half" });
  const [data, setData] = useState<NieuwDashboardModel | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("Alle");

  const laad = useCallback(async () => {
    setLaden(true);
    setFout(null);
    try {
      const res = await fetch("/api/sales/dashboard-nieuw", { credentials: "include" });
      if (!res.ok) throw new Error(res.status === 403 ? "Je hebt geen toegang tot dit dashboard." : "Dashboarddata kon niet worden geladen.");
      setData(await res.json() as NieuwDashboardModel);
    } catch (error) {
      setFout(error instanceof Error ? error.message : String(error));
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void laad();
  }, [laad]);

  if (laden) return <div className={s.root}>{schakelaar}<p>Laden…</p></div>;
  if (!data) return <div className={s.root}>{schakelaar}<h1>Sales Dashboard</h1><p className={s.fout}>{fout ?? "Geen data beschikbaar."}</p></div>;

  return (
    <SalesNieuwDashboardInhoud
      data={data}
      schakelaar={schakelaar}
      eenheid={eenheidKeuze.waarde}
      periode={periodeKeuze.waarde}
      onEenheid={eenheidKeuze.kies}
      onPeriode={periodeKeuze.kies}
      typeFilter={data.typen.some((rij) => rij.naam === typeFilter) ? typeFilter : "Alle"}
      onType={setTypeFilter}
      fout={fout}
    />
  );
}

export function SalesNieuwDashboardInhoud({ data, schakelaar, eenheid, periode, onEenheid, onPeriode, typeFilter, onType, fout }: {
  data: NieuwDashboardModel;
  schakelaar: ReactNode;
  eenheid: DashboardEenheid;
  periode: DashboardPeriode;
  onEenheid: (volgende: DashboardEenheid) => void;
  onPeriode: (volgende: DashboardPeriode) => void;
  typeFilter: string;
  onType: (naam: string) => void;
  fout: string | null;
}) {
  const licenties = eenheid === "licenties";
  const eenheidWoord = licenties ? "licenties" : "scholen";
  const doel = data.doelen[periode];
  const nieuw = doel?.gerealiseerd ?? data.nieuwInPeriode[periode];
  const label = data.periodeLabels[periode];
  const gekozenType = data.typen.find((rij) => rij.naam === typeFilter) ?? null;
  const funnel: FunnelStand = gekozenType
    ? { lead: gekozenType.lead, prospect: gekozenType.prospect, wacht: gekozenType.wacht, klant: gekozenType.klant, gestopt: gekozenType.gestopt, inactief: gekozenType.inactief, overig: gekozenType.overig }
    : data.funnel;
  const typen = [...data.typen].sort((a, b) => rang(a.naam) - rang(b.naam) || waarde(b.klant, eenheid) - waarde(a.klant, eenheid) || a.naam.localeCompare(b.naam, "nl"));
  const bronnen = [...data.bronnen].sort((a, b) => rang(a.naam) - rang(b.naam) || waarde(b.klanten, eenheid) - waarde(a.klanten, eenheid) || a.naam.localeCompare(b.naam, "nl"));
  const gemNieuw = nieuw.scholen > 0 ? Math.round(nieuw.licenties / nieuw.scholen) : null;

  return (
    <div className={s.root}>
      {schakelaar}
      <header className={s.header}>
        <div>
          <h1>Sales Dashboard</h1>
          <p className={s.sub}>Bijgewerkt uit Monday: {tijdstip.format(new Date(data.bijgewerktOp))}</p>
        </div>
        <div className={s.controls}>
          <div className={`${s.seg} ${s.prominent}`} role="group" aria-label="Eenheid">
            <button type="button" className={licenties ? s.aan : undefined} aria-pressed={licenties} onClick={() => onEenheid("licenties")}>Licenties</button>
            <button type="button" className={!licenties ? s.aan : undefined} aria-pressed={!licenties} onClick={() => onEenheid("scholen")}>Scholen</button>
          </div>
          <div className={s.seg} role="group" aria-label="Periode">
            <button type="button" className={periode === "half" ? s.aan : undefined} aria-pressed={periode === "half"} onClick={() => onPeriode("half")}>Dit halfjaar ({data.periodeLabels.half})</button>
            <button type="button" className={periode === "jaar" ? s.aan : undefined} aria-pressed={periode === "jaar"} onClick={() => onPeriode("jaar")}>Dit jaar ({data.periodeLabels.jaar})</button>
          </div>
        </div>
      </header>
      <p className={s.toelichting}>{licenties
        ? `Grote getallen zijn licenties. In Monday is dat het aantal leerlingen.${data.gemLicentiesPerKlant ? ` Gemiddeld ${n(data.gemLicentiesPerKlant)} per klant.` : ""}`
        : `Grote getallen zijn scholen. Het officiële doel blijft in licenties; een schoolgetal bij een doel is dat doel gedeeld door ${n(data.factor)}.`}</p>
      {data.kwaliteitTekst ? <p className={s.toelichting}>{data.kwaliteitTekst}</p> : null}
      {fout ? <p className={s.fout}>{fout}</p> : null}

      <div className={s.kpis}>
        <article className={`${s.card} ${s.kpi}`}>
          <span>{licenties ? "Licenties bij klanten" : "Scholen die klant zijn"}</span>
          <strong>{toon(data.klanten, eenheid)}</strong>
          <span className={waarde(data.dezeMaandNetto, eenheid) < 0 ? s.achter : s.plus}>{nettoLabel(waarde(data.dezeMaandNetto, eenheid))} deze maand</span>
          <small>{licenties ? scholenTekst(data.klanten.scholen) : `${n(data.klanten.licenties)} licenties`}{data.gemLicentiesPerKlant ? ` · gem. ${n(data.gemLicentiesPerKlant)} per school` : ""}</small>
        </article>
        <article className={`${s.card} ${s.kpi}`}>
          <span>Potentie in pipeline</span>
          <strong>{toon(data.pipeline, eenheid)}</strong>
          <span>{licenties ? scholenTekst(data.pipeline.scholen) : `${n(data.pipeline.licenties)} licenties`}</span>
          <small>{toon(data.funnel.lead, eenheid)} lead · {toon(data.funnel.prospect, eenheid)} prospect · {toon(data.funnel.wacht, eenheid)} wacht</small>
        </article>
        <article className={`${s.card} ${s.kpi}`}>
          <span>Nieuw in {label}</span>
          <strong>{toon(nieuw, eenheid)}</strong>
          {doel ? <span className={tempoKlasse(licenties ? doel.verschilLicenties : doel.verschilScholen)}>{tempoTekst(licenties ? doel.verschilLicenties : doel.verschilScholen, eenheidWoord)}</span> : <span>geen doel voor deze periode</span>}
          <small>{doel ? (licenties ? `doel ${n(doel.doelLicenties)} · ${precies.format(doel.percentageLicenties)}%` : `indicatie ${nFlex(doel.doelScholenIndicatie)} scholen · officieel doel ${n(doel.doelLicenties)} licenties`) : "kalenderperiode, zonder doelstelling"}</small>
        </article>
        <article className={`${s.card} ${s.kpi}`}>
          <span>Nieuwe klanten in {label}</span>
          <strong>{toon(nieuw, eenheid)}</strong>
          <span>{licenties ? scholenTekst(nieuw.scholen) : `${n(nieuw.licenties)} licenties`}</span>
          <small>{gemNieuw === null ? "nog geen nieuwe klant in deze periode" : `gem. ${n(gemNieuw)} licenties per nieuwe klant`}</small>
        </article>
      </div>

      <section className={s.card}>
        <h2>Doelstelling</h2>
        <p className={s.uitleg}>Nieuwe {eenheidWoord} in het halfjaar en in het jaar. Het streepje is waar we nu zouden moeten staan als het doel gelijkmatig over de periode loopt. Een doel hoort bij een periode van ongeveer een halfjaar of een jaar.</p>
        <div className={s.doelen}>
          <DoelBlok kaart={data.doelen.half} titel={data.periodeLabels.half} eenheid={eenheid} geselecteerd={periode === "half"} leeg="Er is nog geen halfjaardoel ingesteld." />
          <DoelBlok kaart={data.doelen.jaar} titel={data.periodeLabels.jaar} eenheid={eenheid} geselecteerd={periode === "jaar"} leeg="Er is nog geen jaardoel ingesteld." />
        </div>
      </section>

      <section className={s.card}>
        <h2>Per maand</h2>
        <p className={s.uitleg}>Verandering van het klantentotaal, laatste 12 maanden. Erbij is nieuwe klanten plus licenties die bij bestaande klanten stijgen. Eraf is klanten die weggaan plus licenties die dalen. Netto is erbij min eraf. Elke maand eindigt op de vorige stand plus netto. De laatste echte maand plus de regel Correctie / onbekend komt uit op de Monday-stand van nu.</p>
        <NettoGrafiek maanden={data.maanden} eenheid={eenheid} />
        <div className={s.scroll}>
          <table className={s.tabel}>
            <thead><tr><th>Maand</th><th className={s.num}>Erbij</th><th className={s.num}>Eraf</th><th className={s.num}>Netto</th><th className={s.num}>Totaal eind van de maand</th></tr></thead>
            <tbody>
              {data.maanden.map((maand) => (
                <tr key={maand.sleutel} className={maand.correctie ? s.correctie : maand.isNu ? s.nu : undefined}>
                  <td>{maand.label}{maand.isNu ? <span className={s.badge}>nu</span> : null}</td>
                  <td className={s.num}>{toon(maand.erbij, eenheid)}</td>
                  <td className={s.num}>{toon(maand.eraf, eenheid)}</td>
                  <td className={s.num}><Verschil van={waarde(maand.netto, eenheid)} /></td>
                  <td className={s.num}>{toon(maand.eindstand, eenheid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className={s.subkop}>Pipeline per maand</h3>
        <p className={s.uitleg}>Zelfde pipeline als de funnel: Lead, Prospect en Wacht op handtekening. Nieuw is een school die de pipeline in komt. Zonder statushistorie gebruiken we de aanmaakdatum in Monday, als die er is. Klant geworden en afgevallen zijn wie de pipeline verlaat.</p>
        {data.pipelineHistorieDun ? <p className={s.uitleg}>Bij een deel van de scholen zien we een pipeline-status pas als ze klant worden of afvallen. Wanneer ze de pipeline in kwamen is niet bekend; dat moment is niet ingevuld.</p> : null}
        <OmvangGrafiek maanden={data.pipelineMaanden} eenheid={eenheid} />
        <div className={s.scroll}>
          <table className={s.tabel}>
            <thead><tr><th>Maand</th><th className={s.num}>Nieuw in pipeline</th><th className={s.num}>Klant geworden</th><th className={s.num}>Afgevallen</th><th className={s.num}>Netto</th><th className={s.num}>In pipeline eind van de maand</th></tr></thead>
            <tbody>
              {data.pipelineMaanden.map((maand) => (
                <tr key={maand.sleutel} className={maand.correctie ? s.correctie : maand.isNu ? s.nu : undefined}>
                  <td>{maand.label}{maand.isNu ? <span className={s.badge}>nu</span> : null}</td>
                  <td className={s.num}>{toon(maand.nieuw, eenheid)}</td>
                  <td className={s.num}>{toon(maand.klantGeworden, eenheid)}</td>
                  <td className={s.num}>{toon(maand.afgevallen, eenheid)}</td>
                  <td className={s.num}><Verschil van={waarde(maand.netto, eenheid)} /></td>
                  <td className={s.num}>{toon(maand.eindstand, eenheid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={s.card}>
        <h2>Funnel</h2>
        <p className={s.uitleg}>Huidige stand, in vaste volgorde. Het percentage is het aandeel dat die fase of een latere fase heeft bereikt. Gestopt en inactief horen niet bij die vergelijking. Kies een onderwijstype om dezelfde funnel voor alleen dat type te zien.</p>
        <div className={s.chips} role="group" aria-label="Onderwijstype">
          <button type="button" className={typeFilter === "Alle" ? s.aan : undefined} onClick={() => onType("Alle")}>Alle</button>
          {typen.map((rij) => <button type="button" key={rij.naam} className={typeFilter === rij.naam ? s.aan : undefined} onClick={() => onType(rij.naam)}>{rij.naam}</button>)}
        </div>
        <FunnelBalken funnel={funnel} eenheid={eenheid} />
      </section>

      <section className={s.card}>
        <h2>Funnel per onderwijstype</h2>
        <p className={s.uitleg}>Zelfde fases, per onderwijstype. Een school met meerdere typen telt één keer, bij Meerdere. Potentie is Lead + Prospect + Wacht op handtekening. Donkerder blauw is meer binnen die kolom.</p>
        <Matrix typen={typen} eenheid={eenheid} totaal={data.funnel} potentie={data.pipeline} />
      </section>

      <section className={s.card}>
        <h2>Klant geworden per halfjaar</h2>
        <p className={s.uitleg}>Sinds 2026; scholen zonder bekende datum tellen niet mee.</p>
        <Halfjaren rijen={data.halfjaren} eenheid={eenheid} />
      </section>

      <section className={s.card}>
        <h2>Per bron / partner</h2>
        <p className={s.uitleg}>Zelfde eenheid als de schakelaar bovenaan. Elke rij is een deel van het totaal van die groep. Meerdere en Onbekend zitten erbij, zodat de percentages samen 100% zijn.</p>
        <div className={s.bronnen}>
          <BronDeel titel="Pipeline" rijen={bronnen} eenheid={eenheid} veld="pipeline" />
          <BronDeel titel="Klanten" rijen={bronnen} eenheid={eenheid} veld="klanten" />
        </div>
      </section>
    </div>
  );
}

function DoelBlok({ kaart, titel, eenheid, geselecteerd, leeg }: { kaart: DoelKaart | null; titel: string; eenheid: DashboardEenheid; geselecteerd: boolean; leeg: string }) {
  if (!kaart) return <div className={`${s.doel} ${geselecteerd ? s.aan : ""}`}><h3>{titel}</h3><p className={s.wanneer}>{leeg}</p></div>;
  const licenties = eenheid === "licenties";
  const gerealiseerd = licenties ? kaart.gerealiseerd.licenties : kaart.gerealiseerd.scholen;
  const doel = licenties ? kaart.doelLicenties : kaart.doelScholenIndicatie;
  const percentage = licenties ? kaart.percentageLicenties : kaart.percentageScholen;
  const tempo = licenties ? kaart.tempoLicenties : kaart.tempoScholen;
  const verschil = licenties ? kaart.verschilLicenties : kaart.verschilScholen;
  const prognose = licenties ? kaart.prognoseLicenties : kaart.prognoseScholen;
  const woord = licenties ? "licenties" : "scholen";
  return (
    <div className={`${s.doel} ${geselecteerd ? s.aan : ""}`}>
      <h3>{kaart.naam}</h3>
      <p className={s.wanneer}>{datum.format(new Date(kaart.startDatum))} – {datum.format(new Date(kaart.eindDatum))}</p>
      <div className={s.kop}><span>{nFlex(gerealiseerd)} / {nFlex(doel)} {woord}</span><strong>{precies.format(percentage)}%</strong></div>
      <div className={s.track}>
        <span className={s.fill} style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }} />
        <span className={s.tempo} style={{ left: `${Math.max(0, Math.min(100, kaart.periodeVerstrekenPercentage))}%` }} />
      </div>
      <p className={s.tempoLabel}>Waar we nu zouden moeten staan: {nFlex(tempo)} {woord}</p>
      <p className={tempoKlasse(verschil)}>{tempoTekst(verschil, woord)}</p>
      <p className={s.uitleg}>{precies.format(kaart.periodeVerstrekenPercentage)}% van de periode voorbij{prognose === null ? "" : ` · prognose aan het eind: ${nFlex(prognose)} ${woord}`}</p>
      {licenties ? null : <p className={s.uitleg}>Officieel doel: {n(kaart.doelLicenties)} licenties · indicatie {nFlex(kaart.doelScholenIndicatie)} scholen.</p>}
    </div>
  );
}

function nettoLabel(van: number) {
  if (van > 0) return `+${n(van)}`;
  if (van < 0) return `−${n(Math.abs(van))}`;
  return "0";
}

function NettoGrafiek({ maanden, eenheid }: { maanden: MaandRij[]; eenheid: DashboardEenheid }) {
  const zichtbaar = maanden.filter((maand) => !maand.correctie);
  const waarden = zichtbaar.map((maand) => waarde(maand.netto, eenheid));
  const schaal = Math.max(1, ...waarden.map((waardeGetal) => Math.abs(waardeGetal)));
  return (
    <>
      <div className={s.netto} aria-hidden="true">
        <div className={s.nul} />
        {zichtbaar.map((maand, index) => {
          const waardeGetal = waarden[index] ?? 0;
          const hoogte = `${Math.max(waardeGetal === 0 ? 0 : 2, (Math.abs(waardeGetal) / schaal) * 46)}%`;
          return (
            <div key={maand.sleutel} className={s.kolom}>
              <div className={waardeGetal >= 0 ? s.nettoOmhoog : s.nettoOmlaag} style={{ height: hoogte }} />
            </div>
          );
        })}
      </div>
      <div className={s.labels} aria-hidden="true">{zichtbaar.map((maand) => <span key={maand.sleutel}>{maand.label.split(" ").map((deel) => <span key={deel} style={{ display: "block" }}>{deel}</span>)}</span>)}</div>
    </>
  );
}

function OmvangGrafiek({ maanden, eenheid }: { maanden: PipelineMaandRij[]; eenheid: DashboardEenheid }) {
  const zichtbaar = maanden.filter((maand) => !maand.correctie);
  const waarden = zichtbaar.map((maand) => waarde(maand.eindstand, eenheid));
  const schaal = Math.max(1, ...waarden);
  return (
    <>
      <div className={s.grafiek} aria-hidden="true">
        {zichtbaar.map((maand, index) => (
          <div key={maand.sleutel} className={`${s.kolom} ${maand.isNu ? s.nu : ""}`}>
            <b>{n(waarden[index] ?? 0)}</b>
            <div className={s.staaf} style={{ height: `${Math.max(2, ((waarden[index] ?? 0) / schaal) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className={s.labels} aria-hidden="true">{zichtbaar.map((maand) => <span key={maand.sleutel}>{maand.label.split(" ").map((deel) => <span key={deel} style={{ display: "block" }}>{deel}</span>)}</span>)}</div>
    </>
  );
}

function BronDeel({ titel, rijen, eenheid, veld }: { titel: string; rijen: NieuwDashboardModel["bronnen"]; eenheid: DashboardEenheid; veld: "klanten" | "pipeline" }) {
  const gevuld = rijen.filter((rij) => waarde(rij[veld], eenheid) > 0);
  const percentages = aandelen(gevuld.map((rij) => waarde(rij[veld], eenheid)));
  const totaal = gevuld.reduce((som, rij) => som + waarde(rij[veld], eenheid), 0);
  return (
    <div>
      <h3 className={s.subkop}>{titel}</h3>
      {gevuld.length === 0 ? <p className={s.uitleg}>Geen {titel === "Pipeline" ? "pipeline" : "klanten"}.</p> : (
        <div className={s.scroll}>
          <table className={s.tabel}>
            <thead><tr><th>Bron</th><th className={s.num}>{eenheid === "licenties" ? "Licenties" : "Scholen"}</th><th className={s.num}>Aandeel</th></tr></thead>
            <tbody>
              {gevuld.map((rij, index) => <tr key={rij.naam}><td>{rij.naam}</td><td className={s.num}>{toon(rij[veld], eenheid)}</td><td className={s.num}>{precies.format(percentages[index] ?? 0)}%</td></tr>)}
              <tr><td><strong>Totaal</strong></td><td className={s.num}><strong>{n(totaal)}</strong></td><td className={s.num}><strong>100%</strong></td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Verschil({ van }: { van: number }) {
  if (van > 0) return <span className={s.omhoog}>▲ {n(van)}</span>;
  if (van < 0) return <span className={s.omlaag}>▼ {n(Math.abs(van))}</span>;
  return <span className={s.vlak}>gelijk</span>;
}

function FunnelBalken({ funnel, eenheid }: { funnel: FunnelStand; eenheid: DashboardEenheid }) {
  const max = Math.max(1, ...STAPPEN.map(([sleutel]) => waarde(funnel[sleutel], eenheid)));
  return (
    <>
      {STAPPEN.map(([sleutel, label, kleur], index) => {
        const volgende = STAPPEN[index + 1];
        const vanaf = STAPPEN.slice(index).reduce((som, [naam]) => som + waarde(funnel[naam], eenheid), 0);
        const tot = volgende ? STAPPEN.slice(index + 1).reduce((som, [naam]) => som + waarde(funnel[naam], eenheid), 0) : 0;
        const percentage = volgende ? doorstroom(vanaf, tot) : null;
        return (
          <div key={sleutel}>
            <div className={s.stap}>
              <div className={s.stapKop}><span><span className={`${s.punt} ${s[kleur]}`} />{label}</span><strong>{toon(funnel[sleutel], eenheid)}</strong></div>
              <div className={s.track}><span className={`${s.balk} ${s[kleur]}`} style={{ width: `${Math.max(2, (waarde(funnel[sleutel], eenheid) / max) * 100)}%` }} /></div>
            </div>
            {percentage === null ? null : <div className={s.door}>↓ {precies.format(percentage)}% heeft {volgende?.[1]} of verder bereikt</div>}
          </div>
        );
      })}
      <div className={s.grijs}>
        <div>Gestopt · <strong>{toon(funnel.gestopt, eenheid)}</strong></div>
        <div>Inactief · <strong>{toon(funnel.inactief, eenheid)}</strong></div>
        {funnel.overig.scholen > 0 ? <div>Overige status · <strong>{toon(funnel.overig, eenheid)}</strong></div> : null}
      </div>
    </>
  );
}

function Matrix({ typen, eenheid, totaal, potentie }: { typen: TypeRij[]; eenheid: DashboardEenheid; totaal: FunnelStand; potentie: Maat }) {
  const kolommen = ["lead", "prospect", "wacht", "klant"] as const;
  const maxima = {
    lead: Math.max(1, ...typen.map((rij) => waarde(rij.lead, eenheid))),
    prospect: Math.max(1, ...typen.map((rij) => waarde(rij.prospect, eenheid))),
    wacht: Math.max(1, ...typen.map((rij) => waarde(rij.wacht, eenheid))),
    klant: Math.max(1, ...typen.map((rij) => waarde(rij.klant, eenheid))),
    potentie: Math.max(1, ...typen.map((rij) => waarde(rij.potentie, eenheid))),
  };
  function cel(van: Maat, max: number) {
    const alpha = 0.08 + 0.42 * (waarde(van, eenheid) / max);
    return <td className={s.num} style={{ background: `rgba(21, 136, 201, ${alpha})` }}>{toon(van, eenheid)}</td>;
  }
  return (
    <div className={s.scroll}>
      <table className={s.tabel}>
        <thead><tr><th>Onderwijstype</th><th className={s.num}>Lead</th><th className={s.num}>Prospect</th><th className={s.num}>Wacht</th><th className={s.num}>Klant</th><th className={s.num}>Totaal potentie</th></tr></thead>
        <tbody>
          {typen.map((rij) => <tr key={rij.naam}><td>{rij.naam}</td>{kolommen.map((kolom) => <td key={kolom} className={s.num} style={{ background: `rgba(21, 136, 201, ${0.08 + 0.42 * (waarde(rij[kolom], eenheid) / maxima[kolom])})` }}>{toon(rij[kolom], eenheid)}</td>)}{cel(rij.potentie, maxima.potentie)}</tr>)}
          <tr><td><strong>Totaal</strong></td><td className={s.num}><strong>{toon(totaal.lead, eenheid)}</strong></td><td className={s.num}><strong>{toon(totaal.prospect, eenheid)}</strong></td><td className={s.num}><strong>{toon(totaal.wacht, eenheid)}</strong></td><td className={s.num}><strong>{toon(totaal.klant, eenheid)}</strong></td><td className={s.num}><strong>{toon(potentie, eenheid)}</strong></td></tr>
        </tbody>
      </table>
    </div>
  );
}

function Halfjaren({ rijen, eenheid }: { rijen: NieuwDashboardModel["halfjaren"]; eenheid: DashboardEenheid }) {
  const max = Math.max(1, ...rijen.map((rij) => waarde(rij.nieuw, eenheid)));
  return (
    <div className={s.half}>
      {rijen.map((rij) => (
        <div key={rij.label} className={`${s.halfRij} ${rij.lopend ? s.lopend : ""}`}>
          <span>{rij.label}{rij.lopend ? <span className={s.badge}>lopend</span> : null}</span>
          <div className={s.halfBalk}><span style={{ width: `${Math.max(rij.nieuw.scholen + rij.nieuw.licenties === 0 ? 0 : 2, (waarde(rij.nieuw, eenheid) / max) * 100)}%` }} /></div>
          <strong>{toon(rij.nieuw, eenheid)}</strong>
        </div>
      ))}
    </div>
  );
}
