import { describe, expect, it } from "vitest";
import { SCHOLEN_KOLOM } from "./monday-columns";
import {
  aandelen,
  bouwNieuwDashboard,
  bepaalDashboardKeuze,
  doorstroom,
  kalenderPeriode,
  parseHalfjaarLabel,
  splitsLabels,
  verzamelPaginas,
  waarde,
  type NieuwDashboardHistorie,
  type NieuwDashboardSchool,
} from "./nieuw-dashboard";

const NU = Date.parse("2026-10-29T12:00:00.000Z");

function school(gedeelte: Partial<NieuwDashboardSchool> & Pick<NieuwDashboardSchool, "id">): NieuwDashboardSchool {
  return {
    relatiestatus: "Klant",
    licenties: 0,
    onderwijstypen: [],
    bronnen: [],
    klantGeworden: null,
    aangemaaktOp: null,
    ...gedeelte,
  };
}

function overgang(id: string, op: string, van: string, naar: string): NieuwDashboardHistorie {
  return { mondayItemId: id, columnId: SCHOLEN_KOLOM.relatiestatus, occurredAt: op, previousValue: van, value: naar };
}

function licenties(id: string, op: string, van: number | null, naar: number | null): NieuwDashboardHistorie {
  return { mondayItemId: id, columnId: SCHOLEN_KOLOM.aantalLeerlingen, occurredAt: op, previousValue: van, value: naar, soort: "licenties" };
}

describe("nieuw dashboard — totalen, eenheid en meerdere waarden", () => {
  const scholen = [
    school({ id: "a", licenties: 100, onderwijstypen: ["Montessori"], bronnen: ["Direct"], relatiestatus: "Klant" }),
    school({ id: "b", licenties: 200, onderwijstypen: splitsLabels("Montessori, Dalton"), bronnen: splitsLabels("Direct, Beurs"), relatiestatus: "Prospect" }),
    school({ id: "c", licenties: 50, onderwijstypen: ["Dalton"], bronnen: [], relatiestatus: "Lead" }),
    school({ id: "d", licenties: 80, onderwijstypen: ["Montessori"], bronnen: ["Direct"], relatiestatus: "Gestopt" }),
    school({ id: "e", licenties: 10, onderwijstypen: ["SBO"], bronnen: ["Onbekend"], relatiestatus: "Pilot" }),
  ];
  const model = bouwNieuwDashboard({ scholen, historie: [], doelen: [], nu: NU, factor: 200 });

  it("telt elke school één keer, ook als Monday meerdere typen of bronnen in één cel heeft", () => {
    expect(model.funnel.prospect).toEqual({ scholen: 1, licenties: 200 });
    expect(model.funnel.lead).toEqual({ scholen: 1, licenties: 50 });
    expect(model.funnel.klant).toEqual({ scholen: 1, licenties: 100 });
    expect(model.klanten).toEqual(model.funnel.klant);
    expect(model.pipeline).toEqual({ scholen: 2, licenties: 250 });
    const meerdere = model.typen.find((rij) => rij.naam === "Meerdere");
    expect(meerdere?.prospect).toEqual({ scholen: 1, licenties: 200 });
    expect(model.typen.reduce((som, rij) => som + rij.prospect.scholen + rij.lead.scholen + rij.klant.scholen + rij.gestopt.scholen + rij.overig.scholen, 0)).toBe(scholen.length);
    expect(model.typen.reduce((som, rij) => som + rij.klant.licenties, 0)).toBe(100);
    expect(model.typen.reduce((som, rij) => som + rij.potentie.licenties, 0)).toBe(model.pipeline.licenties);
    const bronMeerdere = model.bronnen.find((rij) => rij.naam === "Meerdere");
    expect(bronMeerdere?.pipeline).toEqual({ scholen: 1, licenties: 200 });
    expect(model.bronnen.reduce((som, rij) => som + rij.klanten.licenties, 0)).toBe(model.klanten.licenties);
    expect(model.bronnen.reduce((som, rij) => som + rij.pipeline.scholen, 0)).toBe(model.pipeline.scholen);
    expect(model.bronnen.at(-1)?.naam).toBe("Onbekend");
    const pipelineRijen = model.bronnen.filter((rij) => rij.pipeline.licenties > 0);
    const klantRijen = model.bronnen.filter((rij) => rij.klanten.licenties > 0);
    expect(aandelen(pipelineRijen.map((rij) => rij.pipeline.licenties)).reduce((som, deel) => som + deel, 0)).toBe(100);
    expect(aandelen(klantRijen.map((rij) => rij.klanten.scholen)).reduce((som, deel) => som + deel, 0)).toBe(100);
    const correctie = model.pipelineMaanden.find((maand) => maand.correctie);
    expect(correctie?.eindstand).toEqual(model.pipeline);
  });

  it("wisselt de eenheid zonder de totalen uit elkaar te trekken", () => {
    expect(waarde(model.klanten, "licenties")).toBe(100);
    expect(waarde(model.klanten, "scholen")).toBe(1);
    expect(waarde(model.pipeline, "scholen")).toBe(2);
    expect(waarde(model.pipeline, "licenties")).toBe(250);
  });

  it("houdt gestopt en een onbekende status buiten de pipeline", () => {
    expect(model.funnel.gestopt.licenties).toBe(80);
    expect(model.funnel.overig.licenties).toBe(10);
    expect(model.pipeline.licenties).toBe(250);
  });
});

describe("pipeline per maand", () => {
  const scholen = [
    school({ id: "lead", relatiestatus: "Lead", licenties: 50, aangemaaktOp: "2026-03-04T10:00:00.000Z" }),
    school({ id: "door", relatiestatus: "Klant", licenties: 80 }),
    school({ id: "stop", relatiestatus: "Gestopt", licenties: 30 }),
    school({ id: "gat", relatiestatus: "Prospect", licenties: 20 }),
  ];
  const historie = [
    overgang("door", "2026-05-02T10:00:00.000Z", "", "Lead"),
    licenties("door", "2026-05-02T10:00:00.000Z", null, 80),
    overgang("door", "2026-06-15T10:00:00.000Z", "Lead", "Klant"),
    overgang("stop", "2026-07-01T10:00:00.000Z", "", "Prospect"),
    licenties("stop", "2026-07-01T10:00:00.000Z", null, 30),
    overgang("stop", "2026-08-01T10:00:00.000Z", "Prospect", "Gestopt"),
  ];
  const model = bouwNieuwDashboard({ scholen, historie, doelen: [], nu: NU, factor: 200 });

  it("laat de pipeline aansluiten en de huidige maand na correctie op Monday uitkomen", () => {
    const maart = model.pipelineMaanden.find((maand) => maand.sleutel === "2026-03");
    const mei = model.pipelineMaanden.find((maand) => maand.sleutel === "2026-05");
    const juni = model.pipelineMaanden.find((maand) => maand.sleutel === "2026-06");
    const augustus = model.pipelineMaanden.find((maand) => maand.sleutel === "2026-08");
    expect(maart?.nieuw.scholen).toBe(1);
    expect(mei?.nieuw).toEqual({ scholen: 1, licenties: 80 });
    expect(juni?.klantGeworden).toEqual({ scholen: 1, licenties: 80 });
    expect(augustus?.afgevallen).toEqual({ scholen: 1, licenties: 30 });
    const echte = model.pipelineMaanden.filter((maand) => !maand.correctie);
    for (let index = 1; index < echte.length; index++) {
      const vorige = echte[index - 1];
      const huidige = echte[index];
      if (!vorige || !huidige) continue;
      expect(huidige.eindstand.scholen).toBe(vorige.eindstand.scholen + huidige.netto.scholen);
      expect(huidige.eindstand.licenties).toBe(vorige.eindstand.licenties + huidige.netto.licenties);
    }
    const correctie = model.pipelineMaanden.find((maand) => maand.correctie);
    expect(correctie?.eindstand).toEqual(model.pipeline);
    expect(model.pipeline).toEqual({ scholen: 2, licenties: 70 });
  });
});
describe("aandelen", () => {
  it("laat de getoonde percentages samen op 100 uitkomen", () => {
    const delen = aandelen([1, 1, 1]);
    expect(delen.reduce((som, deel) => som + deel, 0)).toBeCloseTo(100);
    expect(aandelen([0, 0])).toEqual([0, 0]);
  });
});

describe("nieuw dashboard — maandverschil en halfjaar", () => {
  const scholen = [
    school({ id: "a", licenties: 120, onderwijstypen: ["Montessori"], bronnen: ["Direct"] }),
    school({ id: "b", licenties: 200, onderwijstypen: ["Dalton"], bronnen: ["Direct"] }),
    school({ id: "label", licenties: 50, onderwijstypen: ["Jenaplan"], bronnen: ["Website"], klantGeworden: "H1 2025" }),
    school({ id: "jaartal", licenties: 30, onderwijstypen: ["SBO"], bronnen: ["Website"], klantGeworden: "2024" }),
  ];
  const historie = [
    overgang("a", "2026-01-10T12:00:00.000Z", "Lead", "Klant"),
    licenties("a", "2026-01-10T12:00:00.000Z", 90, 100),
    overgang("b", "2026-03-10T12:00:00.000Z", "Prospect", "Klant"),
    licenties("b", "2026-03-10T12:00:00.000Z", null, 200),
    overgang("weg", "2026-02-02T12:00:00.000Z", "Lead", "Klant"),
    overgang("weg", "2026-02-20T12:00:00.000Z", "Klant", "Gestopt"),
    licenties("weg", "2026-02-02T12:00:00.000Z", null, 40),
  ];
  const model = bouwNieuwDashboard({
    scholen: [...scholen, school({ id: "weg", relatiestatus: "Gestopt", licenties: 40, onderwijstypen: ["Montessori"], bronnen: ["Direct"] })],
    historie,
    doelen: [
      { id: 1, naam: "H2 2026", startDatum: "2026-07-01", eindDatum: "2026-12-31", doelLicenties: 4200, actief: true },
      { id: 2, naam: "2026", startDatum: "2026-01-01", eindDatum: "2026-12-31", doelLicenties: 7800, actief: true },
      { id: 3, naam: "Kwartaal", startDatum: "2026-10-01", eindDatum: "2026-12-31", doelLicenties: 900, actief: true },
    ],
    nu: NU,
    factor: 200,
  });

  it("rekent erbij, eraf en netto zo dat de stand aansluit, met een zichtbare correctie naar Monday", () => {
    const jan = model.maanden.find((maand) => maand.sleutel === "2026-01");
    const feb = model.maanden.find((maand) => maand.sleutel === "2026-02");
    const mrt = model.maanden.find((maand) => maand.sleutel === "2026-03");
    expect(jan?.erbijScholen.map((regel) => regel.naam)).toContain("a");
    expect(jan?.erbijScholen.reduce((som, regel) => som + regel.licenties, 0)).toBe(jan?.erbij.licenties);
    expect(jan?.eraf).toEqual({ scholen: 0, licenties: 0 });
    expect(jan?.netto).toEqual({ scholen: 1, licenties: 100 });
    expect(feb?.erbij).toEqual({ scholen: 1, licenties: 40 });
    expect(feb?.eraf).toEqual({ scholen: 1, licenties: 40 });
    expect(feb?.netto).toEqual({ scholen: 0, licenties: 0 });
    expect(mrt?.erbij.licenties).toBe(200);
    const echte = model.maanden.filter((maand) => !maand.correctie);
    for (let index = 1; index < echte.length; index++) {
      const vorige = echte[index - 1];
      const huidige = echte[index];
      if (!vorige || !huidige) continue;
      expect(huidige.eindstand.licenties).toBe(vorige.eindstand.licenties + huidige.netto.licenties);
      expect(huidige.eindstand.scholen).toBe(vorige.eindstand.scholen + huidige.netto.scholen);
    }
    const correctie = model.maanden.find((maand) => maand.correctie);
    const laatste = echte[echte.length - 1];
    expect(correctie?.label).toBe("Correctie / onbekend");
    expect(laatste && correctie ? laatste.eindstand.licenties + correctie.netto.licenties : 0).toBe(model.klanten.licenties);
    expect(correctie?.eindstand).toEqual(model.klanten);
  });

  it("laat de stand van deze maand, na correctie, gelijk zijn aan de huidige klanten", () => {
    expect(model.klanten).toEqual({ scholen: 4, licenties: 400 });
    expect(model.maanden.find((maand) => maand.correctie)?.eindstand).toEqual(model.klanten);
  });

  it("bouwt eerdere maanden op uit bekende overgangen, inclusief wie daarna stopte", () => {
    const jan = model.maanden.find((maand) => maand.sleutel === "2026-01");
    const feb = model.maanden.find((maand) => maand.sleutel === "2026-02");
    expect(jan?.eindstand).toEqual({ scholen: 1, licenties: 100 });
    expect(feb?.eindstand).toEqual({ scholen: 1, licenties: 100 });
  });

  it("toont alleen halfjaren vanaf 2026 en slaat scholen zonder datum over", () => {
    expect(kalenderPeriode(Date.parse("2026-06-30T21:59:59.000Z"), "half").label).toBe("H1 2026");
    expect(kalenderPeriode(Date.parse("2026-06-30T22:00:00.000Z"), "half").label).toBe("H2 2026");
    expect(model.halfjaren.map((half) => half.label)).toEqual(["H1 2026", "H2 2026"]);
    expect(model.halfjaren.every((half) => half.nieuw.scholen === 0)).toBe(true);
    expect(model.kwaliteitTekst).toContain("geen klant-datum");
    expect(model.kwaliteitTekst).not.toContain("zonder maand");
  });

  it("telt klant-geworden halfjaren alleen uit de Monday-kolom", () => {
    const scholen = [
      ...Array.from({ length: 10 }, (_, index) => school({ id: `h1-${index}`, naam: `H1 school ${index}`, licenties: 10 + index, klantGeworden: "H1 2026" })),
      ...Array.from({ length: 5 }, (_, index) => school({ id: `h2-${index}`, naam: `H2 school ${index}`, licenties: 20, klantGeworden: "H2 2026" })),
      school({ id: "leeg", naam: "Zonder datum", licenties: 999, klantGeworden: null }),
      school({ id: "jaar", naam: "Alleen jaar", licenties: 50, klantGeworden: "2026" }),
      school({ id: "oud", naam: "Vorig jaar", licenties: 40, klantGeworden: "H2 2025" }),
    ];
    const historie = [overgang("leeg", "2026-02-01T12:00:00.000Z", "Lead", "Klant")];
    const uitkomst = bouwNieuwDashboard({ scholen, historie, doelen: [], nu: NU, factor: 200 });
    const h1 = uitkomst.halfjaren.find((half) => half.label === "H1 2026");
    const h2 = uitkomst.halfjaren.find((half) => half.label === "H2 2026");
    expect(h1?.nieuw.scholen).toBe(10);
    expect(h2?.nieuw.scholen).toBe(5);
    expect(h1?.nieuw.licenties).toBe(10 * 10 + (0 + 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9));
    expect(h2?.nieuw.licenties).toBe(100);
    expect(uitkomst.halfjaren.some((half) => half.label === "H2 2025")).toBe(false);
  });

  it("kiest het halfjaar- en het jaardoel op de lengte van de periode", () => {
    expect(model.doelen.half?.naam).toBe("H2 2026");
    expect(model.doelen.jaar?.naam).toBe("2026");
    expect(model.doelen.half?.maandDoelLicenties).toBe(700);
    expect(model.doelen.jaar?.maandDoelLicenties).toBe(650);
    expect(model.nieuwInPeriode.jaar.licenties).toBe(340);
    expect(model.doelen.jaar?.gerealiseerd.licenties).toBe(340);
  });
});

describe("labels, doorstroom en de dashboardkeuze", () => {
  it("herkent een halfjaarlabel en laat een los jaartal met rust", () => {
    expect(parseHalfjaarLabel("H2 2026")).toEqual({ half: 2, jaar: 2026 });
    expect(parseHalfjaarLabel("2025 H1")).toEqual({ half: 1, jaar: 2025 });
    expect(parseHalfjaarLabel("1e helft 2024")).toEqual({ half: 1, jaar: 2024 });
    expect(parseHalfjaarLabel("tweede halfjaar 2023")).toEqual({ half: 2, jaar: 2023 });
    expect(parseHalfjaarLabel("2024")).toEqual({ jaar: 2024, half: null });
    expect(parseHalfjaarLabel("Ja")).toBeNull();
  });

  it("berekent doorstroom over wie de fase of verder haalde", () => {
    expect(doorstroom(219, 164)).toBeCloseTo(74.8858);
    expect(doorstroom(0, 10)).toBeNull();
  });

  it("laat het huidige dashboard de standaard, en een query wint van de opgeslagen keuze", () => {
    expect(bepaalDashboardKeuze(null, null)).toBe("huidig");
    expect(bepaalDashboardKeuze(null, "nieuw")).toBe("nieuw");
    expect(bepaalDashboardKeuze("huidig", "nieuw")).toBe("huidig");
    expect(bepaalDashboardKeuze("nieuw", "huidig")).toBe("nieuw");
  });

  it("leest historie per pagina tot de laatste en meldt een afgekapte reeks", async () => {
    const compleet = await verzamelPaginas(async (page) => ({ docs: [page], hasNextPage: page < 2 }), 5);
    expect(compleet).toEqual({ docs: [1, 2], compleet: true });
    const afgekapt = await verzamelPaginas(async (page) => ({ docs: [page], hasNextPage: true }), 2);
    expect(afgekapt.compleet).toBe(false);
    expect(afgekapt.docs).toEqual([1, 2]);
  });
});
