"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  conversie,
  doorstroom,
  waarde,
  type DashboardEenheid,
  type DashboardPeriode,
  type DoelKaart,
  type FunnelStand,
  type MaandRij,
  type Maat,
  type NieuwDashboardModel,
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
  const maandDoel = doel ? (licenties ? doel.maandDoelLicenties : doel.maandDoelScholen) : null;
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
          <span className={s.plus}>+{toon(data.dezeMaandNieuw, eenheid)} deze maand</span>
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
        <p className={s.uitleg}>Nieuwe {eenheidWoord} per maand, laatste 12 maanden, uit de eerste overgang naar Klant. {maandDoel === null ? "Er is geen doel, dus geen stippellijn." : `De stippellijn is het maanddeel van het doel (${nFlex(maandDoel)} ${eenheidWoord}).`} De stand van deze maand is de Monday-voorraad van nu. Eerdere maanden tellen alleen scholen met een bekende klant-datum.</p>
        <MaandGrafiek maanden={data.maanden} eenheid={eenheid} doel={maandDoel} periode={periode} periodeLabel={label} />
        <div className={s.scroll}>
          <table className={s.tabel}>
            <thead><tr><th>Maand</th><th className={s.num}>Nieuw</th><th className={s.num}>Verschil t.o.v. vorige maand</th><th className={s.num}>Totaal bij klanten eind van de maand</th></tr></thead>
            <tbody>
              {data.maanden.map((maand) => (
                <tr key={maand.sleutel} className={maand.isNu ? s.nu : undefined}>
                  <td>{maand.label}{maand.isNu ? <span className={s.badge}>nu</span> : null}</td>
                  <td className={s.num}>{toon(maand.nieuw, eenheid)}</td>
                  <td className={s.num}><Verschil van={waarde(maand.verschil, eenheid)} /></td>
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
        <p className={s.uitleg}>Nieuwe {eenheidWoord} van scholen die in dat halfjaar klant werden, op de eerste statusovergang. Een Monday-label zonder datum staat er los bij en telt niet in de balk.</p>
        <Halfjaren rijen={data.halfjaren} eenheid={eenheid} />
      </section>

      <section className={s.card}>
        <h2>Per bron / partner</h2>
        <p className={s.uitleg}>Huidige klanten en open pipeline per bron. Meerdere bronnen in één Monday-cel tellen één keer, bij Meerdere. Conversie is klanten gedeeld door klanten plus pipeline. Onbekend staat onderaan.</p>
        <div className={s.scroll}>
          <table className={s.tabel}>
            <thead><tr><th>Bron</th><th className={s.num}>Klanten</th><th className={s.num}>Pipeline</th><th className={s.num}>Conversie</th></tr></thead>
            <tbody>
              {bronnen.map((rij) => {
                const percentage = conversie(waarde(rij.klanten, eenheid), waarde(rij.pipeline, eenheid));
                return <tr key={rij.naam}><td>{rij.naam}</td><td className={s.num}>{toon(rij.klanten, eenheid)}</td><td className={s.num}>{toon(rij.pipeline, eenheid)}</td><td className={s.num}>{percentage === null ? "—" : `${precies.format(percentage)}%`}</td></tr>;
              })}
            </tbody>
          </table>
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

function MaandGrafiek({ maanden, eenheid, doel, periode, periodeLabel }: { maanden: MaandRij[]; eenheid: DashboardEenheid; doel: number | null; periode: DashboardPeriode; periodeLabel: string }) {
  const waarden = maanden.map((maand) => waarde(maand.nieuw, eenheid));
  const schaal = Math.max(1, ...waarden, doel ?? 0) * 1.12;
  return (
    <>
      <div className={s.grafiek} aria-hidden="true">
        {doel === null ? null : <div className={s.doellijn} style={{ bottom: `${(doel / schaal) * 100}%` }}><span>doel {nFlex(doel)} / maand</span></div>}
        {maanden.map((maand, index) => {
          const inPeriode = periode === "jaar" ? String(maand.jaar) === periodeLabel : `H${maand.half} ${maand.jaar}` === periodeLabel;
          return (
            <div key={maand.sleutel} className={`${s.kolom} ${inPeriode ? "" : s.buiten} ${maand.isNu ? s.nu : ""}`}>
              <b>{eenheid === "licenties" ? n(waarden[index] ?? 0) : nFlex(waarden[index] ?? 0)}</b>
              <div className={s.staaf} style={{ height: `${Math.max(2, ((waarden[index] ?? 0) / schaal) * 100)}%` }} />
            </div>
          );
        })}
      </div>
      <div className={s.labels} aria-hidden="true">{maanden.map((maand) => <span key={maand.sleutel}>{maand.label.split(" ").map((deel) => <span key={deel} style={{ display: "block" }}>{deel}</span>)}</span>)}</div>
    </>
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
          <strong>{toon(rij.nieuw, eenheid)}{rij.zonderMaand.scholen > 0 ? <span className={s.noot}> + {toon(rij.zonderMaand, eenheid)} zonder maand</span> : null}</strong>
        </div>
      ))}
    </div>
  );
}
