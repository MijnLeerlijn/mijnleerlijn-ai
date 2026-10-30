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

  it("telt de live Monday-labels 1e helft 2026 en 2e helft 2026", () => {
    const h1 = [
      ["Agora Kindcentrum JIJ", 60],
      ["Dordtse Vrijeschool", 273],
      ["De Lotus", 37],
      ["Alphense Montessorischool", 217],
      ["OBS de Gouwe", 26],
      ["CBS Willem Alexander", 170],
      ["De Regenboog Meidoornlaan (2)", 300],
      ["Basisschool Sterrenpad 't Ven", 178],
      ["Montessorischool de Basis", 150],
      ["Montessorischool de Kraal", 75],
    ] as const;
    const h2 = [
      ["Vrije School Schagen", 60],
      ["De Abeel", 305],
      ["Montessorikindcentrum Aan de Oosterplas", 374],
      ["Montessorischool Beverwijk", 317],
      ["Terrawijs", 40],
    ] as const;
    const scholen = [
      ...h1.map(([naam, licenties], index) => school({ id: `h1-${index}`, naam, licenties, relatiestatus: "Klant", klantGeworden: "1e helft 2026" })),
      ...h2.map(([naam, licenties], index) => school({ id: `h2-${index}`, naam, licenties, relatiestatus: "Klant", klantGeworden: "2e helft 2026" })),
      school({ id: "zeggelt", naam: "OMBS Het Zeggelt", licenties: 999, relatiestatus: "Wacht op handtekening", klantGeworden: "" }),
      school({ id: "prospect", naam: "Prospect met label", licenties: 500, relatiestatus: "Prospect", klantGeworden: "1e helft 2026" }),
    ];
    const uitkomst = bouwNieuwDashboard({ scholen, historie: [], doelen: [], nu: NU, factor: 200 });
    const eerste = uitkomst.halfjaren.find((half) => half.label === "H1 2026");
    const tweede = uitkomst.halfjaren.find((half) => half.label === "H2 2026");
    expect(eerste?.nieuw).toEqual({ scholen: 10, licenties: 1486 });
    expect(tweede?.nieuw).toEqual({ scholen: 5, licenties: 1096 });
    expect(eerste?.scholen).toHaveLength(10);
    expect(eerste?.scholen.map((item) => item.naam)).toEqual([...h1.map(([naam]) => naam)].sort((a, b) => a.localeCompare(b, "nl")));
    expect(eerste?.scholen.reduce((som, item) => som + item.licenties, 0)).toBe(1486);
    expect(eerste?.scholen.find((item) => item.naam === "OBS de Gouwe")?.licenties).toBe(26);
    expect(eerste?.scholen.some((item) => item.naam === "OMBS Het Zeggelt" || item.naam === "Prospect met label")).toBe(false);
    expect(tweede?.scholen.map((item) => [item.naam, item.licenties])).toEqual([
      ["De Abeel", 305],
      ["Montessorikindcentrum Aan de Oosterplas", 374],
      ["Montessorischool Beverwijk", 317],
      ["Terrawijs", 40],
      ["Vrije School Schagen", 60],
    ]);
  });

  it("telt OMBS Het Zeggelt niet: statusindex zonder labeltekst en Wacht op handtekening", () => {
    const uitkomst = bouwNieuwDashboard({
      scholen: [
        school({ id: "zeggelt", naam: "OMBS Het Zeggelt", licenties: 120, relatiestatus: "Wacht op handtekening", klantGeworden: "" }),
        school({ id: "index", naam: "Index zonder tekst", licenties: 80, relatiestatus: "Wacht op handtekening", klantGeworden: null }),
        school({ id: "wit", naam: "Alleen witruimte", licenties: 15, relatiestatus: "Klant", klantGeworden: "   " }),
        school({ id: "klant", naam: "Wel een klant", licenties: 40, relatiestatus: "Klant", klantGeworden: "1e helft 2026" }),
      ],
      historie: [],
      doelen: [],
      nu: NU,
      factor: 200,
    });
    const eerste = uitkomst.halfjaren.find((half) => half.label === "H1 2026");
    expect(eerste?.nieuw).toEqual({ scholen: 1, licenties: 40 });
    expect(eerste?.scholen.map((item) => item.naam)).toEqual(["Wel een klant"]);
  });

  it("telt een geldig label bij een prospect niet, en een gestopte klant wel", () => {
    const uitkomst = bouwNieuwDashboard({
      scholen: [
        school({ id: "prospect", naam: "Prospect met label", licenties: 500, relatiestatus: "Prospect", klantGeworden: "1e helft 2026" }),
        school({ id: "lead", naam: "Lead met alias", licenties: 40, relatiestatus: "Lead", klantGeworden: "H1 2026" }),
        school({ id: "wacht", naam: "Wacht met label", licenties: 70, relatiestatus: "Wacht op handtekening", klantGeworden: "2e helft 2026" }),
        school({ id: "gestopt", naam: "Gestopt met alias", licenties: 12, relatiestatus: "Gestopt", klantGeworden: "H1 2026" }),
        school({ id: "inactief", naam: "Inactief met label", licenties: 8, relatiestatus: "Inactief", klantGeworden: "2e helft 2026" }),
      ],
      historie: [],
      doelen: [],
      nu: NU,
      factor: 200,
    });
    const eerste = uitkomst.halfjaren.find((half) => half.label === "H1 2026");
    const tweede = uitkomst.halfjaren.find((half) => half.label === "H2 2026");
    expect(eerste?.nieuw).toEqual({ scholen: 1, licenties: 12 });
    expect(eerste?.scholen.map((item) => item.naam)).toEqual(["Gestopt met alias"]);
    expect(tweede?.nieuw).toEqual({ scholen: 1, licenties: 8 });
    expect(tweede?.scholen.map((item) => item.naam)).toEqual(["Inactief met label"]);
  });

  it("slaat het trainingsitem de Basis en de Kraal over, en telt de losse scholen wel", () => {
    const uitkomst = bouwNieuwDashboard({
      scholen: [
        school({ id: "basis", naam: "Montessorischool de Basis", licenties: 150, relatiestatus: "Klant", klantGeworden: "1e helft 2026" }),
        school({ id: "kraal", naam: "Montessorischool de Kraal", licenties: 75, relatiestatus: "Klant", klantGeworden: "1e helft 2026" }),
        school({ id: "12993435378", naam: "Montessorischool de Basis en de Kraal", licenties: 0, relatiestatus: "Klant", klantGeworden: "2e helft 2026" }),
        school({ id: "terrawijs", naam: "Terrawijs", licenties: 40, relatiestatus: "Klant", klantGeworden: "2e helft 2026" }),
      ],
      historie: [
        overgang("12993435378", "2026-08-15T10:00:00.000Z", "Lead", "Klant"),
        overgang("terrawijs", "2026-08-15T10:00:00.000Z", "Lead", "Klant"),
      ],
      doelen: [{ id: 1, naam: "H2 2026", startDatum: "2026-08-01", eindDatum: "2026-12-31", doelLicenties: 8000, actief: true }],
      nu: NU,
      factor: 200,
    });
    const eerste = uitkomst.halfjaren.find((half) => half.label === "H1 2026");
    const tweede = uitkomst.halfjaren.find((half) => half.label === "H2 2026");
    expect(eerste?.nieuw).toEqual({ scholen: 2, licenties: 225 });
    expect(eerste?.scholen.map((item) => item.naam)).toEqual(["Montessorischool de Basis", "Montessorischool de Kraal"]);
    expect(tweede?.nieuw).toEqual({ scholen: 1, licenties: 40 });
    expect(tweede?.scholen.map((item) => item.naam)).toEqual(["Terrawijs"]);
    expect(uitkomst.klanten).toEqual({ scholen: 3, licenties: 265 });
    expect(uitkomst.doelen.half?.gerealiseerd).toEqual({ scholen: 1, licenties: 40 });
    expect(uitkomst.pipeline.scholen).toBe(0);
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
    expect(parseHalfjaarLabel("1e helft 2026")).toEqual({ half: 1, jaar: 2026 });
    expect(parseHalfjaarLabel("2e helft 2026")).toEqual({ half: 2, jaar: 2026 });
    expect(parseHalfjaarLabel("1e helft 2024")).toEqual({ half: 1, jaar: 2024 });
    expect(parseHalfjaarLabel("   ")).toBeNull();
    expect(parseHalfjaarLabel("")).toBeNull();
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
