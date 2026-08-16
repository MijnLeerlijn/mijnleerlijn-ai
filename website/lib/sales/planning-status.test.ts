import { describe, it, expect } from "vitest";
import { bepaalPlanningStatus, planningStatusSorteerRang, PLANNING_STATUS_SORTEER_RANG, type PlanningStatus } from "./planning-status";
import { vandaagIso, voegDagenToe } from "./format-datum";

// Sales-logica productiecorrectie 2026-08-16 (punt 2) — één centrale,
// deterministische planningsstatus. Prioriteit (opdrachtseis, harde
// volgorde): 1. open lokale Sales-actie, 2. geldige Monday-vervolgdatum,
// 3. pending AI-voorstel, 4. anders "actie nodig". Inactief/Gestopt/
// van-board-gehaald (actief:false) vallen volledig buiten dit systeem.
describe("bepaalPlanningStatus", () => {
  it("actief: false geeft altijd null terug, ongeacht welke andere signalen aanwezig zijn — Inactief/Gestopt/van-board-gehaald", () => {
    const resultaat = bepaalPlanningStatus({
      actief: false,
      openActieDatum: vandaagIso(),
      mondayVolgendeActieDatum: voegDagenToe(vandaagIso(), 10),
      heeftPendingVoorstel: true,
    });

    expect(resultaat).toEqual({ status: null, bron: null, datum: null });
  });

  describe("prioriteit 1 — open lokale Sales-actie", () => {
    it("actie-datum is vandaag -> status 'vandaag', bron 'sales'", () => {
      const resultaat = bepaalPlanningStatus({ actief: true, openActieDatum: vandaagIso() });
      expect(resultaat).toEqual({ status: "vandaag", bron: "sales", datum: vandaagIso() });
    });

    it("actie-datum ligt in het verleden -> status 'achterstallig', bron 'sales'", () => {
      const verlopen = voegDagenToe(vandaagIso(), -3);
      const resultaat = bepaalPlanningStatus({ actief: true, openActieDatum: verlopen });
      expect(resultaat).toEqual({ status: "achterstallig", bron: "sales", datum: verlopen });
    });

    it("actie-datum ligt in de toekomst -> status 'gepland', bron 'sales'", () => {
      const toekomst = voegDagenToe(vandaagIso(), 5);
      const resultaat = bepaalPlanningStatus({ actief: true, openActieDatum: toekomst });
      expect(resultaat).toEqual({ status: "gepland", bron: "sales", datum: toekomst });
    });

    it("een open lokale actie wint altijd van een aanwezige Monday-datum én een pending voorstel — prioriteit 1 boven 2/3", () => {
      const actieDatum = voegDagenToe(vandaagIso(), 2);
      const resultaat = bepaalPlanningStatus({
        actief: true,
        openActieDatum: actieDatum,
        mondayVolgendeActieDatum: voegDagenToe(vandaagIso(), 40),
        heeftPendingVoorstel: true,
      });
      expect(resultaat).toEqual({ status: "gepland", bron: "sales", datum: actieDatum });
    });
  });

  describe("prioriteit 2 — geldige Monday-vervolgdatum (geen lokale actie)", () => {
    it("een niet-verlopen Monday-datum -> status 'gepland', bron 'monday' — 'Springplank'-scenario (24 augustus)", () => {
      const mondayDatum = voegDagenToe(vandaagIso(), 8);
      const resultaat = bepaalPlanningStatus({ actief: true, mondayVolgendeActieDatum: mondayDatum });
      expect(resultaat).toEqual({ status: "gepland", bron: "monday", datum: mondayDatum });
    });

    it("vandaag zelf telt als nog geldig (niet verlopen)", () => {
      const resultaat = bepaalPlanningStatus({ actief: true, mondayVolgendeActieDatum: vandaagIso() });
      expect(resultaat.status).toBe("gepland");
      expect(resultaat.bron).toBe("monday");
    });

    it("een VERLOPEN Monday-datum telt niet mee — valt door naar prioriteit 3/4", () => {
      const verlopen = voegDagenToe(vandaagIso(), -10);
      const resultaat = bepaalPlanningStatus({ actief: true, mondayVolgendeActieDatum: verlopen, heeftPendingVoorstel: false });
      expect(resultaat.status).toBe("actie_nodig");
      expect(resultaat.bron).toBeNull();
    });

    it("wint van een pending voorstel (prioriteit 2 boven 3)", () => {
      const mondayDatum = voegDagenToe(vandaagIso(), 8);
      const resultaat = bepaalPlanningStatus({ actief: true, mondayVolgendeActieDatum: mondayDatum, heeftPendingVoorstel: true });
      expect(resultaat).toEqual({ status: "gepland", bron: "monday", datum: mondayDatum });
    });
  });

  describe("prioriteit 3 — pending AI-voorstel (geen lokale actie, geen geldige Monday-datum)", () => {
    it("heeftPendingVoorstel true -> status 'voorstel_te_beoordelen', bron 'ai', geen datum", () => {
      const resultaat = bepaalPlanningStatus({ actief: true, heeftPendingVoorstel: true });
      expect(resultaat).toEqual({ status: "voorstel_te_beoordelen", bron: "ai", datum: null });
    });
  });

  describe("prioriteit 4 — niets van het bovenstaande", () => {
    it("geen actie, geen geldige Monday-datum, geen voorstel -> status 'actie_nodig', geen bron, geen datum", () => {
      const resultaat = bepaalPlanningStatus({ actief: true });
      expect(resultaat).toEqual({ status: "actie_nodig", bron: null, datum: null });
    });
  });
});

describe("planningStatusSorteerRang", () => {
  it("meest urgent eerst: achterstallig < vandaag < actie_nodig < voorstel_te_beoordelen < gepland", () => {
    const volgorde: PlanningStatus[] = ["achterstallig", "vandaag", "actie_nodig", "voorstel_te_beoordelen", "gepland"];
    for (let i = 1; i < volgorde.length; i++) {
      expect(PLANNING_STATUS_SORTEER_RANG[volgorde[i - 1]!]).toBeLessThan(PLANNING_STATUS_SORTEER_RANG[volgorde[i]!]);
    }
  });

  it("null (buiten het systeem) sorteert altijd na elke echte status", () => {
    for (const status of Object.keys(PLANNING_STATUS_SORTEER_RANG) as PlanningStatus[]) {
      expect(planningStatusSorteerRang(null)).toBeGreaterThan(planningStatusSorteerRang(status));
    }
  });
});
